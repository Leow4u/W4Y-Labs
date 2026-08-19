import { atom } from 'nanostores'

import { queryClient } from '@/lib/query-client'
import { resetSessionsLimit } from '@/store/layout'
import { setCronJobs } from '@/store/cron'
import { resetStarmapGraph } from '@/store/starmap'
import {
  setActiveSessionId,
  setCronSessions,
  setFreshDraftReady,
  setMessages,
  setMessagingPlatformTotals,
  setMessagingSessions,
  setMessagingTruncated,
  setSelectedStoredSessionId,
  setSessionProfileTotals,
  setSessions,
  setSessionsLoading,
  setWorkingSessionIds
} from '@/store/session'

// True while a soft gateway-mode apply is mid-flight (wipe → re-dial).
export const $gatewaySwitching = atom(false)

/**
 * Clear gateway-bound session UI so sidebar skeletons retrigger.
 *
 * Does NOT call requestFreshSession() — that navigates to NEW_CHAT and would
 * close route overlays (Settings).
 */
export function wipeSessionListsForGatewaySwitch(): void {
  setSessions([])
  setSessionProfileTotals({})
  setCronSessions([])
  setCronJobs([])
  setMessagingSessions([])
  setMessagingPlatformTotals({})
  setMessagingTruncated(false)
  setWorkingSessionIds([])
  setSessionsLoading(true)
  resetSessionsLimit()
  resetStarmapGraph()

  setActiveSessionId(null)
  setSelectedStoredSessionId(null)
  setMessages([])
  setFreshDraftReady(true)

  void queryClient.invalidateQueries()
}
