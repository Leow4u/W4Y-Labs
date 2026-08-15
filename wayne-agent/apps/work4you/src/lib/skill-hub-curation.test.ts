import { describe, expect, it } from 'vitest'

import {
  bundledSkillNames,
  curateHubSearchResults,
  filterCatalogSkills,
  isFormulaHubSkill,
  mergeHubListings
} from './skill-hub-curation'
import type { SkillHubResult, SkillInfo } from '@/types/hermes'

function hub(partial: Partial<SkillHubResult> & Pick<SkillHubResult, 'name'>): SkillHubResult {
  return {
    description: '',
    source: 'official',
    identifier: `official/x/${partial.name}`,
    trust_level: 'builtin',
    repo: null,
    tags: [],
    ...partial
  }
}

function skill(partial: Partial<SkillInfo> & Pick<SkillInfo, 'name'>): SkillInfo {
  return {
    category: 'general',
    description: '',
    enabled: true,
    ...partial
  }
}

describe('skill-hub-curation', () => {
  it('collects bundled kit names', () => {
    const names = bundledSkillNames([
      skill({ name: 'arxiv', provenance: 'bundled' }),
      skill({ name: 'learned', provenance: 'agent' }),
      skill({ name: 'shopify', provenance: 'hub' })
    ])
    expect(names.has('arxiv')).toBe(true)
    expect(names.has('learned')).toBe(false)
    expect(names.has('shopify')).toBe(false)
  })

  it('treats bundled kit hits as formula (not install targets)', () => {
    const bundled = new Set(['arxiv'])
    expect(isFormulaHubSkill(hub({ name: 'arxiv' }), bundled)).toBe(true)
    expect(isFormulaHubSkill(hub({ name: 'shopify' }), bundled)).toBe(false)
  })

  it('strips formula skills from remote search', () => {
    const curated = curateHubSearchResults(
      [hub({ name: 'arxiv' }), hub({ name: 'shopify' }), hub({ name: '1password' })],
      new Set(['arxiv', '1password'])
    )
    expect(curated.map(s => s.name)).toEqual(['shopify'])
  })

  it('filters the curated catalog by query', () => {
    const skills = [
      hub({ name: 'shopify', description: 'Store ops' }),
      hub({ name: 'stocks', description: 'Tickers', tags: ['finance'] })
    ]
    expect(filterCatalogSkills(skills, 'finance').map(s => s.name)).toEqual(['stocks'])
    expect(filterCatalogSkills(skills, '').length).toBe(2)
  })

  it('merges catalog ahead of remote, deduped', () => {
    const catalog = [hub({ name: 'shopify', identifier: 'official/productivity/shopify' })]
    const remote = [
      hub({ name: 'shopify', identifier: 'official/productivity/shopify', description: 'dup' }),
      hub({ name: 'community-thing', identifier: 'github/foo/bar', trust_level: 'community' })
    ]
    const merged = mergeHubListings(catalog, remote)
    expect(merged.map(s => s.identifier)).toEqual([
      'official/productivity/shopify',
      'github/foo/bar'
    ])
    expect(merged[0].description).toBe('')
  })
})
