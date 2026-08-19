import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HermesGateway } from '@/hermes'

import { fulfillDesktopBodyRequest } from './desktop-body'

vi.mock('@/lib/desktop-fs', () => ({
  readDesktopFileText: vi.fn(async () => ({ text: 'hello', path: '/x/a.txt', byteSize: 5 }))
}))

describe('fulfillDesktopBodyRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('responds on the gateway that received the event, not the active profile socket', async () => {
    const cloudGateway = {
      request: vi.fn(async () => ({ ok: true }))
    } as unknown as HermesGateway

    await fulfillDesktopBodyRequest(cloudGateway, {
      op: 'read_file',
      request_id: 'req-1',
      args: { path: '/x/a.txt' }
    })

    expect(cloudGateway.request).toHaveBeenCalledWith(
      'desktop.body.respond',
      expect.objectContaining({ ok: true, request_id: 'req-1' })
    )
  })
})
