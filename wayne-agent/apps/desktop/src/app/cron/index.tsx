import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { SearchField } from '@/components/ui/search-field'
import {
  createCronJob,
  createWebhook,
  type CronJob,
  deleteCronJob,
  deleteWebhook,
  enableWebhooks,
  getCronJobs,
  pauseCronJob,
  resumeCronJob,
  triggerCronJob,
  updateCronJob
} from '@/hermes'
import { useI18n } from '@/i18n'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { $cronFocusJobId, $cronJobs, setCronFocusJobId, setCronJobs, updateCronJobs } from '@/store/cron'
import { notify, notifyError } from '@/store/notifications'

import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { PanelRowMenu } from '../overlays/panel'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

import {
  allSiblingJobIds,
  clearScheduleSiblings,
  getScheduleSiblings,
  setScheduleSiblings
} from './automation-triggers'
import { AutomationEditor, type EditorMode, type EditorValues } from './automation-editor'
import { jobState, jobTitle } from './job-state'
import {
  computeRunStats,
  emptyRunStats,
  isJobActive,
  type RunStats
} from './run-stats'
import { RunsTable } from './runs-table'
import {
  DEFAULT_DELIVER,
  jobDeliver,
  jobPrompt,
  jobScheduleExpr,
  parseJobTimestamp,
  prettyJobSchedule
} from './schedule'

const truncate = (value: string, max = 80): string => (value.length > max ? `${value.slice(0, max)}…` : value)

function DeliveryIcon({ deliver }: { deliver: string }) {
  const name =
    deliver === 'email'
      ? 'mail'
      : deliver === 'local'
        ? 'desktop-download'
        : deliver === 'slack' || deliver === 'discord' || deliver === 'telegram'
          ? 'comment-discussion'
          : 'tools'

  return <Codicon className="shrink-0 text-foreground/65" name={name} size="0.85rem" />
}

