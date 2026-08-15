/**
 * Interactive shell on the tenant motor via /api/pty (browser + Electron cloud sessions).
 */
import { buildWayneWebSocketUrl } from '@hermes/shared'

const SESSION_HEADER = 'X-Wayne-Session-Token'

function readBasePath(): string {
  const raw = window.__WAYNE_BASE_PATH__ ?? ''
  if (!raw) {
    return ''
  }
  const withLead = raw.startsWith('/') ? raw : `/${raw}`
  return withLead.replace(/\/+$/, '')
}

async function wsTicket(): Promise<string> {
  const res = await fetch(`${window.location.origin}${readBasePath()}/api/auth/ws-ticket`, {
    method: 'POST',
    credentials: 'include'
  })
  if (!res.ok) {
    throw new Error(`/api/auth/ws-ticket: HTTP ${res.status}`)
  }
  const body = (await res.json()) as { ticket?: string }
  if (!body.ticket) {
    throw new Error('WS ticket missing')
  }
  return body.ticket
}

async function ptyWsUrl(): Promise<string> {
  const authParam = window.__WAYNE_AUTH_REQUIRED__
    ? (['ticket', await wsTicket()] as const)
    : (['token', window.__WAYNE_SESSION_TOKEN__ ?? ''] as const)

  return buildWayneWebSocketUrl({
    path: '/api/pty',
    basePath: readBasePath(),
    authParam
  })
}

export interface RemotePtyHandle {
  dispose: () => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  onData: (handler: (data: string) => void) => () => void
  onExit: (handler: () => void) => () => void
}

export async function connectRemotePty(): Promise<RemotePtyHandle> {
  const url = await ptyWsUrl()
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Remote PTY WebSocket failed'))
    }
    const onClose = () => {
      cleanup()
      reject(new Error('Remote PTY WebSocket closed before open'))
    }
    const cleanup = () => {
      ws.removeEventListener('open', onOpen)
      ws.removeEventListener('error', onError)
      ws.removeEventListener('close', onClose)
    }
    ws.addEventListener('open', onOpen)
    ws.addEventListener('error', onError)
    ws.addEventListener('close', onClose)
  })

  const dataHandlers = new Set<(data: string) => void>()
  const exitHandlers = new Set<() => void>()
  let closed = false

  const notifyExit = () => {
    if (closed) {
      return
    }
    closed = true
    exitHandlers.forEach(fn => fn())
  }

  ws.addEventListener('message', event => {
    const chunk =
      typeof event.data === 'string'
        ? event.data
        : new TextDecoder().decode(event.data as ArrayBuffer)
    dataHandlers.forEach(fn => fn(chunk))
  })

  ws.addEventListener('close', notifyExit)
  ws.addEventListener('error', notifyExit)

  return {
    dispose: () => {
      closed = true
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    },
    write: data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    },
    resize: (cols, rows) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\x1b[RESIZE:${cols};${rows}]`)
      }
    },
    onData: handler => {
      dataHandlers.add(handler)
      return () => dataHandlers.delete(handler)
    },
    onExit: handler => {
      exitHandlers.add(handler)
      return () => exitHandlers.delete(handler)
    }
  }
}
