import { describe, expect, it } from 'vitest'

import { buildByokProviderKeyGroups, buildProviderKeyGroups } from './provider-key-groups'
import type { EnvVarInfo } from '@/types/hermes'

function keyVar(patch: Partial<EnvVarInfo> = {}): EnvVarInfo {
  return {
    advanced: false,
    category: 'provider',
    description: '',
    is_password: true,
    is_set: false,
    provider: '',
    provider_label: '',
    redacted_value: null,
    tools: [],
    url: '',
    ...patch
  }
}

describe('buildByokProviderKeyGroups', () => {
  it('hides platform catalog keys from the curated BYOK face', () => {
    const vars = {
      OPENROUTER_API_KEY: keyVar({ provider_label: 'OpenRouter' }),
      ANTHROPIC_API_KEY: keyVar({ provider_label: 'Anthropic' }),
      NOUS_API_KEY: keyVar({ provider_label: 'Nous Portal' })
    }

    const all = buildProviderKeyGroups(vars)
    const byok = buildByokProviderKeyGroups(vars)

    expect(all.map(g => g.name)).toEqual(expect.arrayContaining(['OpenRouter', 'Anthropic', 'Nous Portal']))
    expect(byok.map(g => g.name)).toEqual(['Anthropic'])
    expect(byok.some(g => g.name === 'OpenRouter')).toBe(false)
  })
})
