import { isCloudBrainSession } from '@/lib/cloud-sessions'
import { isFlyBrainConnection } from '@/lib/connection-target'
import { syncDesktopCwdToActiveSession } from '@/lib/desktop-session-cwd'
import { $runTarget, $sessionRunTarget, isPcFolderPath } from '@/lib/w4y-cloud-projects'
import { $activeSessionId, $connection, $currentCwd, $sessions } from '@/store/session'

function cloudBrainOwnsDesktopCwd(): boolean {
  if (isFlyBrainConnection($connection.get())) {
    return true
  }

  const sessionId = $activeSessionId.get()

  if (sessionId) {
    const row = $sessions.get().find(session => session.id === sessionId)

    if (isCloudBrainSession(row)) {
      return true
    }
  }

  return $runTarget.get() === 'cloud' || $sessionRunTarget.get() === 'cloud'
}

/** Keep the Fly brain aligned with the PC folder while a cloud session is live. */
export function bindDesktopCwdSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const push = () => {
    if (timer !== null) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      timer = null

      const path = $currentCwd.get().trim()

      if (!path || !isPcFolderPath(path) || !$activeSessionId.get() || !cloudBrainOwnsDesktopCwd()) {
        return
      }

      void syncDesktopCwdToActiveSession(path).catch(() => undefined)
    }, 80)
  }

  const offCwd = $currentCwd.subscribe(push)
  const offSession = $activeSessionId.subscribe(push)
  const offRunTarget = $runTarget.subscribe(push)
  const offSessionRunTarget = $sessionRunTarget.subscribe(push)

  return () => {
    offCwd()
    offSession()
    offRunTarget()
    offSessionRunTarget()

    if (timer !== null) {
      clearTimeout(timer)
    }
  }
}
