import type {
  ConnectorCatalogResponse,
  ConnectorConnectResponse,
  ConnectorEventRun,
  ConnectorStatusResponse,
  ConnectorTriggerCreateResponse,
  ConnectorTriggersResponse,
  ConnectorTriggerType
} from './connectors-types'
import { $runTarget, $sessionRunTarget } from './w4y-cloud-projects'

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

function activeBrain(): 'local' | 'cloud' {
  if ($sessionRunTarget.get() === 'cloud' || $runTarget.get() === 'cloud') return 'cloud'
  return 'local'
}

/**
 * Prefer the cloud account brain when logged in (same cookies as login);
 * fall back to the local wayne serve worker so signed-out desktop still works.
 *
 * For `force: 'local' | 'cloud'`, skip the preference and hit that side only
 * (attach must write MCP into the engine that will run the tools).
 */
async function connectorsRequest<T>(opts: {
  path: string
  method?: string
  body?: unknown
  timeoutMs?: number
  force?: 'local' | 'cloud'
}): Promise<T> {
  const cloud = (window as Window & { work4youDesktop?: Work4YouDesktop }).work4youDesktop?.cloud?.api
  const tryCloud = async (): Promise<T | null> => {
    if (!cloud) return null
    try {
      const res = await cloud({
        method: opts.method || 'GET',
        path: opts.path,
        body: opts.body
      })
      if (res?.ok && res.json != null) return res.json as T
    } catch {
      /* fall through */
    }
    return null
  }

  const tryLocal = (): Promise<T> =>
    window.hermesDesktop.api<T>({
      path: opts.path,
      method: opts.method,
      body: opts.body,
      timeoutMs: opts.timeoutMs
    })

  if (opts.force === 'local') return tryLocal()
  if (opts.force === 'cloud') {
    const fromCloud = await tryCloud()
    if (fromCloud != null) return fromCloud
    return tryLocal()
  }

  const fromCloud = await tryCloud()
  if (fromCloud != null) return fromCloud
  return tryLocal()
}

export function getConnectorsCatalog(refresh = false): Promise<ConnectorCatalogResponse> {
  return connectorsRequest<ConnectorCatalogResponse>({
    path: `/api/connectors/catalog${refresh ? '?refresh=true' : ''}`,
    timeoutMs: 20_000
  })
}

export function getConnectorsStatus(scope = 'global'): Promise<ConnectorStatusResponse> {
  // Local brain OAuth lands on the local Composio user_id. Preferring cloud
  // here left ConnectLinkCard stuck on "waiting" forever after Authorize.
  return connectorsRequest<ConnectorStatusResponse>({
    path: `/api/connectors/status?scope=${encodeURIComponent(scope)}`,
    timeoutMs: 12_000,
    force: activeBrain() === 'local' ? 'local' : undefined
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

/**
 * (Re)write mcp_servers.composio for the engine that will run tools.
 * Local sessions must hit the local worker — cloud attach only updates cloud homes.
 */
export async function attachConnectors(
  scope = 'global'
): Promise<{ ok: boolean; scope: string; entry: string; written: number }> {
  const brain = activeBrain()
  if (brain === 'local') {
    try {
      return await connectorsRequest({
        path: '/api/connectors/attach',
        method: 'POST',
        body: { scope },
        timeoutMs: 20_000,
        force: 'local'
      })
    } catch {
      /* fall through to cloud so marketplace connect still works when local serve lacks the route */
    }
  }

  return connectorsRequest({
    path: '/api/connectors/attach',
    method: 'POST',
    body: { scope },
    timeoutMs: 20_000,
    force: brain === 'cloud' ? 'cloud' : undefined
  })
}

export function disconnectConnectorAccount(accountId: string): Promise<{ ok: boolean }> {
  return connectorsRequest<{ ok: boolean }>({
    path: `/api/connectors/accounts/${encodeURIComponent(accountId)}`,
    method: 'DELETE',
    timeoutMs: 15_000
  })
}

/** Revoke every Composio connected account for the local/global scope. */
export function disconnectAllConnectors(
  scope = 'global'
): Promise<{ ok: boolean; removed: string[]; errors: { id: string; error: string }[] }> {
  return connectorsRequest({
    path: '/api/connectors/disconnect-all',
    method: 'POST',
    body: { scope },
    timeoutMs: 60_000,
    force: 'local'
  })
}

/** Same brain as connector status — Gmail OAuth on local must not hit cloud upsert. */
function connectorsBrainForce(): 'local' | undefined {
  return activeBrain() === 'local' ? 'local' : undefined
}

export function getConnectorTriggerTypes(toolkit: string): Promise<{ types: ConnectorTriggerType[] }> {
  return connectorsRequest<{ types: ConnectorTriggerType[] }>({
    path: `/api/connectors/triggers/types?toolkit=${encodeURIComponent(toolkit)}`,
    timeoutMs: 20_000,
    force: connectorsBrainForce()
  })
}

export function getConnectorTriggers(scope = 'global'): Promise<ConnectorTriggersResponse> {
  return connectorsRequest<ConnectorTriggersResponse>({
    path: `/api/connectors/triggers?scope=${encodeURIComponent(scope)}`,
    timeoutMs: 15_000,
    force: connectorsBrainForce()
  })
}

export function createConnectorTrigger(
  trigger: string,
  scope = 'global',
  config?: Record<string, unknown>,
  connectedAccountId?: string
): Promise<ConnectorTriggerCreateResponse> {
  const body: Record<string, unknown> = { trigger, scope }
  if (config && Object.keys(config).length > 0) body.config = config
  if (connectedAccountId) body.connected_account_id = connectedAccountId
  return connectorsRequest<ConnectorTriggerCreateResponse>({
    path: '/api/connectors/triggers',
    method: 'POST',
    body,
    timeoutMs: 20_000,
    force: connectorsBrainForce()
  })
}

export function deleteConnectorTrigger(triggerId: string): Promise<{ ok: boolean }> {
  return connectorsRequest<{ ok: boolean }>({
    path: `/api/connectors/triggers/${encodeURIComponent(triggerId)}`,
    method: 'DELETE',
    timeoutMs: 15_000,
    force: connectorsBrainForce()
  })
}

/**
 * Best-effort activity from connector-event → kanban. Returns [] when the
 * plugin/API is unreachable — Run History still shows cron runs alone.
 */
export async function getConnectorEventRuns(limit = 50): Promise<ConnectorEventRun[]> {
  try {
    const res = await connectorsRequest<{ runs?: ConnectorEventRun[]; items?: ConnectorEventRun[] }>({
      path: `/api/connectors/events/recent?limit=${limit}`,
      timeoutMs: 8_000
    })
    return res.runs ?? res.items ?? []
  } catch {
    return []
  }
}
