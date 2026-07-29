// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchAccountPlan, normalizePlan, planLabel, saveSpendLimit } from './plans'

describe('desktop plans helpers', () => {
  afterEach(() => {
    delete (window as { work4youDesktop?: unknown }).work4youDesktop
    vi.restoreAllMocks()
  })

  it('normalizes platform keys onto Hobby · Pro · Business · Trial', () => {
    expect(normalizePlan('free')).toBe('hobby')
    expect(normalizePlan('starter')).toBe('hobby')
    expect(normalizePlan('pro')).toBe('pro')
    expect(normalizePlan('max')).toBe('business')
    expect(normalizePlan('business')).toBe('business')
    expect(normalizePlan('trial')).toBe('trial')
    expect(normalizePlan(undefined)).toBe('hobby')
  })

  it('exposes brand labels', () => {
    expect(planLabel('max')).toBe('Business')
    expect(planLabel('pro')).toBe('Pro')
    expect(planLabel('starter')).toBe('Hobby')
  })

  it('parses on-demand fields from /api/account/plan', async () => {
    const api = vi.fn(async () => ({
      ok: true,
      json: {
        plan: 'pro',
        status: 'active',
        has_customer: true,
        included_usd: 40,
        ondemand: {
          enabled: true,
          spend_limit_usd: 25,
          max_spend_limit_usd: 50,
          used_usd: 3.5,
          included_used_usd: 40,
          metered: true,
          billed_on: 'next_invoice'
        }
      }
    }))
    window.work4youDesktop = { cloud: { api } } as never

    const plan = await fetchAccountPlan()
    expect(plan?.ondemand.enabled).toBe(true)
    expect(plan?.ondemand.spendLimitUsd).toBe(25)
    expect(plan?.ondemand.maxSpendLimitUsd).toBe(50)
    expect(plan?.ondemand.usedUsd).toBe(3.5)
    expect(plan?.ondemand.metered).toBe(true)
    expect(plan?.ondemand.billedOn).toBe('next_invoice')
    expect(plan?.includedUsd).toBe(40)
  })

  it('PATCHes spend-limit then refreshes plan', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: { ok: true } })
      .mockResolvedValueOnce({
        ok: true,
        json: {
          plan: 'pro',
          status: 'active',
          has_customer: true,
          included_usd: 40,
          ondemand: {
            enabled: true,
            spend_limit_usd: 15,
            max_spend_limit_usd: 50,
            used_usd: 0,
            included_used_usd: 0
          }
        }
      })
    window.work4youDesktop = { cloud: { api } } as never

    const plan = await saveSpendLimit({ enabled: true, spendLimitUsd: 15 })
    expect(api).toHaveBeenNthCalledWith(1, {
      method: 'PATCH',
      path: '/api/account/spend-limit',
      body: { enabled: true, spend_limit_usd: 15 }
    })
    expect(plan?.ondemand.spendLimitUsd).toBe(15)
  })
})
