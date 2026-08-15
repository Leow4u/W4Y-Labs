import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/w4y-cloud-projects', () => ({
  mintCloudWsUrl: vi.fn(async () => {
    throw new Error('mint failed')
  })
}))

vi.mock('@hermes/shared', async () => {
  const actual = await vi.importActual<typeof import('@hermes/shared')>('@hermes/shared')
  return {
    ...actual,
    resolveGatewayWsUrl: vi.fn(async () => 'ws://127.0.0.1:9')
  }
})

import {
  CLOUD_BRAIN_KEY,
  configureGatewayRegistry,
  ensureCloudBrainActive,
  isCloudBrainActive,
  setPrimaryGateway
} from './gateway'
import { HermesGateway } from '@/hermes'
import { $gatewayState } from '@/store/session'

describe('ensureCloudBrainActive fallback', () => {
  beforeEach(() => {
    configureGatewayRegistry({ onEvent: () => undefined })
    $gatewayState.set('idle')
  })

  it('keeps local primary active when cloud mint/connect fails', async () => {
    const primary = new HermesGateway()
    // Simulate a healthy local socket without opening a real WS.
    Object.defineProperty(primary, 'connectionState', {
      configurable: true,
      get: () => 'open' as const
    })
    setPrimaryGateway(primary, 'default')
    $gatewayState.set('open')

    await expect(ensureCloudBrainActive()).rejects.toThrow(/mint failed|gateway unavailable/)
    expect(isCloudBrainActive()).toBe(false)
    expect($gatewayState.get()).toBe('open')
  })
})