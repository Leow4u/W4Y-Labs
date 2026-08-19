/**
 * Work4You account gate — desktop must have a **tenant** session before the
 * product UI. Logout returns here.
 *
 * Identity is `$accountSession` (`/api/auth/me`). An OpenRouter key on disk is
 * model access, not proof of login — treating it as such left the gate open
 * while every tenant surface said "Sem sessão" (17/08).
 *
 * Safety (must never leave the user stranded after a chip update):
 * - Cheap `/me` first — if cookies survived, open immediately.
 * - 401 / signed-out → Continuar immediately (do not wait on Python or heal).
 * - 5xx / network: credential heal is budgeted; after the budget we show Continuar.
 * - A late heal that restores the tenant still opens the gate.
 * - Concurrent refresh calls share one in-flight promise.
 */
import { atom } from 'nanostores'

import { cloudRunAvailable } from '@/lib/w4y-cloud-projects'

import {
  type AccountSessionProbe,
  accountSessionSignedIn,
  clearAccountSession,
  probeAccountSession,
  refreshAccountSession
} from './account-session'

export type AccountGatePhase = 'checking' | 'idle' | 'required' | 'signing-in'

export interface AccountGateState {
  error: null | string
  phase: AccountGatePhase
}

/** Hard ceiling for boot heal. Fly wake + SSO can be slow; past this the user
 *  must see Continuar — never an endless "A verificar sessão…". */
export const ACCOUNT_GATE_CHECK_BUDGET_MS = 20_000

export function w4yAccountGateEnabled(): boolean {
  return cloudRunAvailable()
}

/** Work4You product (platform account + bundled model access), desktop or browser SPA. */
export function isWork4YouProduct(): boolean {
  if (import.meta.env.VITE_APP_SHELL === 'browser') {
    return true
  }

  return cloudRunAvailable()
}

export const $accountGate = atom<AccountGateState>({
  phase: w4yAccountGateEnabled() ? 'checking' : 'idle',
  error: null
})

export function accountGateBlocksApp(phase: AccountGatePhase): boolean {
  return phase === 'checking' || phase === 'required' || phase === 'signing-in'
}

/**
 * Gateway boot must not mint WS tickets while the gate is still healing SSO.
 * Returns true when the tenant session is ready; false when sign-in owns the UX.
 */
export async function whenAccountGateReady(): Promise<boolean> {
  if (!w4yAccountGateEnabled()) {
    return true
  }

  const phase = $accountGate.get().phase
  if (phase === 'idle') {
    return true
  }
  if (phase === 'required' || phase === 'signing-in') {
    return false
  }

  return refreshAccountGate()
}

let gateRefreshInFlight: Promise<boolean> | null = null

async function markGateOpen(): Promise<void> {
  const { ensurePlatformOnboardingComplete } = await import('./onboarding')
  ensurePlatformOnboardingComplete()
  $accountGate.set({ phase: 'idle', error: null })
  try {
    const { ensureWork4YouCloudAfterAuth } = await import('./connections')
    await ensureWork4YouCloudAfterAuth()
  } catch {
    /* registry refresh is best-effort */
  }
  try {
    const { ensureCloudBrainActive } = await import('./gateway')
    await ensureCloudBrainActive()
  } catch {
    /* gateway boot / gate listener retries connect */
  }
}

function healCredentialsInBackground(): void {
  const ensure = window.work4youDesktop?.w4y?.ensureCredentials
  if (!ensure) {
    return
  }
  void Promise.resolve(ensure()).catch(() => undefined)
}

/** Heal may still mint cookies after Continuar is already on screen. */
function openGateIfHealRestoresSession(heal: Promise<unknown>): void {
  void heal.then(async () => {
    if ($accountGate.get().phase !== 'required') {
      return
    }
    try {
      if (await refreshAccountSession()) {
        await markGateOpen()
      }
    } catch {
      /* stay on Continuar */
    }
  })
}

/**
 * Heal credentials first (tenant SSO + Composio key when possible), then ask
 * the tenant who we are. The gate opens only on that answer — but never waits
 * unbounded on heal (post-update relaunch used to strand users on checking).
 *
 * Not `async`: callers must share the same in-flight Promise reference when
 * gate + desktop-controller both refresh on mount.
 */
