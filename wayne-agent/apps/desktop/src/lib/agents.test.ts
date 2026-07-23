import { describe, expect, it } from 'vitest'

import { agentMonogram, isWorkProfile, prettifyAgentName, realAgents } from './agents'
import type { ProfileInfo } from '@/types/hermes'

function stub(partial: Partial<ProfileInfo> & Pick<ProfileInfo, 'name'>): ProfileInfo {
  return {
    has_env: false,
    is_default: false,
    model: null,
    path: '',
    provider: null,
    skill_count: 0,
    ...partial
  }
}

describe('isWorkProfile / realAgents', () => {
  it('treats default / is_default as Work', () => {
    expect(isWorkProfile('default')).toBe(true)
    expect(isWorkProfile('Default')).toBe(true)
    expect(isWorkProfile(stub({ name: 'default', is_default: false }))).toBe(true)
    expect(isWorkProfile(stub({ name: 'social-media', is_default: true }))).toBe(true)
    expect(isWorkProfile(stub({ name: 'social-media' }))).toBe(false)
  })

  it('excludes Work from Studio roster', () => {
    const list = realAgents([
      stub({ name: 'default', is_default: true }),
      stub({ name: 'social-media' }),
      stub({ name: 'marketing' })
    ])
    expect(list.map(p => p.name)).toEqual(['social-media', 'marketing'])
  })
})

describe('prettifyAgentName / agentMonogram', () => {
  it('prettifies slugs', () => {
    expect(prettifyAgentName('especialista-em-construcao-civil')).toBe('Especialista Em Construcao Civil')
    expect(agentMonogram('especialista-em-construcao-civil')).toBe('EE')
  })
})
