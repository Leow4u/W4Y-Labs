/**
 * Browser product shell — same-origin fetch + WS auth when the SPA is served
 * from the motor (Fly tenant) without Electron IPC.
 *
 * Installed once at startup before React boot; assigns window.hermesDesktop
 * so gateway boot and hermes.ts REST calls work unchanged.
 */
import { buildWayneWebSocketUrl } from '@hermes/shared'

import type {
  DesktopConnectionConfig,
  DesktopConnectionConfigInput,
  HermesApiRequest,
  HermesConnection,
  HermesNotification
} from '@/global'

const SESSION_HEADER = 'X-Wayne-Session-Token'

declare global {
  interface Window {
    __WAYNE_SESSION_TOKEN__?: string
    __WAYNE_BASE_PATH__?: string
    __WAYNE_AUTH_REQUIRED__?: boolean
  }
}

function readBasePath(): string {
  const raw = window.__WAYNE_BASE_PATH__ ?? ''
  if (!raw) {
    return ''
  }
  const withLead = raw.startsWith('/') ? raw : `/${raw}`
  return withLead.replace(/\/+$/, '')
}

function apiBase(): string {
  return `${window.location.origin}${readBasePath()}`
}

function setSessionHeader(headers: Headers): void {
  const token = window.__WAYNE_SESSION_TOKEN__
  if (token && !headers.has(SESSION_HEADER)) {
    headers.set(SESSION_HEADER, token)
  }
}

async function getWsTicket(): Promise<string> {
  const res = await fetch(`${apiBase()}/api/auth/ws-ticket`, {
    method: 'POST',
    credentials: 'include'
  })
  if (!res.ok) {
    throw new Error(`/api/auth/ws-ticket: HTTP ${res.status}`)
  }
  const body = (await res.json()) as { ticket?: string }
  if (!body.ticket) {
    throw new Error('WS ticket missing from /api/auth/ws-ticket')
  }
  return body.ticket
}

async function buildWsAuthParam(): Promise<readonly [string, string]> {
  if (window.__WAYNE_AUTH_REQUIRED__) {
    return ['ticket', await getWsTicket()]
  }
  return ['token', window.__WAYNE_SESSION_TOKEN__ ?? '']
}

async function buildWsUrl(path: string): Promise<string> {
  const authParam = await buildWsAuthParam()
  return buildWayneWebSocketUrl({
    path,
    basePath: readBasePath(),
    authParam
  })
}

async function browserApi<T>(request: HermesApiRequest): Promise<T> {
  const url = new URL(request.path, apiBase())
  if (request.profile) {
    url.searchParams.set('profile', request.profile)
  }

  const headers = new Headers({ Accept: 'application/json' })
  setSessionHeader(headers)

  const method = request.method ?? 'GET'
  const init: RequestInit = {
    method,
    headers,
    credentials: 'include'
  }

  if (request.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    headers.set('Content-Type', 'application/json')
    init.body = JSON.stringify(request.body)
  }

  const controller = new AbortController()
  const timeoutMs = request.timeoutMs ?? 60_000
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  init.signal = controller.signal

  try {
    const res = await fetch(url.toString(), init)

    if (res.status === 401) {
      let body: { error?: string; login_url?: string } = {}
      try {
        body = await res.clone().json()
      } catch {
        /* non-JSON */
      }
      if (
        (body.error === 'unauthenticated' || body.error === 'session_expired') &&
        body.login_url
      ) {
        try {
          sessionStorage.setItem('wayne.lastLocation', window.location.pathname + window.location.search)
        } catch {
          /* ignore */
        }
        window.location.assign(body.login_url)
        return new Promise<T>(() => {})
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`${res.status}: ${text || res.statusText}`)
    }

    if (res.status === 204) {
      return undefined as T
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      return (await res.json()) as T
    }

    return (await res.text()) as T
  } finally {
    window.clearTimeout(timer)
  }
}

async function browserGetBootProgress() {
  return {
    phase: 'ready',
    message: '',
    progress: 100,
    running: false,
    visible: false
  }
}

function noopUnsubscribe(): () => void {
  return () => undefined
}

async function browserCloudApi(args: {
  method?: string
  path: string
  body?: unknown
}): Promise<{ ok: boolean; status?: number; json?: unknown; error?: string }> {
  const methods = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])
  const method = methods.has((args.method || 'GET').toUpperCase())
    ? (args.method || 'GET').toUpperCase()
    : 'GET'
  const rawPath = args.path
  if (!/^\/api\//.test(rawPath) || /[\s\\]/.test(rawPath)) {
    return { ok: false, status: 0, error: 'bad-path' }
  }

  const base = apiBase()
  const url = new URL(rawPath, `${base.replace(/\/$/, '')}/`)
  const baseOrigin = new URL(base.includes('://') ? base : `https://${base}`).origin
  if (url.origin !== baseOrigin || !url.pathname.startsWith('/api/')) {
    return { ok: false, status: 0, error: 'bad-path' }
  }

  const headers = new Headers({ Accept: 'application/json' })
  setSessionHeader(headers)
  const init: RequestInit = { method, headers, credentials: 'include' }

  if (args.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    headers.set('Content-Type', 'application/json')
    init.body = JSON.stringify(args.body)
  }

  try {
    const res = await fetch(url.toString(), init)
    let json: unknown = null
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      json = await res.json().catch(() => null)
    }
    return {
      ok: res.ok,
      status: res.status,
      json,
      error: res.ok ? undefined : `HTTP ${res.status}`
    }
  } catch {
    return { ok: false, status: 0, error: 'network' }
  }
}

