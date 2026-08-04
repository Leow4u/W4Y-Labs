import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearch,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CronComposioTrigger, CronJob } from '@/hermes'
import { useI18n } from '@/i18n'
import {
  createConnectorTrigger,
  deleteConnectorTrigger,
  getConnectorTriggerTypes,
  getConnectorsStatus
} from '@/lib/connectors-api'
import type { ConnectorTriggerType } from '@/lib/connectors-types'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'

import {
  type ScheduleTriggerRow,
  type WebhookTriggerRow,
  newTriggerId
} from './automation-triggers'
import {
  clockSelectOptions,
  cronClockParts,
  formatNextRunLabel,
  localTimezoneLabel,
  parseClockValue,
  rewriteCronClock,
  SCHEDULED_TRIGGER_PRESETS,
  scheduleAtPrefix,
  scheduleOptionForExpr,
  scheduleSummary,
  scheduleSupportsTimeSelect
} from './schedule'

export interface TriggersPanelProps {
  composioTriggers: CronComposioTrigger[]
  job: CronJob | null
  /** Optional next_run hints for sibling schedule job ids. */
  nextRunByJobId?: Record<string, string | undefined>
  onComposioChange: (rows: CronComposioTrigger[]) => void
  onOpenChannels: () => void
  onSchedulesChange: (rows: ScheduleTriggerRow[]) => void
  onWebhooksChange: (rows: WebhookTriggerRow[]) => void
  onWebhookUrlHint?: (url: string) => void
  schedules: ScheduleTriggerRow[]
  webhookUrlHint: string
  webhooks: WebhookTriggerRow[]
}

