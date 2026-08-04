import { describe, expect, it } from 'vitest'

import type { CronJob } from '@/types/hermes'

import { en } from '@/i18n/en'

import { jobToolsSummary } from './job-tools-summary'

describe('jobToolsSummary', () => {
  it('shows default when no skills or toolsets', () => {
    expect(
      jobToolsSummary({ enabled: true, id: 'j1', deliver: 'telegram' } satisfies CronJob, en.cron)
    ).toBe(en.cron.toolsSummaryDefault)
  })

  it('counts skills and toolsets', () => {
    expect(
      jobToolsSummary(
        {
          enabled: true,
          id: 'j1',
          skills: ['docs', 'research'],
          enabled_toolsets: ['terminal']
        } satisfies CronJob,
        en.cron
      )
    ).toContain('2')
  })
})
