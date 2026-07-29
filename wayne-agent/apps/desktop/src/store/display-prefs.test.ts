import { beforeEach, describe, expect, it } from 'vitest'

import { $showReasoning, applyShowReasoningFromConfig } from './display-prefs'

describe('applyShowReasoningFromConfig', () => {
  beforeEach(() => {
    $showReasoning.set(true)
  })

  it('defaults to on when the key is missing', () => {
    $showReasoning.set(false)
    applyShowReasoningFromConfig({})
    expect($showReasoning.get()).toBe(true)

    applyShowReasoningFromConfig({ display: {} })
    expect($showReasoning.get()).toBe(true)
  })

  it('honors an explicit false', () => {
    applyShowReasoningFromConfig({ display: { show_reasoning: false } })
    expect($showReasoning.get()).toBe(false)
  })

  it('honors an explicit true', () => {
    $showReasoning.set(false)
    applyShowReasoningFromConfig({ display: { show_reasoning: true } })
    expect($showReasoning.get()).toBe(true)
  })
})
