import { afterEach, describe, expect, it, vi } from 'vitest'

import { $activeSessionId, $yoloActive, setYoloActive } from '@/store/session'

import { disarmSessionYolo } from './yolo-session'

// Settings writes approvals.mode into config.yaml, but `/yolo` and the composer
// chip arm a session-scoped bypass that outranks it. Choosing "ask every time"
// on the page while that flag stayed set left Settings describing a prompt the
// running chat would never show.

const request = vi.fn(async () => ({ value: '0' }) as never)
const activeGateway = vi.fn<() => { request: typeof request } | null>(() => ({ request }))

vi.mock('@/store/gateway', () => ({
  activeGateway: () => activeGateway()
}))

const SESSION_ID = 'rt-session-1'

afterEach(() => {
  request.mockClear()
  activeGateway.mockReset()
  activeGateway.mockReturnValue({ request })
  $activeSessionId.set(null)
  setYoloActive(false)
})

describe('disarmSessionYolo', () => {
  it('clears the live session bypass', async () => {
    $activeSessionId.set(SESSION_ID)
    setYoloActive(true)

    await disarmSessionYolo()

    expect(request).toHaveBeenCalledWith('config.set', {
      key: 'yolo',
      session_id: SESSION_ID,
      value: '0'
    })
    expect($yoloActive.get()).toBe(false)
  })

  it('stays quiet when nothing is armed', async () => {
    $activeSessionId.set(SESSION_ID)

    await disarmSessionYolo()

    expect(request).not.toHaveBeenCalled()
  })

  it('drops the flag when there is no session to tell', async () => {
    setYoloActive(true)
    activeGateway.mockReturnValue(null)

    await disarmSessionYolo()

    // Leaving it set would have the chip claim a bypass nothing is running.
    expect($yoloActive.get()).toBe(false)
  })

  it('surfaces a refusal instead of pretending the bypass is gone', async () => {
    $activeSessionId.set(SESSION_ID)
    setYoloActive(true)
    request.mockRejectedValueOnce(new Error('gateway down'))

    await expect(disarmSessionYolo()).rejects.toThrow('gateway down')
  })
})