export function TriggersPanel({
  composioTriggers,
  job,
  nextRunByJobId,
  onComposioChange,
  onOpenChannels,
  onSchedulesChange,
  onWebhooksChange,
  onWebhookUrlHint,
  schedules,
  webhookUrlHint,
  webhooks
}: TriggersPanelProps) {
  const { t } = useI18n()
  const c = t.cron
  const [menuQuery, setMenuQuery] = useState('')
  const [toolkitTypes, setToolkitTypes] = useState<Array<{ toolkit: string; types: ConnectorTriggerType[] }>>([])
  const [busySlug, setBusySlug] = useState<null | string>(null)
  const [loadingEvents, setLoadingEvents] = useState(false)

  const timezone = useMemo(() => localTimezoneLabel(), [])

  const refreshToolkitMenu = useCallback(async () => {
    setLoadingEvents(true)
    try {
      const status = await getConnectorsStatus('global').catch(() => null)
      const connected = (status?.accounts ?? [])
        .filter(a => (a.status || '').toUpperCase() === 'ACTIVE')
        .map(a => a.toolkit)
      const unique = [...new Set(connected)].slice(0, 12)
      const typed = await Promise.all(
        unique.map(async toolkit => {
          try {
            const { types } = await getConnectorTriggerTypes(toolkit)
            return { toolkit, types: types.slice(0, 16) }
          } catch {
            return { toolkit, types: [] as ConnectorTriggerType[] }
          }
        })
      )
      setToolkitTypes(typed.filter(row => row.types.length > 0))
    } finally {
      setLoadingEvents(false)
    }
  }, [])

  useEffect(() => {
    void refreshToolkitMenu()
  }, [refreshToolkitMenu])

  useEffect(() => {
    if (webhookUrlHint && webhooks.length === 0) {
      onWebhookUrlHint?.(webhookUrlHint)
    }
  }, [onWebhookUrlHint, webhookUrlHint, webhooks.length])

  const q = menuQuery.trim().toLowerCase()

  const filteredToolkits = useMemo(() => {
    if (!q) {
      return toolkitTypes
    }

    return toolkitTypes
      .map(row => ({
        ...row,
        types: row.types.filter(
          ty =>
            ty.name.toLowerCase().includes(q) ||
            ty.slug.toLowerCase().includes(q) ||
            row.toolkit.toLowerCase().includes(q)
        )
      }))
      .filter(row => row.types.length > 0)
  }, [q, toolkitTypes])

  function addSchedule(expr: string, custom = false) {
    onSchedulesChange([
      ...schedules,
      { id: newTriggerId(), expr, custom, jobId: undefined }
    ])
  }

  function updateSchedule(id: string, patch: Partial<ScheduleTriggerRow>) {
    onSchedulesChange(schedules.map(row => (row.id === id ? { ...row, ...patch } : row)))
  }

  function removeSchedule(id: string) {
    onSchedulesChange(schedules.filter(row => row.id !== id))
  }

  function addWebhook() {
    onWebhooksChange([
      ...webhooks,
      { id: newTriggerId(), url: webhookUrlHint.trim() }
    ])
    if (!webhookUrlHint.trim()) {
      onOpenChannels()
    }
  }

  function updateWebhook(id: string, url: string) {
    onWebhooksChange(webhooks.map(row => (row.id === id ? { ...row, url } : row)))
  }

  function removeWebhook(id: string) {
    onWebhooksChange(webhooks.filter(row => row.id !== id))
  }

  async function addComposioTrigger(ty: ConnectorTriggerType) {
    setBusySlug(ty.slug)
    try {
      const toolkit = (ty.toolkit || ty.slug.split('_')[0] || '').toLowerCase()
      const status = await getConnectorsStatus('global').catch(() => null)
      const account = (status?.accounts ?? []).find(
        a =>
          (a.toolkit || '').toLowerCase() === toolkit &&
          ['ACTIVE', 'INITIATED'].includes((a.status || '').toUpperCase())
      )
      if (!account?.id) {
        notifyError(
          new Error(c.triggerNeedsConnection.replace('{app}', toolkit || ty.name)),
          c.failedAddTrigger
        )
        return
      }

      const res = await createConnectorTrigger(ty.slug, 'global', undefined, account.id)
      const id = String(res.id || '').trim()
      if (!id) {
        throw new Error('Trigger created without id')
      }
      onComposioChange([
        ...composioTriggers.filter(row => row.id !== id && row.slug !== ty.slug),
        {
          id,
          slug: ty.slug,
          toolkit: ty.toolkit ?? toolkit
        }
      ])
      if (res.webhook) {
        onWebhookUrlHint?.(res.webhook)
      }
      if (res.warning) {
        notify({
          kind: 'info',
          title: c.triggerAdded,
          message: res.warning
        })
      } else {
        notify({ kind: 'success', title: c.triggerAdded, message: ty.name })
      }
    } catch (err) {
      notifyError(err, c.failedAddTrigger)
    } finally {
      setBusySlug(null)
    }
  }

  async function removeComposioTrigger(trigger: CronComposioTrigger) {
    if (!trigger.id) {
      return
    }

    setBusySlug(trigger.id)
    try {
      await deleteConnectorTrigger(trigger.id)
      onComposioChange(composioTriggers.filter(row => row.id !== trigger.id))
      notify({ kind: 'success', title: c.triggerRemoved, message: trigger.slug })
    } catch (err) {
      notifyError(err, c.failedRemoveTrigger)
    } finally {
      setBusySlug(null)
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      notify({ kind: 'success', title: t.common.copied, message: text })
    } catch {
      notifyError(new Error('copy failed'), t.common.copyFailed)
    }
  }

  const hasAnyTrigger =
    schedules.length > 0 || composioTriggers.length > 0 || webhooks.length > 0

  const addTriggerMenu = (centered: boolean) => (
    <DropdownMenu
      onOpenChange={open => {
        if (!open) {
          setMenuQuery('')
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 text-left text-[0.8rem] text-foreground/80 transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground',
            centered ? 'justify-center rounded-md px-3 py-2.5' : 'w-full px-3 py-2.5'
          )}
          type="button"
        >
          <Codicon name="add" size="0.85rem" />
          {c.addTrigger}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-0">
        <DropdownMenuSearch
          onValueChange={setMenuQuery}
          placeholder={c.searchTriggers}
          value={menuQuery}
        />
        <div className="max-h-72 overflow-y-auto py-1">
          {(!q || c.scheduledTrigger.toLowerCase().includes(q)) && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2 px-2.5 text-xs">
                <Codicon name="watch" size="0.85rem" />
                {c.scheduledTrigger}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {SCHEDULED_TRIGGER_PRESETS.map(preset => (
                  <DropdownMenuItem
                    key={preset.value}
                    onSelect={() => addSchedule(preset.expr, false)}
                  >
                    {c.scheduleLabels[preset.value] ?? preset.value}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => addSchedule('0 9 * * *', true)}>
                  {c.customScheduleLabel}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {filteredToolkits.length > 0 ? (
            <>
              <DropdownMenuLabel className="px-2.5 text-[0.625rem] uppercase tracking-wide text-foreground/65">
                {c.composioTriggers}
              </DropdownMenuLabel>
              {filteredToolkits.map(row => (
                <DropdownMenuSub key={row.toolkit}>
                  <DropdownMenuSubTrigger className="gap-2 px-2.5 text-xs">
                    <Codicon name="zap" size="0.85rem" />
                    {row.toolkit}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    {row.types.map(ty => (
                      <DropdownMenuItem
                        disabled={busySlug === ty.slug}
                        key={ty.slug}
                        onSelect={() => void addComposioTrigger(ty)}
                      >
                        <div className="min-w-0">
                          <div className="truncate">{ty.name}</div>
                          {ty.description ? (
                            <div className="truncate text-[0.65rem] text-foreground/65">
                              {ty.description}
                            </div>
                          ) : null}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </>
          ) : loadingEvents ? (
            <div className="px-2.5 py-2 text-xs text-foreground/65">{c.loadingTriggers}</div>
          ) : null}

          {(!q || c.webhookTrigger.toLowerCase().includes(q)) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 px-2.5 text-xs" onSelect={() => addWebhook()}>
                <Codicon name="link" size="0.85rem" />
                {c.webhookTrigger}
              </DropdownMenuItem>
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-[0.75rem] font-medium text-foreground/70">{c.triggersSection}</h3>
        <p className="mt-0.5 text-[0.65rem] text-foreground/65">{c.triggersHint}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-(--ui-stroke-tertiary)/70 bg-(--ui-bg-quinary)/15">
        {!hasAnyTrigger ? (
          <div className="flex justify-center px-3 py-8">{addTriggerMenu(true)}</div>
        ) : (
          <>
            {schedules.map(row => {
              const clock = cronClockParts(row.expr)
              const showTimeSelect = scheduleSupportsTimeSelect(row.expr) && Boolean(clock)
              const option = scheduleOptionForExpr(row.expr)
              const label = showTimeSelect
                ? scheduleAtPrefix(row.expr, c)
                : scheduleSummary(option, row.expr, c) || c.scheduledTrigger
              const hintJob =
                row.jobId && nextRunByJobId?.[row.jobId]
                  ? ({ next_run_at: nextRunByJobId[row.jobId] } as CronJob)
                  : row.jobId
                    ? null
                    : job && schedules[0]?.id === row.id
                      ? job
                      : null
              const nextRunLabel = formatNextRunLabel(hintJob, row.expr, c)

              return (
                <div key={row.id}>
                  <div className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary)/60 px-3 py-2.5">
                    <Codicon className="shrink-0 text-foreground/65" name="watch" size="0.9rem" />
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[0.8rem] text-foreground">{label}</span>
                      {showTimeSelect && clock ? (
                        <Select
                          onValueChange={value => {
                            const next = parseClockValue(value)
                            if (!next) return
                            updateSchedule(row.id, {
                              expr: rewriteCronClock(row.expr, next.hour, next.minute)
                            })
                          }}
                          value={`${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`}
                        >
                          <SelectTrigger className="h-7 w-auto min-w-[5.5rem] gap-1 rounded-md border-(--ui-stroke-tertiary)/70 px-2 text-[0.8rem]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {clockSelectOptions(clock).map(option => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                      {timezone ? (
                        <span className="text-[0.7rem] text-foreground/65">{timezone}</span>
                      ) : null}
                    </div>
                    {nextRunLabel ? (
                      <span className="shrink-0 text-[0.7rem] text-foreground/65">{nextRunLabel}</span>
                    ) : null}
                    <button
                      className="shrink-0 rounded p-1 text-foreground/65 hover:bg-(--chrome-action-hover) hover:text-foreground"
                      onClick={() => removeSchedule(row.id)}
                      type="button"
                    >
                      <Codicon name="trash" size="0.85rem" />
                    </button>
                  </div>
                  {row.custom || option.value === 'custom' ? (
                    <div className="space-y-1.5 border-b border-(--ui-stroke-tertiary)/60 px-3 py-2.5">
                      <label className="text-xs font-medium text-foreground" htmlFor={`cron-${row.id}`}>
                        {c.customScheduleLabel}
                      </label>
                      <Input
                        className="font-mono"
                        id={`cron-${row.id}`}
                        onChange={event =>
                          updateSchedule(row.id, { expr: event.target.value, custom: true })
                        }
                        placeholder={c.customPlaceholder}
                        value={row.expr}
                      />
                      <p className="text-[0.66rem] text-foreground/65">{c.customHint}</p>
                    </div>
                  ) : null}
                </div>
              )
            })}

            {composioTriggers.map(trigger => (
              <div
                className="flex items-center justify-between gap-2 border-b border-(--ui-stroke-tertiary)/60 px-3 py-2.5"
                key={trigger.id || trigger.slug}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[0.8rem] font-medium text-foreground">
                    <Codicon className="shrink-0 text-foreground/65" name="zap" size="0.85rem" />
                    <span className="truncate">{trigger.slug}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[0.7rem] text-foreground/65">
                    {trigger.toolkit || c.composioTriggers}
                  </div>
                </div>
                <button
                  className="shrink-0 rounded p-1 text-foreground/65 hover:bg-(--chrome-action-hover) hover:text-foreground disabled:opacity-50"
                  disabled={busySlug === trigger.id}
                  onClick={() => void removeComposioTrigger(trigger)}
                  type="button"
                >
                  <Codicon name="trash" size="0.85rem" />
                </button>
              </div>
            ))}

            {webhooks.map(hook => (
              <div className="border-b border-(--ui-stroke-tertiary)/60 px-3 py-2.5" key={hook.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[0.8rem] font-medium text-foreground">
                      <Codicon name="link" size="0.85rem" />
                      {c.webhookTrigger}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Input
                        className="min-w-0 flex-1 font-mono text-[0.7rem]"
                        onChange={event => updateWebhook(hook.id, event.target.value)}
                        placeholder={c.webhookHint}
                        value={hook.url}
                      />
                      {hook.url ? (
                        <Button onClick={() => void copyText(hook.url)} size="sm" type="button" variant="outline">
                          {t.common.copy}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <button
                    className="shrink-0 rounded p-1 text-foreground/65 hover:bg-(--chrome-action-hover) hover:text-foreground"
                    onClick={() => removeWebhook(hook.id)}
                    type="button"
                  >
                    <Codicon name="trash" size="0.85rem" />
                  </button>
                </div>
              </div>
            ))}

            {addTriggerMenu(false)}
          </>
        )}
      </div>
    </section>
  )
}
