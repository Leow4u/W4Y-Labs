import { type ConnectionState, type GatewayEvent, resolveGatewayWsUrl } from '@hermes/shared'
import { atom } from 'nanostores'

import { HermesGateway } from '@/hermes'
import { mintCloudWsUrl } from '@/lib/w4y-cloud-projects'
import { setGatewayState } from '@/store/session'

// ── Multi-profile gateway routing ──────────────────────────────────────────
// Concurrent sessions across profiles need concurrent sockets: the renderer's
// event handler is already session-keyed, so the only thing stopping two
// profiles streaming at once was the single swapping socket. We keep that one
// socket as the PRIMARY (window) backend — owned by use-gateway-boot, with all
// its boot-progress / sleep-wake machinery — and add one persistent SECONDARY
// socket per *other* profile that has live work. Every socket feeds the same
// handleGatewayEvent, so background sessions keep painting. Single-profile users
// only ever have the primary, so their path is byte-for-byte unchanged.
//
// Cloud 24/7: a special secondary keyed by CLOUD_BRAIN_KEY mints WS tickets via
// work4youDesktop.cloud (not hermesDesktop.getConnection). Local projects.* RPC
// stays on primaryBrainGateway() so the sidebar never talks to Fly by accident.

/** Synthetic profile key for the Work4You cloud gateway socket. */
export const CLOUD_BRAIN_KEY = '__w4y_cloud__'

const normKey = (profile: string | null | undefined): string => (profile ?? '').trim() || 'default'

// Read connection state through a call so TS control-flow analysis doesn't
// narrow the getter to a constant across guards (it genuinely changes).
const isOpen = (gateway: HermesGateway | null): boolean => gateway?.connectionState === 'open'

// The active gateway instance, exposed for inline message-stream components
// (e.g. inline ClarifyTool, model overlays) that call gateway methods without
// the instance threaded down through props.
export const $gateway = atom<HermesGateway | null>(null)

interface RegistryConfig {
  onEvent: (event: GatewayEvent) => void
}

let config: RegistryConfig | null = null

export function configureGatewayRegistry(cfg: RegistryConfig): void {
  config = cfg
}

// ── Primary (window) backend ───────────────────────────────────────────────
let primaryGateway: HermesGateway | null = null
let primaryProfile = 'default'

export function setPrimaryGateway(gateway: HermesGateway | null, profile = 'default'): void {
  primaryGateway = gateway
  primaryProfile = normKey(profile)
}

// ── Secondary (pool) backends ──────────────────────────────────────────────
interface Secondary {
  profile: string
  gateway: HermesGateway
  offEvent: () => void
  offState: () => void
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectAttempt: number
  reconnecting: boolean
  // While true the entry auto-reconnects on drop; pruning flips it off so a
  // deliberate close doesn't trigger the backoff loop.
  wantOpen: boolean
}

const secondaries = new Map<string, Secondary>()

let activeKey = 'default'

export function isActivePrimary(): boolean {
  return activeKey === primaryProfile
}

export function activeGateway(): HermesGateway | null {
  if (activeKey === primaryProfile) {
    return primaryGateway
  }

  return secondaries.get(activeKey)?.gateway ?? primaryGateway
}

/** Always the local/window backend — used by projects.* and other PC-scoped RPC. */
export function primaryBrainGateway(): HermesGateway | null {
  return primaryGateway
}

export function isCloudBrainActive(): boolean {
  return activeKey === CLOUD_BRAIN_KEY
}

// Mirror a backend's connection state into the global composer state, but only
// when that backend is the one the user is currently looking at. Lets the
// composer reflect the active profile's socket without a background reconnect
// flipping the foreground enabled/disabled state.
function reportGatewayState(profile: string, state: ConnectionState): void {
  if (normKey(profile) === activeKey) {
    setGatewayState(state)
  }
}

export function reportPrimaryGatewayState(state: ConnectionState): void {
  reportGatewayState(primaryProfile, state)
}

function setActive(profile: string): void {
  activeKey = normKey(profile)
  const gateway = activeGateway()
  $gateway.set(gateway)
  setGatewayState(gateway?.connectionState ?? 'closed')
}

function clearTimer(entry: Secondary): void {
  if (entry.reconnectTimer !== null) {
    clearTimeout(entry.reconnectTimer)
    entry.reconnectTimer = null
  }
}

async function openSecondary(entry: Secondary): Promise<void> {
  if (entry.profile === CLOUD_BRAIN_KEY) {
    // Tickets are one-shot (~30s TTL) — mint fresh on every connect/reconnect.
    const wsUrl = await mintCloudWsUrl()
    await entry.gateway.connect(wsUrl)
    return
  }

  const desktop = window.hermesDesktop

  if (!desktop) {
    return
  }

  const conn = await desktop.getConnection(entry.profile)
  const wsUrl = await resolveGatewayWsUrl(desktop, conn)
  await entry.gateway.connect(wsUrl)
  void desktop.touchBackend?.(entry.profile).catch(() => undefined)
}

