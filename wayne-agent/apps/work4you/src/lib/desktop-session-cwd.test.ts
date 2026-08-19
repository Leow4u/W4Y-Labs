import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isCloudBrainSession } from '@/lib/cloud-sessions'
import { WORK4YOU_CLOUD_CONNECTION_ID } from '@/lib/connection-target'
import { syncDesktopCwdToActiveSession } from '@/lib/desktop-session-cwd'
import { $runTarget, $sessionRunTarget } from '@/lib/w4y-cloud-projects'
import { activeGateway } from '@/store/gateway'
import { $activeSessionId, $connection } from '@/store/session'

vi.mock('@/store/gateway', () => ({
  activeGateway: vi.fn()
}))

describe('syncDesktopCwdToActiveSession', () => {
  beforeEach(() => {
    $activeSessionId.set('sess-1')
    $connection.set({
      mode: 'cloud-body',
      brain: 'fly',
      source: 'cloud',
      profile: 'default'
    } as never)
    $runTarget.set('cloud')
    $sessionRunTarget.set('local')
  })

  it('pushes PC folder to the active cloud session', async () => {
    const request = vi.fn(async () => ({}))
    vi.mocked(activeGateway).mockReturnValue({
      connectionState: 'open',
      request
    } as never)

    await syncDesktopCwdToActiveSession('C:\\Users\\demo\\repo')

    expect(request).toHaveBeenCalledWith('session.desktop_cwd.set', {
      desktop_cwd: 'C:\\Users\\demo\\repo',
      session_id: 'sess-1'
    })
  })

  it('skips when the brain is local-only', async () => {
    $connection.set({ mode: 'local', source: 'local', profile: 'default' } as never)
    $runTarget.set('local')
    $sessionRunTarget.set('local')

    const request = vi.fn(async () => ({}))
    vi.mocked(activeGateway).mockReturnValue({
      connectionState: 'open',
      request
    } as never)

    await syncDesktopCwdToActiveSession('C:\\Users\\demo\\repo')

    expect(request).not.toHaveBeenCalled()
  })

  it('skips Fly cloud paths', async () => {
    const request = vi.fn(async () => ({}))
    vi.mocked(activeGateway).mockReturnValue({
      connectionState: 'open',
      request
    } as never)

    await syncDesktopCwdToActiveSession('/opt/data/projects/demo')

    expect(request).not.toHaveBeenCalled()
  })
})

describe('isCloudBrainSession guard', () => {
  it('recognizes cloud sessions', () => {
    expect(isCloudBrainSession({ _w4y_brain: 'cloud' } as never)).toBe(true)
  })
})

describe('WORK4YOU_CLOUD_CONNECTION_ID', () => {
  it('is stable for registry wiring', () => {
    expect(WORK4YOU_CLOUD_CONNECTION_ID).toBe('work4you-cloud')
  })
})
