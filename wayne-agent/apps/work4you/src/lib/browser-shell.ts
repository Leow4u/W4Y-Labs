/**
 * Browser product shell — same-origin fetch + WS auth when the SPA is served
 * from the motor (Fly tenant) without Electron IPC.
 *
 * Installed once at startup before React boot; assigns window.hermesDesktop
 * so gateway boot and hermes.ts REST calls work unchanged.
 */
import { buildWayneWebSocketUrl } from '@hermes/shared'

import type { HermesApiRequest, HermesConnection, HermesNotification } from '@/global'

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
  if (window.hermesDesktop) {
    return false
  }
  if (import.meta.env.VITE_APP_SHELL !== 'browser') {
    return false
  }

  window.hermesDesktop = {
    api: browserApi,
    getConnection: browserGetConnection,
    getGatewayWsUrl: async () => buildWsUrl('/api/ws'),
    revalidateConnection: async () => ({ ok: true, rebuilt: false }),
    touchBackend: async () => ({ ok: true }),
    getBootProgress: async () => ({
      phase: 'ready',
      message: '',
      progress: 100,
      running: false,
      visible: false
    }),
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
    settings: {
      getDefaultProjectDir: async () => ({ defaultLabel: '', dir: null, resolvedCwd: '' }),
      pickDefaultProjectDir: async () => ({ canceled: true, dir: null }),
      setDefaultProjectDir: async () => ({ dir: null })
    }
  } as typeof window.hermesDesktop

  return true
}