export function refreshAccountGate(): Promise<boolean> {
  if (!w4yAccountGateEnabled()) {
    $accountGate.set({ phase: 'idle', error: null })
    return Promise.resolve(true)
  }

  if (gateRefreshInFlight) {
    return gateRefreshInFlight
  }

  gateRefreshInFlight = runRefreshAccountGate().finally(() => {
    gateRefreshInFlight = null
  })
  return gateRefreshInFlight
}

async function runRefreshAccountGate(): Promise<boolean> {
  $accountGate.set({ phase: 'checking', error: null })

  let probe: AccountSessionProbe
  try {
    probe = await probeAccountSession()
  } catch {
    probe = 'unavailable'
  }

  // Cookies still good after relaunch — enter now; heal is not the product path.
  if (probe === 'signed-in') {
    await markGateOpen()
    healCredentialsInBackground()
    return true
  }

  const ensure = window.work4youDesktop?.w4y?.ensureCredentials
  const heal = ensure
    ? Promise.resolve(ensure()).catch(() => null)
    : Promise.resolve(null)

  // First-run / logged-out: Continuar immediately. Do not wait on Python,
  // Fly wake, or a hanging ensureCredentials (that was the eternal spinner).
  if (probe === 'signed-out') {
    $accountGate.set({ phase: 'required', error: null })
    openGateIfHealRestoresSession(heal)
    return false
  }

  // 5xx / network / missing bridge — cookies might still appear after wake.
  let timedOut = false
  await Promise.race([
    heal,
    new Promise<void>(resolve => {
      setTimeout(() => {
        timedOut = true
        resolve()
      }, ACCOUNT_GATE_CHECK_BUDGET_MS)
    })
  ])

  try {
    if (await refreshAccountSession()) {
      await markGateOpen()
      return true
    }
  } catch {
    /* required below */
  }

  // Fail-open to the Continuar screen — never leave checking forever.
  $accountGate.set({ phase: 'required', error: null })

  if (timedOut) {
    openGateIfHealRestoresSession(heal)
  }

  return false
}

export function requireAccountLogin() {
  if (!w4yAccountGateEnabled()) {
    return
  }

  clearAccountSession()
  $accountGate.set({ phase: 'required', error: null })
}

export async function signInToWork4You(): Promise<boolean> {
  const login = window.work4youDesktop?.w4y?.login

  if (!login) {
    return false
  }

  $accountGate.set({ phase: 'signing-in', error: null })

  try {
    const res = await login()

    if (!res?.ok) {
      const reason = res?.reason || 'login-failed'
      if (reason === 'cancelled') {
        $accountGate.set({ phase: 'required', error: null })
        return false
      }
      throw new Error(reason)
    }

    // Soft motor restart (same account home) returns here. Full relaunch exits
    // the process before this line — cold start then runs refreshAccountGate.
    const gateOpen = await refreshAccountGate()
    if (gateOpen) {
      try {
        const { ensureWork4YouCloudAfterAuth } = await import('./connections')
        await ensureWork4YouCloudAfterAuth()
      } catch {
        /* registry refresh is best-effort */
      }
      try {
        const { ensureCloudBrainActive } = await import('./gateway')
        await ensureCloudBrainActive()
      } catch {
        /* reconnect retries from boot / visibility */
      }
      return true
    }

    // Handoff wrote the key but the tenant still does not know us — keep the
    // gate up with an error rather than pretending hasKey is enough.
    if (res.tenantSession === false) {
      $accountGate.set({
        phase: 'required',
        error: 'tenant-session-failed'
      })
      return false
    }

    window.location.reload()
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    $accountGate.set({ phase: 'required', error: message })
    return false
  }
}

export async function signOutFromWork4You(): Promise<void> {
  const logout = window.work4youDesktop?.w4y?.logout

  if (logout) {
    await logout()
  }

  const { resetOnboardingAfterLogout } = await import('./onboarding')
  resetOnboardingAfterLogout()
  requireAccountLogin()
}

/** @deprecated Prefer accountSessionSignedIn — kept for call sites mid-migration. */
export function isAccountGateSignedIn(): boolean {
  return accountSessionSignedIn()
}
