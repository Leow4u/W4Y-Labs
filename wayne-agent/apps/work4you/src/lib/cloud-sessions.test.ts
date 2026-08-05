import { describe, expect, it } from 'vitest'

import { mergeCloudAndLocalSessions, tagCloudSessions } from './cloud-sessions'
import type { SessionInfo } from '@/types/hermes'

function row(id: string, last: number): SessionInfo {
  return {
    id,
    ended_at: null,
    input_tokens: 0,
    is_active: false,
    last_active: last,
    message_count: 1,
    model: null,
    output_tokens: 0,
    preview: null,
    source: 'desktop',
    started_at: last - 100,
    title: id,
    tool_call_count: 0
  }
}

describe('cloud-sessions', () => {
  it('tags cloud rows with _w4y_brain', () => {
    const tagged = tagCloudSessions([row('a', 100)])
    expect(tagged[0]._w4y_brain).toBe('cloud')
  })

  it('mergeCloudAndLocalSessions sorts by last_active and prefers cloud on id clash', () => {
    const local = [row('older', 10), row('shared', 50)]
    const cloud = tagCloudSessions([row('newest', 200), row('shared', 999)])
    const merged = mergeCloudAndLocalSessions(local, cloud)
    expect(merged.map(s => s.id)).toEqual(['shared', 'newest', 'older'])
    expect(merged.find(s => s.id === 'shared')?._w4y_brain).toBe('cloud')
  })
})
