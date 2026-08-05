/**
 * Settings → Conta — Work4You profile + Plan & Usage (Cursor-style billing).
 * Plan / on-demand: `/api/account/plan` + spend-limit PATCH · Included %:
 * gateway `usage.account` · Upgrade/Manage: work4you.ai/planos (+ Stripe portal).
 */
import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import {
  fetchAccountPlan,
  fetchAccountUsageMeter,
  normalizePlan,
  openBillingPortal,
  openPlans,
  openUpgrade,
  planLabel,
  saveSpendLimit,
  type AccountPlan,
  type AccountUsageMeter
} from '@/lib/plans'
import { notifyError } from '@/store/notifications'
import { $gateway } from '@/store/gateway'

import { ListRow, SettingsContent, SettingsGroup, SettingsPageTitle } from './primitives'

interface AuthMe {
  display_name?: string | null
  email?: string | null
  user_id?: string | null
}

export function AccountSettings() {
  const { t } = useI18n()
  const a = t.settings.account
  const gateway = useStore($gateway)
  const [me, setMe] = useState<AuthMe | null>(null)
  const [accountPlan, setAccountPlan] = useState<AccountPlan | null>(null)
  const [meter, setMeter] = useState<AccountUsageMeter | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [ondemandEnabled, setOndemandEnabled] = useState(false)
  const [spendDraft, setSpendDraft] = useState('10')
  const [savingSpend, setSavingSpend] = useState(false)

  useEffect(() => {
    let cancelled = false
    const api = window.work4youDesktop?.cloud?.api

    void (async () => {
      try {
        if (api) {
          const [meRes, plan] = await Promise.all([
            api({ method: 'GET', path: '/api/auth/me' }).catch(() => null),
            fetchAccountPlan()
          ])
          if (cancelled) {
            return
          }
          if (meRes?.ok && meRes.json && typeof meRes.json === 'object') {
            setMe(meRes.json as AuthMe)
          }
          if (plan) {
            setAccountPlan(plan)
            setOndemandEnabled(plan.ondemand.enabled)
            const seed = plan.ondemand.spendLimitUsd || Math.min(10, plan.ondemand.maxSpendLimitUsd || 10)
            setSpendDraft(String(seed > 0 ? seed : 10))
          }
        } else {
          const plan = await fetchAccountPlan()
          if (!cancelled && plan) {
            setAccountPlan(plan)
            setOndemandEnabled(plan.ondemand.enabled)
            setSpendDraft(String(plan.ondemand.spendLimitUsd || 10))
          }
        }
      } finally {
        if (!cancelled) {
          setLoaded(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!gateway || gateway.connectionState !== 'open') {
      setMeter(null)
      return
    }

    let cancelled = false
    void fetchAccountUsageMeter((method, params) => gateway.request(method, params)).then(next => {
      if (!cancelled) {
        setMeter(next)
      }
    })

    return () => {
      cancelled = true
    }
  }, [gateway])

  const email = (me?.email || '').trim()
  const displayName = (me?.display_name || '').trim()
  const planChip = accountPlan ? planLabel(accountPlan.plan) : loaded ? a.planHobby : '…'
  const status = (accountPlan?.status || '').toLowerCase()
  const statusLabel =
    status === 'past_due' ? a.planStatusPastDue : status === 'canceled' ? a.planStatusCanceled : null

  const includedPct =
    meter?.configured && meter.usedPercent != null
      ? Math.max(0, Math.min(100, Math.round(meter.usedPercent)))
      : null
  const includedLabel =
    includedPct != null
      ? a.includedUsagePct(includedPct)
      : loaded
        ? a.includedUsageUnavailable
        : '…'
  const canManage = Boolean(accountPlan?.hasCustomer)
  const showUpgrade = !accountPlan || normalizePlan(accountPlan.plan) !== 'max'
  const canOndemand = Boolean(
    accountPlan?.hasCustomer && accountPlan.ondemand.maxSpendLimitUsd > 0 && (status === 'active' || status === 'trialing')
  )
  const maxSpend = accountPlan?.ondemand.maxSpendLimitUsd ?? 0
  const ondemandUsed = accountPlan?.ondemand.usedUsd
  const spendLimit = accountPlan?.ondemand.spendLimitUsd ?? 0

  const applySpendLimit = async (enabled: boolean, spendLimitUsd: number) => {
    if (!canOndemand && enabled) {
      openPlans()
      return
    }
    setSavingSpend(true)
    try {
      const next = await saveSpendLimit({ enabled, spendLimitUsd })
      if (next) {
        setAccountPlan(next)
        setOndemandEnabled(next.ondemand.enabled)
        if (next.ondemand.spendLimitUsd > 0) {
          setSpendDraft(String(next.ondemand.spendLimitUsd))
        }
      }
    } catch (err) {
      notifyError(err, a.spendLimitSaveFailed)
    } finally {
      setSavingSpend(false)
    }
  }

  return (
    <SettingsContent>
      <div className="mx-auto w-full max-w-2xl pt-1">
        <SettingsPageTitle title={a.title} />

        <SettingsGroup title={a.profileGroup}>
          <ListRow
            action={
              <span className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                {loaded ? displayName || a.signedOutName : '…'}
              </span>
            }
            description={loaded ? email || a.signedOutEmail : undefined}
            inset
            title={a.displayName}
          />
          <ListRow
            action={
              <span className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                {loaded ? email || '—' : '…'}
              </span>
            }
            inset
            title={a.email}
          />
        </SettingsGroup>

        <SettingsGroup
          footer={
            <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
              {a.planLogicHint}
            </p>
          }
          title={a.planUsageGroup}
        >
          <ListRow
            action={
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{planChip}</span>
                {statusLabel ? (
                  <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    {statusLabel}
                  </span>
                ) : null}
                {showUpgrade ? (
                  <Button onClick={() => openUpgrade('pro')} size="sm" type="button" variant="secondary">
                    {a.upgrade}
                  </Button>
                ) : null}
              </div>
            }
            description={a.currentPlanDesc}
            inset
            title={a.currentPlan}
          />

          <ListRow
            below={
              <div className="mt-2 space-y-1.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-(--ui-stroke-tertiary)/80">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${includedPct ?? 0}%` }}
                  />
                </div>
                <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                  {includedLabel}
                  {meter?.depleted ? ` · ${a.includedDepleted}` : null}
                </p>
              </div>
            }
            description={a.includedUsageDesc}
            inset
            title={a.includedUsage}
            wide
          />

          <ListRow
            action={<Switch checked={ondemandEnabled} disabled={savingSpend || !loaded} onCheckedChange={checked => {
              setOndemandEnabled(checked)
              const n = Math.min(maxSpend || 10, Math.max(1, Number(spendDraft) || 10))
              void applySpendLimit(checked, checked ? n : 0)
            }} />}
            description={canOndemand ? a.onDemandDesc : a.onDemandNeedsSubscription}
            inset
            title={a.onDemand}
          />

          {ondemandEnabled ? (
            <ListRow
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">$</span>
                  <Input
                    className="w-20"
                    disabled={savingSpend}
                    inputMode="decimal"
                    min={1}
                    max={maxSpend || undefined}
                    onChange={e => setSpendDraft(e.target.value)}
                    step="1"
                    type="number"
                    value={spendDraft}
                  />
                  <Button
                    disabled={savingSpend}
                    onClick={() => {
                      const n = Math.min(maxSpend, Math.max(1, Number(spendDraft) || 0))
                      void applySpendLimit(true, n)
                    }}
                    size="sm"
                    type="button"
                  >
                    {savingSpend ? a.spendLimitSaving : a.spendLimitSave}
                  </Button>
                </div>
              }
              description={a.spendLimitDesc(maxSpend)}
              inset
              title={a.spendLimit}
            />
          ) : null}

          <ListRow
            action={
              <span className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                {ondemandEnabled
                  ? a.onDemandUsageValue(ondemandUsed ?? 0, spendLimit)
                  : a.onDemandInactive}
              </span>
            }
            description={a.onDemandUsageDesc}
            inset
            title={a.onDemandUsage}
          />

          <ListRow
            action={
              <Button
                onClick={() => (canManage ? openBillingPortal() : openPlans())}
                size="sm"
                type="button"
                variant="textStrong"
              >
                {a.manageSubscription}
              </Button>
            }
            description={canManage ? a.manageSubscriptionDesc : a.manageSubscriptionNoCustomer}
            inset
            title={a.manageSubscription}
          />
        </SettingsGroup>
      </div>
    </SettingsContent>
  )
}

