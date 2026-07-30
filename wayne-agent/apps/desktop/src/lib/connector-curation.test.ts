import { describe, expect, it } from 'vitest'

import { discoverPitchKey, resolveDiscoverConnectors } from './connector-curation'
import type { ConnectorToolkit } from './connectors-types'

function tk(slug: string, name = slug): ConnectorToolkit {
  return {
    slug,
    name,
    description: `${name} desc`,
    logo: null,
    categories: [],
    no_auth: false,
    managed_auth: true,
    auth_schemes: [],
    tools_count: null,
    triggers_count: null
  }
}

describe('resolveDiscoverConnectors', () => {
  it('returns Instagram → LinkedIn → Gmail in that order', () => {
    const catalog = [tk('gmail'), tk('slack'), tk('linkedin'), tk('instagram'), tk('notion')]
    expect(resolveDiscoverConnectors(catalog).map(t => t.slug)).toEqual([
      'instagram',
      'linkedin',
      'gmail'
    ])
  })

  it('maps pitch keys from catalog slugs', () => {
    expect(discoverPitchKey('instagram')).toBe('instagram')
    expect(discoverPitchKey('linkedin')).toBe('linkedin')
    expect(discoverPitchKey('gmail')).toBe('gmail')
    expect(discoverPitchKey('slack')).toBeNull()
  })
})
