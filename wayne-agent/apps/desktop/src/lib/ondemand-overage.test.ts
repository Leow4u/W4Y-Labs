/**
 * Pure overage math — kept next to Conta/plans tests so CI covers the formula
 * without spinning up Next/Stripe. Mirrors platform/web/src/lib/billing.ts
 * `computeOndemandUsedUsd`.
 */
import { describe, expect, it } from 'vitest'

function computeOndemandUsedUsd(opts: {
  usage: number
  baseline: number | null | undefined
  includedUsd: number
  spendLimitUsd?: number
}): number {
  const baseline = opts.baseline
  if (baseline == null || !Number.isFinite(baseline)) return 0
  const included = Math.max(0, Number(opts.includedUsd) || 0)
  const cycle = Math.max(0, Number(opts.usage) - baseline)
  let ondemand = Math.max(0, cycle - included)
  const cap = opts.spendLimitUsd
  if (cap != null && Number.isFinite(cap) && cap > 0) {
    ondemand = Math.min(ondemand, cap)
  }
  return Number(ondemand.toFixed(2))
}

describe('computeOndemandUsedUsd (metered MVP)', () => {
  it('returns 0 without baseline', () => {
    expect(computeOndemandUsedUsd({ usage: 50, baseline: null, includedUsd: 16 })).toBe(0)
  })

  it('charges only beyond included', () => {
    expect(
      computeOndemandUsedUsd({ usage: 100, baseline: 70, includedUsd: 16, spendLimitUsd: 50 })
    ).toBe(14)
  })

  it('caps at spend limit', () => {
    expect(
      computeOndemandUsedUsd({ usage: 200, baseline: 100, includedUsd: 16, spendLimitUsd: 20 })
    ).toBe(20)
  })
})
