/**
 * Ensure the local engine has a live Composio MCP session and the agent
 * tool snapshot includes mcp_composio_* tools.
 *
 * Critical races we must avoid:
 * - Calling reload before the gateway is open → silent no-op
 * - Reloading with no session_id, then cooldown-skipping when the session
 *   appears → agent is built without mcp_composio_* forever
 * - UI "connected" (cloud status) while local MCP never registered
 */
import { attachConnectors } from '@/lib/connectors-api'
import { $runTarget, $sessionRunTarget } from '@/lib/w4y-cloud-projects'
import { $gateway } from '@/store/gateway'

type GatewayLike = {
  connectionState?: string
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>
}

let inFlight: Promise<boolean> | null = null
let lastReloadedSessionId: string | null | undefined = undefined
let lastOkAt = 0
const COOLDOWN_MS = 15_000

function isLocalBrain(): boolean {
  return $sessionRunTarget.get() !== 'cloud' && $runTarget.get() !== 'cloud'
}

function resolveGateway(explicit?: GatewayLike | null): GatewayLike | null {
  if (explicit) return explicit
  return $gateway.get() as GatewayLike | null
}

export async function ensureComposioMcpReady(opts?: {
  force?: boolean
  sessionId?: string | null
  gateway?: GatewayLike | null
}): Promise<boolean> {
  if (!isLocalBrain()) return false

  const sessionId = opts?.sessionId ?? null
  const sessionChanged = sessionId !== lastReloadedSessionId
  const force = Boolean(opts?.force || sessionChanged)

  const now = Date.now()
  if (!force && now - lastOkAt < COOLDOWN_MS) return true
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      await attachConnectors('global')
    } catch (err) {
      console.warn('[composio] attach failed', err)
    }

    // Wait briefly for the socket — composer can mount before gateway is open.
    let gateway = resolveGateway(opts?.gateway)
    for (let i = 0; i < 20 && (!gateway || gateway.connectionState !== 'open'); i += 1) {
      await new Promise(r => window.setTimeout(r, 250))
      gateway = resolveGateway(opts?.gateway)
    }
    if (!gateway || gateway.connectionState !== 'open') {
      console.warn('[composio] gateway not open — skip reload.mcp')
      return false
    }

    try {
      const result = await gateway.request('reload.mcp', {
        confirm: true,
        ...(sessionId ? { session_id: sessionId } : {})
      })
      console.info('[composio] reload.mcp', result)
      lastOkAt = Date.now()
      lastReloadedSessionId = sessionId
      return true
    } catch (err) {
      console.warn('[composio] reload.mcp failed', err)
      return false
    }
  })()

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}
