import type { CronJob } from '@/types/hermes'

import { isWorkProfile, prettifyAgentName } from '@/lib/agents'

export function getJobProfile(job: CronJob): string {
  const profile = (job.profile ?? job.profile_name ?? 'default').trim()

  return profile || 'default'
}

/** Jobs list author — "You" for Work (default), otherwise the owning agent name. */
export function jobAuthorLabel(job: CronJob, authorYou: string): string {
  const profile = getJobProfile(job)

  if (isWorkProfile(profile) || job.is_default_profile) {
    return authorYou
  }

  return prettifyAgentName(profile)
}
