import { describe, expect, it, beforeEach } from 'vitest'

import {
  $conversationDensity,
  $showReasoning,
  applyConversationDensityFromConfig,
  applyShowReasoningFromConfig,
  toolDisclosureDefaultOpen
} from './display-prefs'

describe('applyShowReasoningFromConfig', () => {
  beforeEach(() => {
    $showReasoning.set(true)
  })

  it('defaults to true when missing', () => {
    applyShowReasoningFromConfig({})
    expect($showReasoning.get()).toBe(true)

    applyShowReasoningFromConfig({ display: {} })
    expect($showReasoning.get()).toBe(true)
  })

  it('reads display.show_reasoning', () => {
    applyShowReasoningFromConfig({ display: { show_reasoning: false } })
    expect($showReasoning.get()).toBe(false)

    applyShowReasoningFromConfig({ display: { show_reasoning: true } })
    expect($showReasoning.get()).toBe(true)
  })
})

describe('applyConversationDensityFromConfig', () => {
  beforeEach(() => {
    $conversationDensity.set('balanced')
  })

  it('defaults to balanced when missing', () => {
    applyConversationDensityFromConfig({})
    expect($conversationDensity.get()).toBe('balanced')
  })

  it('reads display.conversation_density', () => {
    applyConversationDensityFromConfig({ display: { conversation_density: 'compact' } })
    expect($conversationDensity.get()).toBe('compact')

    applyConversationDensityFromConfig({ display: { conversation_density: 'detailed' } })
    expect($conversationDensity.get()).toBe('detailed')
  })

  it('falls back for invalid values', () => {
    applyConversationDensityFromConfig({ display: { conversation_density: 'verbose' } })
    expect($conversationDensity.get()).toBe('balanced')
  })
})

describe('toolDisclosureDefaultOpen', () => {
  it('matches Cursor-style density tiers', () => {
    const shell = { hasInlineDiff: false, isFileEdit: false, isShellTool: true }
    const edit = { hasInlineDiff: true, isFileEdit: true, isShellTool: false }

    expect(toolDisclosureDefaultOpen('compact', edit)).toBe(false)
    expect(toolDisclosureDefaultOpen('balanced', edit)).toBe(true)
    expect(toolDisclosureDefaultOpen('balanced', shell)).toBe(false)
    expect(toolDisclosureDefaultOpen('detailed', shell)).toBe(true)
  })
})
