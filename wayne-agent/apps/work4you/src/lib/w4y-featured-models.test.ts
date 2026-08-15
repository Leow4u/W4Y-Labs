import { describe, expect, it } from 'vitest'

import type { ModelOptionProvider } from '@/types/hermes'

import {
  ensureW4yAutoModel,
  ensureRelayFreeModel,
  filterW4yProviders,
  isW4yPickerProvider,
  prepareW4yPickerProviders,
  W4Y_AUTO_MODEL_ID,
  W4Y_CATALOG_PROVIDER,
  featuredDefaultOnIds
} from './w4y-featured-models'
import { RELAY_FREE_PRIMARY_MODEL } from './relay-free-model'

const provider = (slug: string, models: string[], extra?: Partial<ModelOptionProvider>): ModelOptionProvider => ({
  models,
  name: slug,
  slug,
  ...extra
})

describe('W4Y picker provider filter', () => {
  it('keeps openrouter and user-defined providers only', () => {
    const providers = [
      provider('openrouter', ['openrouter/auto', 'x-ai/grok-4.5']),
      provider('anthropic', ['claude-opus-5']),
      provider('copilot', ['gpt-5.6']),
      provider('github-copilot', ['gpt-5']),
      provider('my-ollama', ['qwen3'], { is_user_defined: true }),
      provider('moa', ['BeastMode'])
    ]

    const filtered = filterW4yProviders(providers)
    expect(filtered.map(p => p.slug)).toEqual(['openrouter', 'my-ollama'])
  })

  it('rejects anthropic / copilot even when authenticated', () => {
    expect(isW4yPickerProvider(provider('anthropic', ['claude'], { authenticated: true }))).toBe(false)
    expect(isW4yPickerProvider(provider('copilot', ['gpt'], { authenticated: true }))).toBe(false)
  })

  it('force-injects Auto into the catalog when missing', () => {
    const ensured = ensureW4yAutoModel([provider('openrouter', ['x-ai/grok-4.5'])])
    expect(ensured[0]!.models![0]).toBe(W4Y_AUTO_MODEL_ID)
    expect(ensured[0]!.models).toContain('x-ai/grok-4.5')
  })

  it('creates a catalog row with Auto when openrouter is absent', () => {
    const ensured = ensureW4yAutoModel([provider('anthropic', ['claude'])])
    expect(ensured[0]!.slug).toBe(W4Y_CATALOG_PROVIDER)
    expect(ensured[0]!.models).toEqual([W4Y_AUTO_MODEL_ID])
  })

  it('prepareW4yPickerProviders filters + injects Auto', () => {
    const prepared = prepareW4yPickerProviders([
      provider('anthropic', ['claude']),
      provider('openrouter', ['x-ai/grok-4.5'])
    ])
    expect(prepared).toHaveLength(1)
    expect(prepared[0]!.slug).toBe('openrouter')
    expect(prepared[0]!.models![0]).toBe(RELAY_FREE_PRIMARY_MODEL)
    expect(prepared[0]!.models).toContain(W4Y_AUTO_MODEL_ID)
  })

  it('featuredDefaultOnIds includes Relay 2.5 Fast', () => {
    expect(featuredDefaultOnIds()).toContain(RELAY_FREE_PRIMARY_MODEL)
  })

  it('ensureRelayFreeModel injects house model when missing', () => {
    const ensured = ensureRelayFreeModel([provider('openrouter', ['x-ai/grok-4.5'])])
    expect(ensured[0]!.models![0]).toBe(RELAY_FREE_PRIMARY_MODEL)
  })
})
