/**
 * Account gate must never strand the user on "A verificar sessão…".
 *
 * Run with: npm test -- src/store/account-gate.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  $accountGate,
  ACCOUNT_GATE_CHECK_BUDGET_MS,
  refreshAccountGate
} from './account-gate'
import { $accountSession } from './account-session'

function mockDesktop(opts: {
  api: unknown
  ensureCredentials?: () => Promise<unknown>
}) {
  window.work4youDesktop = {
    isDesktop: true,
    cloud: {
      api: opts.api,
      wsUrl: vi.fn(),
      canMutate: vi.fn()
    },
    w4y: {
      ensureCredentials: opts.ensureCredentials ?? vi.fn(async () => ({ ok: true }))
    }
  } as never
}

beforeEach(() => {
  vi.useFakeTimers()
  $accountGate.set({ phase: 'checking', error: null })
  $accountSession.set({ status: 'unknown', me: null })
})

afterEach(() => {
  vi.useRealTimers()
  delete (window as { work4youDesktop?: unknown }).work4youDesktop
  $accountGate.set({ phase: 'idle', error: null })
  $accountSession.set({ status: 'unknown', me: null })
})

describe('refreshAccountGate never stays on checking forever', () => {
  it('opens immediately when /api/auth/me already succeeds', async () => {
    const ensure = vi.fn(async () => {
      await new Promise(() => {
        /* hang — must not block the gate */
      })
    })
    mockDesktop({
      api: vi.fn(async () => ({
        ok: true,
        json: { email: 'leo@work4you.ai', user_id: 'u1' }
      })),
      ensureCredentials: ensure
    })

    await expect(refreshAccountGate()).resolves.toBe(true)
    expect($accountGate.get().phase).toBe('idle')
    // Heal may be kicked in background, but must not have been awaited.
    expect(ensure).toHaveBeenCalled()
  })

  it('falls through to Continuar when heal exceeds the budget', async () => {
    const ensure = vi.fn(
      () =>
        new Promise(() => {
          /* never resolves — post-update hang class */
        })
    )
    mockDesktop({
      api: vi.fn(async () => ({ ok: false, status: 401 })),
      ensureCredentials: ensure
    })

    const pending = refreshAccountGate()
    await vi.advanceTimersByTimeAsync(ACCOUNT_GATE_CHECK_BUDGET_MS + 50)
    await expect(pending).resolves.toBe(false)
    expect($accountGate.get().phase).toBe('required')
  })

  it('dedupes concurrent refresh calls into one heal', async () => {
    let calls = 0
    mockDesktop({
      api: vi.fn(async () => ({ ok: false, status: 401 })),
      ensureCredentials: vi.fn(async () => {
        calls += 1
        await new Promise(r => setTimeout(r, 5_000))
        return { ok: true }
      })
    })

    const a = refreshAccountGate()
    const b = refreshAccountGate()
    expect(a).toBe(b)
    await vi.advanceTimersByTimeAsync(ACCOUNT_GATE_CHECK_BUDGET_MS + 50)
    await Promise.all([a, b])
    expect(calls).toBe(1)
  })
})

describe('account gate source contracts', () => {
  it('keeps a hard budget and fails open to Continuar', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const source = fs.readFileSync(path.join(__dirname, 'account-gate.ts'), 'utf8')

    expect(source).toMatch(/ACCOUNT_GATE_CHECK_BUDGET_MS/)
    expect(source).toMatch(/Promise\.race/)
    expect(source).toMatch(/phase: 'required'/)
    expect(source).toMatch(/refreshAccountSession\(\)/)
    expect(source).not.toMatch(/hasKey\?\.\(\)/)
  })
})