function StatCard({
  label,
  loading,
  onClick,
  sparkline,
  value
}: {
  label: string
  loading?: boolean
  onClick?: () => void
  sparkline?: number[]
  value: string
}) {
  const max = sparkline ? Math.max(1, ...sparkline) : 1
  const body = (
    <>
      <div className="text-[0.7rem] font-medium text-foreground/70">{label}</div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="text-[1.35rem] font-semibold tabular-nums tracking-tight text-foreground">
          {loading ? '…' : value}
        </div>
        {sparkline ? (
          <div aria-hidden className="flex h-7 items-end gap-0.5">
            {sparkline.map((n, i) => (
              <span
                className="w-1 rounded-sm bg-foreground/25"
                key={i}
                style={{ height: `${Math.max(15, (n / max) * 100)}%` }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </>
  )
  const className = cn(
    'rounded-lg border border-(--ui-stroke-tertiary)/80 bg-(--ui-bg-quinary)/25 px-4 py-3 text-left',
    onClick && 'cursor-pointer transition-colors hover:bg-(--chrome-action-hover)'
  )

  if (onClick) {
    return (
      <button className={className} onClick={onClick} type="button">
        {body}
      </button>
    )
  }

  return <div className={className}>{body}</div>
}

function matchesQuery(job: CronJob, q: string): boolean {
  if (!q) {
    return true
  }

  const needle = q.toLowerCase()

  return [jobTitle(job), jobPrompt(job), jobScheduleExpr(job), jobDeliver(job)].some(value =>
    value.toLowerCase().includes(needle)
  )
}

interface CronViewProps extends React.ComponentProps<'section'> {
  onOpenSession?: (sessionId: string) => void
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

export function CronView({
  onOpenSession,
  setStatusbarItemGroup: _setStatusbarItemGroup,
  ...props
}: CronViewProps) {
  const { t } = useI18n()
  const c = t.cron
  const jobs = useStore($cronJobs)
  const [loading, setLoading] = useState(jobs.length === 0)
  const [query, setQuery] = useState('')
  const [busyJobId, setBusyJobId] = useState<null | string>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [runStats, setRunStats] = useState<RunStats>(() => emptyRunStats())
  const [statsLoading, setStatsLoading] = useState(false)
  const focusJobId = useStore($cronFocusJobId)

  const [editor, setEditor] = useState<EditorMode | { mode: 'closed' }>({ mode: 'closed' })
  const [pendingDelete, setPendingDelete] = useState<CronJob | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showRuns, setShowRuns] = useState(false)
  const [runsQuery, setRunsQuery] = useState('')

  const refresh = useCallback(async () => {
    try {
      setCronJobs(await getCronJobs())
    } catch (err) {
      notifyError(err, c.failedLoad)
    } finally {
      setLoading(false)
    }
  }, [c])

  useRefreshHotkey(refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)

    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false

    setStatsLoading(true)
    void computeRunStats(jobs).then(stats => {
      if (!cancelled) {
        setRunStats(stats)
        setStatsLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [jobs])

  useEffect(() => {
    if (!focusJobId) {
      return
    }

    const match = jobs.find(job => job.id === focusJobId || (job.name?.trim() ?? '') === focusJobId)

    if (match) {
      setShowRuns(false)
      setEditor({ mode: 'edit', job: match })
    }

    setCronFocusJobId(null)
  }, [focusJobId, jobs])

  // Keep editor job in sync when the atom refreshes.
  useEffect(() => {
    if (editor.mode !== 'edit') {
      return
    }

    const fresh = jobs.find(job => job.id === editor.job.id)
    if (fresh && fresh !== editor.job) {
      setEditor({ mode: 'edit', job: fresh })
    }
  }, [jobs, editor])

  const siblingIds = useMemo(() => allSiblingJobIds(), [jobs])

  const primaryJobs = useMemo(
    () => jobs.filter(job => !siblingIds.has(job.id)),
    [jobs, siblingIds]
  )

  const visibleJobs = useMemo(
    () =>
      primaryJobs
        .filter(job => matchesQuery(job, query.trim()))
        .sort((a, b) => jobTitle(a).localeCompare(jobTitle(b))),
    [primaryJobs, query]
  )

  const totalCount = primaryJobs.length

  async function handlePauseResume(job: CronJob) {
    setBusyJobId(job.id)

    try {
      const isPaused = jobState(job) === 'paused' || !isJobActive(job)
      const siblings = getScheduleSiblings(job.id)
      const updated = isPaused ? await resumeCronJob(job.id) : await pauseCronJob(job.id)
      const siblingUpdates = await Promise.all(
        siblings.map(sibling =>
          (isPaused ? resumeCronJob(sibling.jobId) : pauseCronJob(sibling.jobId)).catch(() => null)
        )
      )
      updateCronJobs(rows =>
        rows.map(row => {
          if (row.id === updated.id) return updated
          const sibling = siblingUpdates.find(s => s && s.id === row.id)
          return sibling ?? row
        })
      )
      notify({
        kind: 'success',
        title: isPaused ? c.resumed : c.paused,
        message: truncate(jobTitle(job), 60)
      })
    } catch (err) {
      notifyError(err, c.failedUpdate)
    } finally {
      setBusyJobId(null)
    }
  }

  async function handleTrigger(job: CronJob) {
    setBusyJobId(job.id)

    try {
      const updated = await triggerCronJob(job.id)
      updateCronJobs(rows => rows.map(row => (row.id === job.id ? updated : row)))
      notify({ kind: 'success', title: c.triggered, message: c.triggerSoonHint })
    } catch (err) {
      notifyError(err, c.failedTrigger)
    } finally {
      setBusyJobId(null)
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) {
      return
    }

    setDeleting(true)

    try {
      const siblings = getScheduleSiblings(pendingDelete.id)
      await deleteCronJob(pendingDelete.id)
      await Promise.all(
        siblings.map(sibling => deleteCronJob(sibling.jobId).catch(() => undefined))
      )
      await deleteWebhook(`automation-${pendingDelete.id}`).catch(() => undefined)
      clearScheduleSiblings(pendingDelete.id)
      const removeIds = new Set([pendingDelete.id, ...siblings.map(s => s.jobId)])
      updateCronJobs(rows => rows.filter(row => !removeIds.has(row.id)))
      notify({ kind: 'success', title: c.deleted, message: truncate(jobTitle(pendingDelete), 60) })
      if (editor.mode === 'edit' && editor.job.id === pendingDelete.id) {
        setEditor({ mode: 'closed' })
      }
      setPendingDelete(null)
    } catch (err) {
      notifyError(err, c.failedDelete)
    } finally {
      setDeleting(false)
    }
  }

  async function syncScheduleSiblings(
    primary: CronJob,
    schedules: EditorValues['schedules'],
    shared: {
      deliver: string
      enabledToolsets: string[]
      model?: string
      name?: string
      prompt: string
      skills: string[]
      workdir?: null | string
    }
  ) {
    const extras = schedules.slice(1).filter(row => row.expr.trim())
    const previous = getScheduleSiblings(primary.id)
    const keepJobIds = new Set(extras.map(row => row.jobId).filter(Boolean) as string[])
    const removed = previous.filter(row => !keepJobIds.has(row.jobId))

    await Promise.all(removed.map(row => deleteCronJob(row.jobId).catch(() => undefined)))

    const nextSiblings: Array<{ expr: string; jobId: string }> = []
    let nextJobs = $cronJobs.get().filter(job => !removed.some(r => r.jobId === job.id))

    for (const [index, row] of extras.entries()) {
      const expr = row.expr.trim()
      const siblingName = shared.name
        ? `${shared.name} · ${index + 2}`
        : `${jobTitle(primary)} · ${index + 2}`

      if (row.jobId) {
        const updated = await updateCronJob(row.jobId, {
          prompt: shared.prompt,
          schedule: expr,
          name: siblingName,
          deliver: shared.deliver,
          model: shared.model ?? null,
          workdir: shared.workdir ?? null,
          skills: shared.skills,
          enabled_toolsets: shared.enabledToolsets
        })
        nextSiblings.push({ expr, jobId: updated.id })
        nextJobs = nextJobs.map(job => (job.id === updated.id ? updated : job))
        continue
      }

      const created = await createCronJob({
        prompt: shared.prompt,
        schedule: expr,
        name: siblingName,
        deliver: shared.deliver,
        model: shared.model,
        workdir: shared.workdir ?? undefined,
        skills: shared.skills,
        enabled_toolsets: shared.enabledToolsets
      })
      nextSiblings.push({ expr, jobId: created.id })
      nextJobs = [...nextJobs, created]
    }

    setScheduleSiblings(primary.id, nextSiblings)
    setCronJobs(nextJobs)
  }

  async function syncAutomationWebhook(jobId: string, wantWebhook: boolean) {
    const routeName = `automation-${jobId}`
    if (!wantWebhook) {
      await deleteWebhook(routeName).catch(() => undefined)
      return null
    }

    await enableWebhooks().catch(() => undefined)
    try {
      const created = await createWebhook({
        name: routeName,
        description: `Automation ${jobId}`,
        events: [],
        prompt: '',
        deliver: 'log',
        cron_job_id: jobId
      })
      return { name: created.name || routeName, url: created.url }
    } catch (err) {
      notify({
        kind: 'info',
        title: c.webhookSavedPartial,
        message: err instanceof Error ? err.message : c.webhookNeedsGateway
      })
      return null
    }
  }

  async function handleEditorSave(values: EditorValues) {
    const schedules = values.schedules.filter(row => row.expr.trim())
    const primarySchedule = schedules[0]?.expr?.trim()

    if (!primarySchedule) {
      throw new Error(c.promptScheduleRequired)
    }

    const composioTriggers = values.composioTriggers
      .filter(row => row.id && row.slug)
      .map(row => ({
        id: row.id,
        slug: row.slug,
        toolkit: row.toolkit ?? null
      }))

    const payload = {
      prompt: values.prompt,
      schedule: primarySchedule,
      name: values.name || undefined,
      deliver: values.deliver || DEFAULT_DELIVER,
      model: values.model || undefined,
      workdir: values.workdir || null,
      composio_triggers: composioTriggers,
      skills: values.skills,
      enabled_toolsets: values.enabledToolsets
    }

    const shared = {
      deliver: payload.deliver,
      enabledToolsets: values.enabledToolsets,
      model: payload.model,
      name: payload.name,
      prompt: payload.prompt,
      skills: values.skills,
      workdir: payload.workdir
    }

    if (editor.mode === 'create') {
      const created = await createCronJob({
        prompt: payload.prompt,
        schedule: payload.schedule,
        name: payload.name,
        deliver: payload.deliver,
        model: payload.model,
        workdir: payload.workdir ?? undefined,
        skills: payload.skills,
        enabled_toolsets: payload.enabled_toolsets
      })

      const webhookRoute = await syncAutomationWebhook(created.id, values.webhooks.length > 0)
      const withMeta = await updateCronJob(created.id, {
        composio_triggers: composioTriggers,
        webhook_route: webhookRoute
      })

      updateCronJobs(rows => [...rows.filter(row => row.id !== created.id), withMeta])
      await syncScheduleSiblings(withMeta, schedules, shared)
      const refreshed = (await getCronJobs()).find(job => job.id === withMeta.id) ?? withMeta
      setEditor({ mode: 'edit', job: refreshed })
      notify({ kind: 'success', title: c.created, message: truncate(jobTitle(withMeta), 60) })
      return refreshed
    }

    if (editor.mode === 'edit') {
      const webhookRoute = await syncAutomationWebhook(editor.job.id, values.webhooks.length > 0)
      const updated = await updateCronJob(editor.job.id, {
        prompt: payload.prompt,
        schedule: payload.schedule,
        name: values.name,
        deliver: payload.deliver,
        model: payload.model ?? null,
        workdir: payload.workdir,
        composio_triggers: composioTriggers,
        webhook_route: webhookRoute,
        skills: payload.skills,
        enabled_toolsets: payload.enabled_toolsets
      })

      updateCronJobs(rows => rows.map(row => (row.id === updated.id ? updated : row)))
      await syncScheduleSiblings(updated, schedules, shared)
      const refreshed = (await getCronJobs()).find(job => job.id === updated.id) ?? updated
      setEditor({ mode: 'edit', job: refreshed })
      notify({ kind: 'success', title: c.updated, message: truncate(jobTitle(updated), 60) })
      return refreshed
    }
  }

  function openCreate() {
    setShowRuns(false)
    setEditor({ mode: 'create' })
  }

  function openJob(job: CronJob) {
    setShowRuns(false)
    setEditor({ mode: 'edit', job })
  }

  function openRuns() {
    setEditor({ mode: 'closed' })
    setShowRuns(true)
  }

  function backToList() {
    setEditor({ mode: 'closed' })
    setShowRuns(false)
    setRunsQuery('')
  }

  const visibleRunRows = useMemo(() => {
    const q = runsQuery.trim().toLowerCase()

    if (!q) {
      return runStats.rows
    }

    return runStats.rows.filter(row => {
      return (
        row.jobName.toLowerCase().includes(q) ||
        row.outcome.toLowerCase().includes(q) ||
        (row.run.title?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [runStats.rows, runsQuery])

  return (
    <section
      {...props}
      className={cn('flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)', props.className)}
    >
      {loading && jobs.length === 0 ? (
        <PageLoader label={c.loading} />
      ) : editor.mode === 'create' || editor.mode === 'edit' ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          <AutomationEditor
            busy={editor.mode === 'edit' ? busyJobId === editor.job.id : false}
            editor={editor}
            onBack={backToList}
            onDelete={
              editor.mode === 'edit' ? () => setPendingDelete(editor.job) : undefined
            }
            onOpenSession={onOpenSession}
            onPauseResume={
              editor.mode === 'edit' ? () => void handlePauseResume(editor.job) : undefined
            }
            onSave={handleEditorSave}
            onTrigger={editor.mode === 'edit' ? () => void handleTrigger(editor.job) : undefined}
          />
        </div>
      ) : showRuns ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          <div className="mx-auto max-w-5xl px-8 pb-12 pt-[calc(var(--titlebar-height)+3.75rem)]">
            <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[0.75rem] text-foreground/70">
              <button className="hover:text-foreground" onClick={backToList} type="button">
                {c.title}
              </button>
              <Codicon className="text-foreground/50" name="chevron-right" size="0.7rem" />
              <span className="text-foreground">{c.runsTitle}</span>
            </nav>

            <header className="mb-10 space-y-2">
              <h1 className="text-[1.75rem] font-semibold tracking-tight text-foreground">{c.runsTitle}</h1>
            </header>

            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label={c.statSuccessful24h} loading={statsLoading} value={String(runStats.successful24h)} />
              <StatCard label={c.statFailed24h} loading={statsLoading} value={String(runStats.failed24h)} />
              <StatCard label={c.statSuccessful7d} loading={statsLoading} value={String(runStats.successful7d)} />
              <StatCard label={c.statFailed7d} loading={statsLoading} value={String(runStats.failed7d)} />
            </div>

            {runStats.rows.length > 0 ? (
              <div className="mb-4">
                <SearchField
                  containerClassName="max-w-md"
                  onChange={setRunsQuery}
                  placeholder={c.searchRuns}
                  value={runsQuery}
                />
              </div>
            ) : null}

            <RunsTable
              c={c}
              emptyLabel={
                runStats.rows.length === 0
                  ? c.emptyRunsTitle
                  : visibleRunRows.length === 0
                    ? c.emptyTitleSearch
                    : c.emptyRunsTitle
              }
              loading={statsLoading}
              nowMs={nowMs}
              onOpenSession={onOpenSession}
              rows={visibleRunRows}
            />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          <div className="mx-auto max-w-5xl px-8 pb-12 pt-[calc(var(--titlebar-height)+3.75rem)]">
            <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-2xl space-y-2">
                <h1 className="text-[1.75rem] font-semibold tracking-tight text-foreground">{c.title}</h1>
                <p className="text-[0.875rem] leading-relaxed text-foreground/70">{c.subtitle}</p>
              </div>
              <Button className="shrink-0 rounded-full px-4" onClick={openCreate} size="default">
                <Codicon name="add" size="0.9rem" />
                {c.newCron}
              </Button>
            </header>

            <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label={c.statTotal} value={String(totalCount)} />
              <StatCard
                label={c.statSuccessful7d}
                loading={statsLoading}
                value={String(runStats.successful7d)}
              />
              <StatCard label={c.statFailed7d} loading={statsLoading} value={String(runStats.failed7d)} />
              <StatCard
                label={c.statRunHistory}
                loading={statsLoading}
                onClick={openRuns}
                sparkline={runStats.sparkline}
                value={String(runStats.runs7d)}
              />
            </div>

            <div className="mb-4">
              <SearchField
                containerClassName="max-w-md"
                hints={
                  totalCount > 0
                    ? jobs
                        .map(jobTitle)
                        .filter(Boolean)
                        .slice(0, 5)
                        .map(title => t.common.tryHint(title))
                    : undefined
                }
                onChange={setQuery}
                placeholder={c.search}
                value={query}
              />
            </div>

            <div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)/80">
              <table className="w-full border-collapse text-left text-[0.8125rem]">
                <thead className="bg-(--ui-bg-quinary)/40 text-[0.7rem] font-medium text-foreground/70">
                  <tr className="border-b border-(--ui-stroke-tertiary)/80">
                    <th className="px-4 py-3 font-medium">{c.colName}</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">{c.colAuthor}</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">{c.colCreated}</th>
                    <th className="px-4 py-3 font-medium">{c.colStatus}</th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">{c.colTools}</th>
                    <th className="w-10 px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visibleJobs.length === 0 ? (
                    <tr>
                      <td className="px-4 py-16 text-center text-sm text-foreground/70" colSpan={6}>
                        <div className="mx-auto max-w-md space-y-1">
                          <div className="font-medium text-foreground/80">
                            {totalCount === 0 ? c.emptyTitleNew : c.emptyTitleSearch}
                          </div>
                          {totalCount === 0 ? (
                            <p className="text-[0.8rem] text-foreground/70">{c.emptyDescNew}</p>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visibleJobs.map(job => {
                      const active = isJobActive(job)
                      const createdMs = parseJobTimestamp(job.created_at)
                      const deliver = jobDeliver(job)
                      const scheduleLabel = prettyJobSchedule(job, c)

                      return (
                        <tr
                          className="group/row cursor-pointer border-b border-(--ui-stroke-tertiary)/60 last:border-b-0 transition-colors hover:bg-(--chrome-action-hover)"
                          data-automation-row={job.id}
                          key={job.id}
                          onClick={() => openJob(job)}
                        >
                          <td className="px-4 py-3.5">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">{jobTitle(job)}</div>
                              {scheduleLabel ? (
                                <div className="mt-0.5 truncate text-[0.7rem] text-foreground/65">
                                  {scheduleLabel}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="hidden px-4 py-3.5 text-foreground/70 sm:table-cell">{c.authorYou}</td>
                          <td className="hidden px-4 py-3.5 text-foreground/70 tabular-nums md:table-cell">
                            {createdMs ? relativeTime(createdMs, nowMs) : c.createdUnknown}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 text-[0.75rem]',
                                active ? 'text-foreground' : 'text-foreground/70'
                              )}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  'size-1.5 rounded-full',
                                  active ? 'bg-emerald-500' : 'bg-foreground/40'
                                )}
                              />
                              {active ? c.statusActive : c.statusInactive}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3.5 lg:table-cell">
                            <span className="inline-flex items-center gap-1.5 text-foreground/70">
                              <DeliveryIcon deliver={deliver} />
                              <span className="truncate">{c.deliveryLabels[deliver] ?? deliver}</span>
                            </span>
                          </td>
                          <td className="px-2 py-3.5" onClick={event => event.stopPropagation()}>
                            <PanelRowMenu
                              items={[
                                {
                                  icon: jobState(job) === 'paused' ? 'play' : 'debug-pause',
                                  label: jobState(job) === 'paused' ? c.resumeTitle : c.pauseTitle,
                                  onSelect: () => void handlePauseResume(job),
                                  disabled: busyJobId === job.id
                                },
                                {
                                  icon: 'play',
                                  label: c.triggerNow,
                                  onSelect: () => void handleTrigger(job),
                                  disabled: busyJobId === job.id
                                },
                                {
                                  icon: 'edit',
                                  label: c.edit,
                                  onSelect: () => openJob(job)
                                },
                                {
                                  icon: 'trash',
                                  label: t.common.delete,
                                  onSelect: () => setPendingDelete(job),
                                  tone: 'danger'
                                }
                              ]}
                              label={c.actionsFor(jobTitle(job))}
                            />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Dialog onOpenChange={open => !open && !deleting && setPendingDelete(null)} open={pendingDelete !== null}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{c.deleteTitle}</DialogTitle>
            <DialogDescription>
              {pendingDelete ? (
                <>
                  {c.deleteDescPrefix}
                  <span className="font-medium text-foreground">{truncate(jobTitle(pendingDelete), 60)}</span>
                  {c.deleteDescSuffix}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={deleting} onClick={() => setPendingDelete(null)} variant="outline">
              {t.common.cancel}
            </Button>
            <Button disabled={deleting} onClick={() => void handleConfirmDelete()} variant="destructive">
              {deleting ? c.deleting : t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
