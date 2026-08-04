import type { CronJob } from '@/types/hermes'
import type { Translations } from '@/i18n/types'

import { jobEnabledToolsets, jobSkills } from './schedule'

export function jobToolsSummary(job: CronJob, c: Translations['cron']): string {
  const skills = jobSkills(job)
  const toolsets = jobEnabledToolsets(job)
  const parts: string[] = []

  if (skills.length > 0) {
    parts.push(c.toolsSummarySkills(skills.length))
  }
  if (toolsets.length > 0) {
    parts.push(c.toolsSummaryToolsets(toolsets.length))
  }

  if (parts.length === 0) {
    return c.toolsSummaryDefault
  }

  return parts.join(' · ')
}
