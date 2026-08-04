import { sessionRoute } from '@/app/routes'
import type { SessionInfo } from '@/hermes'
import { setSessions } from '@/store/session'

/** Keep cron run metadata (especially `profile`) in the session list for resume routing. */
export function seedCronRunSession(run: SessionInfo): void {
  setSessions(prev => {
    const index = prev.findIndex(session => session.id === run.id)

    if (index >= 0) {
      const next = [...prev]
      next[index] = { ...next[index], ...run }

      return next
    }

    return [run, ...prev]
  })
}

export function cronRunSessionPath(sessionId: string): string {
  return sessionRoute(sessionId)
}
