/**
 * Identity is the tenant answering `/api/auth/me` — never an OpenRouter key.
 *
 * Run with: npm test -- src/store/account-session.test.ts
 * (or the project's vitest suite).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  $accountSession,
  accountSessionSignedIn,
  clearAccountSession,
  probeAccountSession,
  refreshAccountSession
} from './account-session'

function mockCloud(api: unknown) {
  window.work4youDesktop = {
    isDesktop: true,
    cloud: {
      api,
      wsUrl: vi.fn(),
      canMutate: vi.fn()
    }
  } as never
}

beforeEach(() => {
  $accountSession.set({ status: 'unknown', me: null })
})

afterEach(() => {
  delete (window as { work4youDesktop?: unknown }).work4youDesktop
  $accountSession.set({ status: 'unknown', me: null })
})

describe('accountSession', () => {
  it('treats a successful /api/auth/me as signed in', async () => {
    mockCloud(
      vi.fn(async () => ({
        ok: true,
        json: { display_name: 'Leo', email: 'leo@work4you.ai', user_id: 'u1' }
      }))
    )

    await expect(refreshAccountSession()).resolves.toBe(true)
    expect(accountSessionSignedIn()).toBe(true)
    expect($accountSession.get().me?.email).toBe('leo@work4you.ai')
  })

  it('does not treat an OpenRouter key as identity — 401 is signed out', async () => {
    mockCloud(vi.fn(async () => ({ ok: false, status: 401 })))

    await expect(refreshAccountSession()).resolves.toBe(false)
    expect(accountSessionSignedIn()).toBe(false)
    expect($accountSession.get().status).toBe('signedOut')
  })

  it('probeAccountSession distinguishes 401 from 5xx', async () => {
    mockCloud(vi.fn(async () => ({ ok: false, status: 401 })))
    await expect(probeAccountSession()).resolves.toBe('signed-out')

    mockCloud(vi.fn(async () => ({ ok: false, status: 500 })))
    await expect(probeAccountSession()).resolves.toBe('unavailable')

    mockCloud(vi.fn(async () => ({ ok: false, error: 'not-logged-in' })))
    await expect(probeAccountSession()).resolves.toBe('signed-out')
  })

  it('probeAccountSession treats a thrown /me as unavailable', async () => {
    mockCloud(vi.fn(async () => {
      throw new Error('network')
    }))
    await expect(probeAccountSession()).resolves.toBe('unavailable')
    expect(accountSessionSignedIn()).toBe(false)
  })

  it('clearAccountSession drops identity for logout', () => {
    $accountSession.set({
      status: 'signedIn',
      me: { email: 'leo@work4you.ai', user_id: 'u1' }
    })
    clearAccountSession()
    expect(accountSessionSignedIn()).toBe(false)
  })
})

describe('accountGate no longer opens on hasKey alone', () => {
  it('refreshAccountGate source asks the tenant, not hasKey', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const source = fs.readFileSync(path.join(__dirname, 'account-gate.ts'), 'utf8')

    expect(source).toMatch(/probeAccountSession\(\)/)
    expect(source).not.toMatch(/hasKey\?\.\(\)/)
    expect(source).not.toMatch(/w4y\?\.probeSession/)
  })
})
