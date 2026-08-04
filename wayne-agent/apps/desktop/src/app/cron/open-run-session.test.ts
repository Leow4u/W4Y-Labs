import { describe, expect, it } from 'vitest'

import type { SessionInfo } from '@/hermes'
import { $sessions } from '@/store/session'

import { cronRunSessionPath, seedCronRunSession } from './open-run-session'

const run: SessionInfo = {
  ended_at: 1,
  id: 'cron_job1_20250804_070000',
  input_tokens: 0,
  is_active: false,
  last_active: 1,
  message_count: 2,
  model: null,
  output_tokens: 0,
  preview: 'Daily AI news',
  profile: 'default',
  source: 'cron',
  started_at: 1,
  title: 'Notícias · Aug 04 07:00',
  tool_call_count: 1
}

describe('open cron run session', () => {
  it('builds the chat route for a cron session id', () => {
    expect(cronRunSessionPath('cron_job1_20250804_070000')).toBe('/cron_job1_20250804_070000')
  })

  it('seeds profile metadata into the session list', () => {
    $sessions.set([])

    seedCronRunSession(run)

    expect($sessions.get()).toEqual([run])
  })
})
