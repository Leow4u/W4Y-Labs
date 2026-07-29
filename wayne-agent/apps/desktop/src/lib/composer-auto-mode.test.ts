import { beforeEach, describe, expect, it } from 'vitest'

import {
  isW4yAutoModel,
  rememberComposerManualModel,
  resolveComposerManualFallback
} from './composer-auto-mode'

describe('composer-auto-mode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('detects the catalog auto-router id', () => {
    expect(isW4yAutoModel('openrouter/auto')).toBe(true)
    expect(isW4yAutoModel('openrouter/openrouter/auto')).toBe(true)
    expect(isW4yAutoModel('auto')).toBe(true)
    expect(isW4yAutoModel('x-ai/grok-4.5')).toBe(false)
  })

  it('remembers the last non-Auto pick and restores it', () => {
    rememberComposerManualModel('openrouter/auto', 'openrouter')
    expect(resolveComposerManualFallback().model).not.toBe('openrouter/auto')

    rememberComposerManualModel('x-ai/grok-4.5', 'openrouter')
    expect(resolveComposerManualFallback()).toEqual({
      model: 'x-ai/grok-4.5',
      provider: 'openrouter'
    })
  })

  it('falls back to the first featured non-Auto default when nothing was remembered', () => {
    const fallback = resolveComposerManualFallback()
    expect(fallback.provider).toBe('openrouter')
    expect(fallback.model).not.toBe('openrouter/auto')
    expect(fallback.model.length).toBeGreaterThan(0)
  })
})
