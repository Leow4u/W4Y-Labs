import type {
  ConnectorCatalogResponse,
  ConnectorConnectResponse,
  ConnectorStatusResponse
} from './connectors-types'

type CloudApiResult = {
  ok: boolean
  status?: number
  json?: unknown
  error?: string
}

type Work4YouDesktop = {
  cloud?: {
    api: (args: { method?: string; path: string; body?: unknown }) => Promise<CloudApiResult>
  }
}

/**
 * Prefer the cloud account brain when logged in (same cookies as login);
 * fall back to the local wayne serve worker so signed-out desktop still works.
 */
async function connectorsRequest<T>(opts: {
  path: string
  method?: string
  body?: unknown
  timeoutMs?: number
}): Promise<T> {
  const cloud = (window as Window & { work4youDesktop?: Work4YouDesktop }).work4youDesktop?.cloud?.api
  if (cloud) {
    try {
      const res = await cloud({
        method: opts.method || 'GET',
        path: opts.path,
        body: opts.body
      })
      if (res?.ok && res.json != null) return res.json as T
    } catch {
      /* fall through to local */
    }
  }

  return window.hermesDesktop.api<T>({
    path: opts.path,
    method: opts.method,
    body: opts.body,
    timeoutMs: opts.timeoutMs
  })
}

export function getConnectorsCatalog(refresh = false): Promise<ConnectorCatalogResponse> {
  return connectorsRequest<ConnectorCatalogResponse>({
    path: `/api/connectors/catalog${refresh ? '?refresh=true' : ''}`,
    timeoutMs: 20_000
  })
}

export function getConnectorsStatus(scope = 'global'): Promise<ConnectorStatusResponse> {
  return connectorsRequest<ConnectorStatusResponse>({
    path: `/api/connectors/status?scope=${encodeURIComponent(scope)}`,
    timeoutMs: 12_000
  })
}

export function connectConnector(toolkit: string, scope = 'global'): Promise<ConnectorConnectResponse> {
  return connectorsRequest<ConnectorConnectResponse>({
    path: '/api/connectors/connect',
    method: 'POST',
    body: { toolkit, scope },
    timeoutMs: 20_000
  })
}

export function attachConnectors(
  scope = 'global'
): Promise<{ ok: boolean; scope: string; entry: string; written: number }> {
  return connectorsRequest({
    path: '/api/connectors/attach',
    method: 'POST',
    body: { scope },
    timeoutMs: 20_000
  })
}

export function disconnectConnectorAccount(accountId: string): Promise<{ ok: boolean }> {
  return connectorsRequest<{ ok: boolean }>({
    path: `/api/connectors/accounts/${encodeURIComponent(accountId)}`,
    method: 'DELETE',
    timeoutMs: 15_000
  })
}
