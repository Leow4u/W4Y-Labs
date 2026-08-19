import { isCloudBrainSession } from '@/lib/cloud-sessions'
import { isFlyBrainConnection } from '@/lib/connection-target'
import { isPcFolderPath, $runTarget, $sessionRunTarget } from '@/lib/w4y-cloud-projects'
import { activeGateway } from '@/store/gateway'
import { $activeSessionId, $connection, $sessions } from '@/store/session'

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

/** Push a new PC folder to the Fly brain for the active chat session. */
export async function syncDesktopCwdToActiveSession(desktopCwd: string): Promise<void> {
  const path = desktopCwd.trim()

  if (!path || !isPcFolderPath(path) || !cloudBrainOwnsDesktopCwd()) {
    return
  }

  const sessionId = $activeSessionId.get()
  const gateway = activeGateway()

  if (!sessionId || !gateway || gateway.connectionState !== 'open') {
    return
  }

  await gateway.request('session.desktop_cwd.set', {
    desktop_cwd: path,
    session_id: sessionId
  })
}
