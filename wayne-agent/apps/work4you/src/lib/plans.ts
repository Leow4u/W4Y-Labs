/**
 * Desktop Conta helpers — plan vocabulary + cloud/gateway fetchers.
 * Mirrors wayne-agent/web/src/lib/plans.ts for the Electron shell (bridge is
 * `/api/*` only; portal/checkout open as external work4you.ai pages).
 */
export type PlanKey = 'gratis' | 'essencial' | 'plus' | 'max'

export const PLAN_LABEL: Record<PlanKey, string> = {
  gratis: 'Grátis',
  essencial: 'Essencial',
  plus: 'Plus',
  max: 'Max'
}

export interface OndemandState {
  billedOn: 'next_invoice' | 'ceiling_only'
  enabled: boolean
  includedUsedUsd: number | null
  includedUsd: number
  maxSpendLimitUsd: number
  metered: boolean
  spendLimitUsd: number
  usedUsd: number | null
}

export interface AccountPlan {
  hasCustomer: boolean
  includedUsd: number
  ondemand: OndemandState
  plan: string
  status: string
}

const PLANS_ORIGIN = 'https://work4you.ai'
export const PLANS_URL = `${PLANS_ORIGIN}/planos`
export const BILLING_PORTAL_URL = `${PLANS_ORIGIN}/planos/portal`

/** Platform plan key (free/starter/pro/max/…) → UI PlanKey. Unknown → gratis. */
export function normalizePlan(raw: string | null | undefined): PlanKey {
  const p = (raw || '').toLowerCase().trim()
  if (p === 'starter' || p === 'essencial') return 'essencial'
  if (p === 'pro' || p === 'plus') return 'plus'
  if (p === 'max' || p === 'business') return 'max'
  if (p === 'free' || p === 'gratis') return 'gratis'
  return 'gratis'
}

export function planLabel(raw: string | null | undefined): string {
  return PLAN_LABEL[normalizePlan(raw)]
}

/** True when the tenant is on the subsidized Free tier (Relay 2.5 Fast only). */
export function isGratisPlan(raw: string | null | undefined): boolean {
  return normalizePlan(raw) === 'gratis'
}

/** Full catalog unlocks on Essencial and above. */
export function planUnlocksCatalogModels(raw: string | null | undefined): boolean {
  return !isGratisPlan(raw)
}

/** MAX mode requires Plus or Max. */
export function planUnlocksMax(raw: string | null | undefined): boolean {
  const k = normalizePlan(raw)
  return k === 'plus' || k === 'max'
}

export function openPlans(query?: string): void {
  const url = query ? `${PLANS_URL}?${query}` : PLANS_URL
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function openUpgrade(planHint?: PlanKey): void {
  const platformKey =
    planHint === 'essencial'
      ? 'starter'
      : planHint === 'plus'
        ? 'pro'
        : planHint === 'max'
          ? 'max'
          : undefined
  openPlans(platformKey ? `plan=${platformKey}` : undefined)
}

export function openBillingPortal(): void {
  window.open(BILLING_PORTAL_URL, '_blank', 'noopener,noreferrer')
}

function parseOndemand(data: Record<string, unknown>, includedFallback: number): OndemandState {
  const od = (data.ondemand && typeof data.ondemand === 'object' ? data.ondemand : {}) as Record<
    string,
    unknown
  >
  const includedUsd =
    typeof od.included_usd === 'number'
      ? od.included_usd
      : typeof data.included_usd === 'number'
        ? data.included_usd
        : includedFallback

  return {
    enabled: Boolean(od.enabled),
    spendLimitUsd: typeof od.spend_limit_usd === 'number' ? od.spend_limit_usd : 0,
    maxSpendLimitUsd: typeof od.max_spend_limit_usd === 'number' ? od.max_spend_limit_usd : 0,
    usedUsd: typeof od.used_usd === 'number' ? od.used_usd : null,
    includedUsedUsd: typeof od.included_used_usd === 'number' ? od.included_used_usd : null,
    includedUsd,
    metered: Boolean(od.metered),
    billedOn: od.billed_on === 'next_invoice' ? 'next_invoice' : 'ceiling_only'
  }
}

/** Tenant plan via Wayne → platform proxy. null = unknown / signed out. */
export async function fetchAccountPlan(): Promise<AccountPlan | null> {
  const api = window.work4youDesktop?.cloud?.api
  if (!api) {
    return null
  }

  try {
    const res = await api({ method: 'GET', path: '/api/account/plan' })
    if (!res.ok || !res.json || typeof res.json !== 'object') {
      return null
    }
    const data = res.json as Record<string, unknown>
    if (!data.plan) {
      return null
    }
    const includedUsd = typeof data.included_usd === 'number' ? data.included_usd : 0
    return {
      hasCustomer: Boolean(data.has_customer),
      plan: String(data.plan),
      status: String(data.status || 'inactive'),
      includedUsd,
      ondemand: parseOndemand(data, includedUsd)
    }
  } catch {
    return null
  }
}

/** Save on-demand enable + spend limit ($/cycle). */
export async function saveSpendLimit(opts: {
  enabled: boolean
  spendLimitUsd: number
}): Promise<AccountPlan | null> {
  const api = window.work4youDesktop?.cloud?.api
  if (!api) {
    return null
  }

  const res = await api({
    method: 'PATCH',
    path: '/api/account/spend-limit',
    body: {
      enabled: opts.enabled,
      spend_limit_usd: opts.spendLimitUsd
    }
  })
  if (!res.ok) {
    const err =
      res.json && typeof res.json === 'object' && 'error' in res.json
        ? String((res.json as { error?: string }).error || res.error || 'failed')
        : res.error || `HTTP ${res.status}`
    throw new Error(err)
  }

  return (await fetchAccountPlan()) ?? null
}

/** Included-usage meter from the live gateway (OpenRouter key ceiling %). */
export async function fetchAccountUsageMeter(
  request: <T>(method: string, params?: Record<string, unknown>) => Promise<T>
): Promise<AccountUsageMeter> {
  try {
    const res = await request<{
      configured?: boolean
      depleted?: boolean
      used_percent?: number | null
    }>('usage.account', {})
    return {
      configured: Boolean(res.configured),
      depleted: Boolean(res.depleted),
      usedPercent: typeof res.used_percent === 'number' ? res.used_percent : null
    }
  } catch {
    return { configured: false, depleted: false, usedPercent: null }
  }
}

export interface AccountUsageMeter {
  configured: boolean
  depleted: boolean
  usedPercent: number | null
}
