import { activeGateway } from '@/store/gateway'
import { $activeSessionId, $yoloActive, setYoloActive } from '@/store/session'

export type GatewayRequester = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>

/**
 * Toggle per-session YOLO (approval bypass) via gateway `config.set` — the same
 * session-scoped flag as the TUI's Shift+Tab. It does NOT touch the global
 * `approvals.mode` config, so CLI / TUI / cron behavior is unaffected.
 */
export async function setSessionYolo(
  requestGateway: GatewayRequester,
  sessionId: string,
  enabled: boolean
): Promise<boolean> {
  const result = await requestGateway<{ value?: string }>('config.set', {
    key: 'yolo',
    session_id: sessionId,
    value: enabled ? '1' : '0'
  })

  const active = result?.value === '1'

  setYoloActive(active)

  return active
}

/**
 * Drop the session bypass if it is armed, for callers that hold no gateway
 * handle of their own (Settings). Throws if the gateway refuses, so the caller
 * can tell the user the mode saved but the live session did not follow.
 */
export async function disarmSessionYolo(): Promise<void> {
  if (!$yoloActive.get()) {
    return
  }

  const gateway = activeGateway()
  const sessionId = $activeSessionId.get()

  // Nothing live to talk to. Still clear the flag: leaving it set would have
  // the composer chip claim a bypass that no session is actually running.
  if (!gateway || !sessionId) {
    setYoloActive(false)

    return
  }

  await setSessionYolo((method, params) => gateway.request(method, params), sessionId, false)
}

/**
 * Toggle GLOBAL YOLO (approval bypass) via gateway `config.set` with
 * `scope: 'global'`. This flips the persistent `approvals.mode` in config.yaml
 * between `off` (bypass on) and `manual` (bypass off), affecting every session,
 * the CLI, the TUI, and cron — and it survives restarts. Triggered by
 * Shift+clicking the status-bar zap.
 */
export async function setGlobalYolo(requestGateway: GatewayRequester, enabled: boolean): Promise<boolean> {
  const result = await requestGateway<{ value?: string }>('config.set', {
    key: 'yolo',
    scope: 'global',
    value: enabled ? '1' : '0'
  })

  const active = result?.value === '1'

  setYoloActive(active)

  return active
}
