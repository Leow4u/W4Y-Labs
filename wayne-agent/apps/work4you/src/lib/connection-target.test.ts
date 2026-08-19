import { describe, expect, it } from 'vitest'

import type { HermesConnection } from '@/global'

import { isFlyBrainConnection, isPackagedFlyPrimary } from './connection-target'

describe('connection-target', () => {
  it('detects legacy cloud-body mode', () => {
    const conn = { mode: 'cloud-body' } as HermesConnection
    expect(isFlyBrainConnection(conn)).toBe(true)
    expect(isPackagedFlyPrimary(conn)).toBe(true)
  })

  it('detects explicit fly brain', () => {
    const conn = { brain: 'fly', mode: 'local' } as HermesConnection & { brain: 'fly' }
    expect(isFlyBrainConnection(conn)).toBe(true)
  })

  it('returns false for local gateway', () => {
    const conn = { mode: 'local' } as HermesConnection
    expect(isFlyBrainConnection(conn)).toBe(false)
  })
})
