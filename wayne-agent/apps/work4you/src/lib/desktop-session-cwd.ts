import { isPcFolderPath } from '@/lib/w4y-cloud-projects'
import { activeGateway } from '@/store/gateway'
import { $activeSessionId } from '@/store/session'

/** Push a new PC folder to the Fly brain for the active chat session. */
export async function syncDesktopCwdToActiveSession(desktopCwd: string): Promise<void> {
  const path = desktopCwd.trim()

  if (!path || !isPcFolderPath(path)) {
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
