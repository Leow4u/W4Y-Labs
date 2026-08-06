import { describe, expect, it } from 'vitest'

import {
  featuredDefaultOnIdsForPlan,
  filterModelsForPlan,
  isPlanLockedModel,
  sanitizeVisibleKeysForPlan
} from '@/lib/plan-model-gating'
import { featuredDefaultOnIds, W4Y_CATALOG_PROVIDER } from '@/lib/w4y-featured-models'
import { RELAY_FREE_PRIMARY_MODEL } from '@/lib/relay-free-model'

describe('plan-model-gating', () => {
  it('locks catalog models on Grátis except Relay 2.5 Fast', () => {
    expect(isPlanLockedModel(RELAY_FREE_PRIMARY_MODEL, 'free')).toBe(false)
    expect(isPlanLockedModel('openrouter/auto', 'free')).toBe(true)
    expect(isPlanLockedModel('anthropic/claude-opus-5', 'free')).toBe(true)
    expect(isPlanLockedModel('anthropic/claude-opus-5', 'starter')).toBe(false)
  })

  it('featuredDefaultOnIdsForPlan returns Relay only when plan is known Grátis', () => {
    expect(featuredDefaultOnIdsForPlan('free')).toEqual([RELAY_FREE_PRIMARY_MODEL])
    expect(featuredDefaultOnIdsForPlan(undefined)).toEqual(featuredDefaultOnIds())
    expect(featuredDefaultOnIdsForPlan('starter')).toEqual(featuredDefaultOnIds())
  })

  it('filterModelsForPlan keeps Relay on Grátis', () => {
    const models = [RELAY_FREE_PRIMARY_MODEL, 'openrouter/auto', 'x-ai/grok-4.5']
    expect(filterModelsForPlan(models, 'free')).toEqual([RELAY_FREE_PRIMARY_MODEL])
    expect(filterModelsForPlan(models, 'pro')).toEqual(models)
  })

  it('sanitizeVisibleKeysForPlan strips locked keys and keeps Relay on Grátis', () => {
    const relayKey = `${W4Y_CATALOG_PROVIDER}::${RELAY_FREE_PRIMARY_MODEL}`
    const autoKey = `${W4Y_CATALOG_PROVIDER}::openrouter/auto`
    const stored = new Set([relayKey, autoKey, `${W4Y_CATALOG_PROVIDER}::anthropic/claude-opus-5`])

    const sanitized = sanitizeVisibleKeysForPlan(stored, 'free', W4Y_CATALOG_PROVIDER)

    expect(sanitized).not.toBeNull()
    expect(sanitized).toEqual(new Set([relayKey]))
  })

  it('sanitizeVisibleKeysForPlan is a no-op on paid plans', () => {
    const stored = new Set([`${W4Y_CATALOG_PROVIDER}::openrouter/auto`])
    expect(sanitizeVisibleKeysForPlan(stored, 'starter', W4Y_CATALOG_PROVIDER)).toBeNull()
  })
})