function platformOrigin(): string {
  const env = import.meta.env.VITE_PLATFORM_ORIGIN
  if (typeof env === 'string' && env.trim()) {
    return env.replace(/\/$/, '')
  }
  return 'https://work4you.ai'
}

function submitPlatformLogoutForm(): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `${platformOrigin()}/login/logout`
  form.style.display = 'none'
  document.body.appendChild(form)
  form.submit()
}

async function browserLogout(): Promise<{ ok: boolean }> {
  try {
    await fetch(`${apiBase()}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      redirect: 'manual'
    })
  } catch {
    /* best effort — motor session may already be gone */
  }
  submitPlatformLogoutForm()
  // Navigation in progress; keep spinner until unload.
  await new Promise<void>(() => {})
  return { ok: true }
}

async function browserCloudWsUrl(): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const url = await buildWsUrl('/api/ws')
    return { ok: true, url }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('401') || message.includes('unauthenticated')) {
      return { ok: false, error: 'not-logged-in' }
    }
    return { ok: false, error: 'network' }
  }
}

function installWork4YouDesktopBridge(): void {
  window.work4youDesktop = {
    isDesktop: false,
    platform: 'browser',
    cloud: {
      wsUrl: browserCloudWsUrl,
      api: browserCloudApi,
      canMutate: async () => true
    },
    w4y: {
      loginUrl: async () => `${window.location.origin}/login`,
      login: async () => ({ ok: false, reason: 'browser-sso' }),
      loginCancel: async () => ({ ok: true }),
      logout: browserLogout,
      hasKey: async () => ({ ok: true, hasKey: true }),
      probeSession: async () => ({ ok: true, loggedIn: true }),
      bootstrapApp: async () => ({ ok: true }),
      ensureCredentials: async () => ({ ok: true, hasKey: true }),
      updatePolicy: async () => ({})
    }
  }
}

function browserConnectionConfig(): DesktopConnectionConfig {
  return {
    envOverride: false,
    mode: 'remote',
    profile: null,
    remoteAuthMode: window.__WAYNE_AUTH_REQUIRED__ ? 'oauth' : 'token',
    remoteOauthConnected: true,
    remoteTokenPreview: null,
    remoteTokenSet: false,
    remoteUrl: apiBase()
  }
}

async function browserGetConnection(): Promise<HermesConnection> {
  const baseUrl = apiBase()
  const authMode = window.__WAYNE_AUTH_REQUIRED__ ? 'oauth' : 'token'
  const wsUrl = await buildWsUrl('/api/ws')

  return {
    authMode,
    baseUrl,
    isFullscreen: false,
    logs: [],
    mode: 'remote',
    nativeOverlayWidth: 0,
    source: 'local',
    token: window.__WAYNE_SESSION_TOKEN__ ?? '',
    windowButtonPosition: null,
    wsUrl
  }
}

export function installBrowserShell(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  if (window.hermesDesktop || window.work4youDesktop) {
    return false
  }
  if (import.meta.env.VITE_APP_SHELL !== 'browser') {
    return false
  }

  installWork4YouDesktopBridge()

  window.hermesDesktop = {
    api: browserApi,
    getConnection: browserGetConnection,
    getGatewayWsUrl: async () => buildWsUrl('/api/ws'),
    revalidateConnection: async () => ({ ok: true, rebuilt: false }),
    touchBackend: async () => ({ ok: true }),
    getBootProgress: browserGetBootProgress,
    onBootProgress: () => noopUnsubscribe(),
    onBackendExit: () => noopUnsubscribe(),
    profile: {
      get: async () => ({ profile: null }),
      set: async () => ({ profile: null })
    },
    notify: async (payload?: HermesNotification) => {
      if (typeof Notification === 'undefined' || Notification.permission === 'denied') {
        return false
      }
      if (Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      if (Notification.permission !== 'granted') {
        return false
      }
      new Notification(payload?.title || 'Work4You', { body: payload?.body || '' })
      return true
    },
    openExternal: async (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    writeClipboard: async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        return false
      }
    },
    sanitizeWorkspaceCwd: async (cwd?: null | string) => ({ cwd: cwd?.trim() || '', sanitized: false }),
    getRecentLogs: async () => ({ path: '', lines: [] }),
    revealLogs: async () => ({ ok: false, path: '', error: 'browser-shell' }),
    resetBootstrap: async () => ({ ok: true }),
    repairBootstrap: async () => ({ ok: true }),
    getConnectionConfig: async () => browserConnectionConfig(),
    probeConnectionConfig: async () => ({ ok: true, providers: [] }),
    oauthLoginConnectionConfig: async () => ({ connected: false }),
    applyConnectionConfig: async (_payload: DesktopConnectionConfigInput) => browserConnectionConfig(),
    settings: {
      getDefaultProjectDir: async () => ({ defaultLabel: '', dir: null, resolvedCwd: '' }),
      pickDefaultProjectDir: async () => ({ canceled: true, dir: null }),
      setDefaultProjectDir: async () => ({ dir: null })
    }
  } as typeof window.hermesDesktop

  return true
}
