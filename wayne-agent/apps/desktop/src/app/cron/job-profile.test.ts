import { describe, expect, it } from 'vitest'

import type { CronJob } from '@/types/hermes'

import { getJobProfile, jobAuthorLabel } from './job-profile'
import { runStoryText } from './run-stats'

describe('cron job profile', () => {
  it('uses profile_name when profile is missing', () => {
    const job = { enabled: true, id: 'j1', profile_name: 'redator-financeiro' } satisfies CronJob

    expect(getJobProfile(job)).toBe('redator-financeiro')
    expect(jobAuthorLabel(job, 'You')).toBe('Redator Financeiro')
  })

  it('shows authorYou for the default profile', () => {
    const job = { enabled: true, id: 'j1', profile: 'default', is_default_profile: true } satisfies CronJob

    expect(jobAuthorLabel(job, 'Você')).toBe('Você')
  })
})

describe('runStoryText', () => {
  it('prefers title over preview', () => {
    expect(
      runStoryText({
        ended_at: 1,
        id: 'cron_job_1',
        input_tokens: 0,
        is_active: false,
        last_active: 1,
        message_count: 1,
        model: null,
        output_tokens: 0,
        preview: 'Check inbox for AI news',
        source: 'cron',
        started_at: 1,
        title: 'Notícias Diárias · Aug 04 07:00',
        tool_call_count: 0
      })
    ).toBe('Notícias Diárias · Aug 04 07:00')
  })

  it('falls back to preview', () => {
    expect(
      runStoryText({
        ended_at: 1,
        id: 'cron_job_1',
        input_tokens: 0,
        is_active: false,
        last_active: 1,
        message_count: 1,
        model: null,
        output_tokens: 0,
        preview: 'Summarize overnight commits',
        source: 'cron',
        started_at: 1,
        title: null,
        tool_call_count: 0
      })
    ).toBe('Summarize overnight commits')
  })
})