function scheduleReconnect(entry: Secondary): void {
  if (entry.reconnecting || entry.reconnectTimer !== null || !entry.wantOpen) {
    return
  }

  // 1s, 2s, 4s … capped at 15s — same backoff shape as the primary.
  const delay = Math.min(15_000, 1_000 * 2 ** Math.min(entry.reconnectAttempt, 4))
  entry.reconnectAttempt += 1
  entry.reconnectTimer = setTimeout(() => {
    entry.reconnectTimer = null
    void reconnectSecondary(entry)
  }, delay)
}

async function reconnectSecondary(entry: Secondary): Promise<void> {
  if (entry.reconnecting || !entry.wantOpen || isOpen(entry.gateway)) {
    return
  }

  entry.reconnecting = true

  try {
    await openSecondary(entry)
    entry.reconnectAttempt = 0
  } catch {
    // Transport failure → fall through to the backoff below.
  } finally {
    entry.reconnecting = false

    if (entry.wantOpen && !isOpen(entry.gateway)) {
      scheduleReconnect(entry)
    }
  }
}

function createSecondary(profile: string): Secondary {
  const gateway = new HermesGateway()

  const entry: Secondary = {
    profile,
    gateway,
    offEvent: () => {},
    offState: () => {},
    reconnectTimer: null,
    reconnectAttempt: 0,
    reconnecting: false,
    wantOpen: true
  }

  entry.offEvent = gateway.onEvent(event => config?.onEvent(event))
  entry.offState = gateway.onState(state => {
    reportGatewayState(profile, state)

    if (state === 'open') {
      entry.reconnectAttempt = 0
      clearTimer(entry)
    } else if ((state === 'closed' || state === 'error') && entry.wantOpen) {
      scheduleReconnect(entry)
    }
  })

  secondaries.set(profile, entry)

  return entry
}

// Make `profile` the active gateway, lazily opening its socket if needed. The
// primary is a no-op fast path. Background sockets are never closed here.
export async function ensureGatewayForProfile(profile: string): Promise<void> {
  const key = normKey(profile)

  if (key === primaryProfile) {
    setActive(key)

    return
  }

  let entry = secondaries.get(key)

  if (!entry) {
    entry = createSecondary(key)
  }

  entry.wantOpen = true

  if (!isOpen(entry.gateway)) {
    clearTimer(entry)
    entry.reconnectAttempt = 0

    try {
      await openSecondary(entry)
    } catch {
      scheduleReconnect(entry)
    }
  }

  setActive(key)
}

/** Route chat RPC to the Work4You cloud brain (Fly). */
export async function ensureCloudBrainActive(): Promise<void> {
  await ensureGatewayForProfile(CLOUD_BRAIN_KEY)
}

/** Route chat RPC back to the local/window Hermes backend. */
export async function ensureLocalBrainActive(): Promise<void> {
  setActive(primaryProfile)
}

// Reconnect the active gateway after a transient request failure. Primary
// reconnects are owned by use-gateway-boot, so we only drive secondaries here.
export async function ensureActiveGatewayOpen(): Promise<HermesGateway | null> {
  if (activeKey === primaryProfile) {
    return primaryGateway
  }

  const entry = secondaries.get(activeKey)

  if (!entry) {
    return null
  }

  if (!isOpen(entry.gateway)) {
    await reconnectSecondary(entry)
  }

  return isOpen(entry.gateway) ? entry.gateway : null
}

/** Reconnect helper for the local projects.* brain (never the cloud socket). */
export async function ensurePrimaryBrainOpen(): Promise<HermesGateway | null> {
  return primaryGateway?.connectionState === 'open' ? primaryGateway : primaryGateway
}

// Wake signal (sleep/network/visibility): nudge every live secondary back open.
export function reconnectSecondaryGateways(): void {
  for (const entry of secondaries.values()) {
    if (!entry.wantOpen || isOpen(entry.gateway)) {
      continue
    }

    entry.reconnectAttempt = 0
    clearTimer(entry)
    void reconnectSecondary(entry)
  }
}

// Keep the idle reaper from killing a backend we still need: ping every live
// secondary. The active one is pinged separately (touchActiveGatewayBackend).
export function touchSecondaryGateways(): void {
  const desktop = window.hermesDesktop

  for (const entry of secondaries.values()) {
    if (!entry.wantOpen || entry.profile === CLOUD_BRAIN_KEY) {
      continue
    }

    void desktop?.touchBackend?.(entry.profile).catch(() => undefined)
  }
}

// Close + evict secondaries whose profile is neither active nor in `keep`
// (profiles with a running / needs-input session). Bounds cost to live work.
export function pruneSecondaryGateways(keep: Set<string>): void {
  for (const [key, entry] of [...secondaries]) {
    if (key === activeKey || keep.has(key)) {
      continue
    }

    entry.wantOpen = false
    clearTimer(entry)
    entry.offEvent()
    entry.offState()
    entry.gateway.close()
    secondaries.delete(key)
  }
}

export function closeSecondaryGateways(): void {
  for (const entry of secondaries.values()) {
    entry.wantOpen = false
    clearTimer(entry)
    entry.offEvent()
    entry.offState()
    entry.gateway.close()
  }

  secondaries.clear()
}
