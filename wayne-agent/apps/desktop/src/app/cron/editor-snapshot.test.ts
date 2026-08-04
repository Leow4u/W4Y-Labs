import { describe, expect, it } from 'vitest'

import type { CronJob } from '@/types/hermes'

import {
  editorSnapshotFromJob,
  editorSnapshotsEqual,
  emptyEditorSnapshot,
  normalizeEditorValues
} from './editor-snapshot'

describe('editor-snapshot', () => {
  it('detects dirty when prompt changes', () => {
    const baseline = editorSnapshotFromJob({
      enabled: true,
      id: 'j1',
      prompt: 'hello',
      schedule: { expr: '0 9 * * *' }
    } satisfies CronJob)

    const current = normalizeEditorValues({
      composioTriggers: [],
      deliver: 'local',
      enabledToolsets: [],
      model: '__default__',
      name: '',
      prompt: 'hello world',
      schedules: [{ custom: false, expr: '0 9 * * *', id: 'a' }],
      skills: [],
      webhooks: [],
      workdir: ''
    })

    expect(editorSnapshotsEqual(baseline, current)).toBe(false)
  })

  it('empty create baseline matches default form', () => {
    const empty = emptyEditorSnapshot()
    const form = normalizeEditorValues({
      composioTriggers: [],
      deliver: 'local',
      enabledToolsets: [],
      model: '__default__',
      name: '',
      prompt: '',
      schedules: [{ custom: false, expr: '0 9 * * *', id: 'x' }],
      skills: [],
      webhooks: [],
      workdir: ''
    })
    expect(editorSnapshotsEqual(empty, form)).toBe(true)
  })
})
