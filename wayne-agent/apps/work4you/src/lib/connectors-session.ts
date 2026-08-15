import type { GatewayRequester } from './yolo-session'

/**
 * Replace the set of connector toolkit slugs switched OFF for THIS session.
 * Enforced at the engine MCP door (`tools/mcp_tool.py`); never touches global
 * config or other sessions.
 */
export async function setSessionConnectorsDisabled(
  requestGateway: GatewayRequester,
  sessionId: string,
  slugs: string[]
): Promise<string[]> {
  const normalized = [...new Set(slugs.map(s => s.toLowerCase()).filter(Boolean))].sort()
  await requestGateway('config.set', {
    session_id: sessionId,
    key: 'connectors.disabled',
    value: normalized,
    scope: 'session'
  })
  return normalized
}

export function connectorsOffStorageKey(sessionId: string): string {
  return `wayne:connectors-off:${sessionId}`
}

export function readConnectorsOff(sessionId: string | null | undefined): string[] {
  if (!sessionId) return []
  try {
    const raw = window.localStorage.getItem(connectorsOffStorageKey(sessionId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === 'string')
  } catch {
    return []
  }
}

export function writeConnectorsOff(sessionId: string | null | undefined, slugs: string[]): void {
  if (!sessionId) return
  try {
    const key = connectorsOffStorageKey(sessionId)
    if (slugs.length > 0) window.localStorage.setItem(key, JSON.stringify(slugs))
    else window.localStorage.removeItem(key)
  } catch {
    /* private mode */
  }
}
