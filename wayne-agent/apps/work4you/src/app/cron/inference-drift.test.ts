import { describe, expect, it } from 'vitest'

import type { CronJob } from '@/types/hermes'

import {
  buildKeepOriginalInferenceUpdates,
  isInferenceDriftError,
  jobHasInferenceDrift,
  parseInferenceDrift
} from './inference-drift'

const DRIFT_MSG =
  "Skipped to prevent unintended spend: global inference config drifted since this job was created (model 'nvidia/nemotron-3-ultra-550b-a55b:free' -> 'google/gemini-1.5-flash'), and this job is unpinned. See #44585."

describe('inference-drift', () => {
  it('detects drift guard errors', () => {
    expect(isInferenceDriftError(DRIFT_MSG)).toBe(true)
    expect(isInferenceDriftError('some other error')).toBe(false)
  })

  it('parses model drift from last_error', () => {
    expect(parseInferenceDrift(DRIFT_MSG)).toEqual({
      model: {
        from: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        to: 'google/gemini-1.5-flash'
      }
    })
  })

  it('builds pin-to-snapshot updates for unpinned jobs', () => {
    const job = {
      enabled: true,
      id: 'cf16',
      model_snapshot: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      last_error: DRIFT_MSG
    } satisfies CronJob

    expect(buildKeepOriginalInferenceUpdates(job)).toEqual({
      last_error: null,
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free'
    })
  })

  it('jobHasInferenceDrift follows last_error', () => {
    expect(
      jobHasInferenceDrift({
        enabled: true,
        id: 'x',
        last_error: DRIFT_MSG
      })
    ).toBe(true)
  })
})
