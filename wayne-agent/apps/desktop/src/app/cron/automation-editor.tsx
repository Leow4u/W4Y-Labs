import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  getCronJobRuns,
  getStatus,
  listWebhooks,
  type CronComposioTrigger,
  type CronJob,
  type SessionInfo
} from '@/hermes'
import { useI18n } from '@/i18n'
import type { Translations } from '@/i18n/types'
import { AlertTriangle } from '@/lib/icons'
import { requestModelOptions } from '@/lib/model-options'
import { modelLabel, prepareW4yPickerProviders } from '@/lib/w4y-featured-models'
import { $cronJobs } from '@/store/cron'
import { pickProjectFolder } from '@/store/projects'
import { notify, notifyError } from '@/store/notifications'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { MESSAGING_ROUTE, SKILLS_ROUTE } from '../routes'

import {
  type ScheduleTriggerRow,
  type WebhookTriggerRow,
  getScheduleSiblings,
  newTriggerId
} from './automation-triggers'
import { AutomationPromptField } from './automation-prompt-field'
import { jobTitle } from './job-state'
import {
  type AutomationRunRow,
  isJobActive,
  RUNS_POLL_INTERVAL_MS,
  runOutcome,
  runStartedMs
} from './run-stats'
import { RunsTable } from './runs-table'
import {
  DEFAULT_DELIVER,
  jobDeliver,
  jobEnabledToolsets,
  jobModel,
  jobPrompt,
  jobScheduleExpr,
  jobSkills,
  jobWorkdir,
  scheduleOptionForExpr
} from './schedule'
import { ToolsPanel } from './tools-panel'
import { TriggersPanel } from './triggers-panel'
import { jobHasInferenceDrift, parseInferenceDrift, type InferenceDriftDetails } from './inference-drift'
import {
  DEFAULT_SCHEDULE,
  editorSnapshotFromJob,
  editorSnapshotsEqual,
  emptyEditorSnapshot,
  exportAutomationDocument,
  normalizeEditorValues,
  type EditorValues
} from './editor-snapshot'

const WORKDIR_RECENTS_KEY = 'w4y.automations.workdir.recents'
const DEFAULT_MODEL = '__default__'

interface AuthMe {
  display_name?: null | string
  email?: null | string
}

export type { EditorValues }

export type EditorMode = { mode: 'create' } | { job: CronJob; mode: 'edit' }

interface AutomationEditorProps {
  busy?: boolean
  editor: EditorMode
  onBack: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  onOpenSession?: (sessionId: string, run?: SessionInfo) => void
  onPauseResume?: () => void
  onSave: (values: EditorValues) => Promise<CronJob | void>
  onResolveInferenceDrift?: (action: 'accept-current' | 'keep-original') => Promise<void>
  onTrigger?: () => void
}

function readWorkdirRecents(): string[] {
  try {
    const raw = localStorage.getItem(WORKDIR_RECENTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function pushWorkdirRecent(path: string) {
  const next = [path, ...readWorkdirRecents().filter(p => p !== path)].slice(0, 6)
  localStorage.setItem(WORKDIR_RECENTS_KEY, JSON.stringify(next))
}

export function AutomationEditor({
  busy,
  editor,
  onBack,
  onDelete,
  onDuplicate,
  onOpenSession,
  onPauseResume,
  onSave,
  onResolveInferenceDrift,
  onTrigger
}: AutomationEditorProps) {
  const { t } = useI18n()
  const c = t.cron
  const navigate = useNavigate()
  const isEdit = editor.mode === 'edit'
  const job = isEdit ? editor.job : null

  const [tab, setTab] = useState<'history' | 'settings'>('settings')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [schedules, setSchedules] = useState<ScheduleTriggerRow[]>([])
  const [webhooks, setWebhooks] = useState<WebhookTriggerRow[]>([])
  const [composioTriggers, setComposioTriggers] = useState<CronComposioTrigger[]>([])
  const [deliver, setDeliver] = useState(DEFAULT_DELIVER)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [workdir, setWorkdir] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [enabledToolsets, setEnabledToolsets] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [driftResolving, setDriftResolving] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const [webhookUrlHint, setWebhookUrlHint] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [historyRows, setHistoryRows] = useState<AutomationRunRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [recents, setRecents] = useState<string[]>(() => readWorkdirRecents())
  const [authorLabel, setAuthorLabel] = useState<null | string>(null)
  const allJobs = useStore($cronJobs)

  const nextRunByJobId = useMemo(() => {
    const map: Record<string, string | undefined> = {}
    for (const row of allJobs) {
      if (row.next_run_at) map[row.id] = row.next_run_at
    }
    return map
  }, [allJobs])

  useEffect(() => {
    setName(job ? (job.name?.trim() ?? '') : '')
    setPrompt(job ? jobPrompt(job) : '')
    if (job) {
      const primaryExpr = jobScheduleExpr(job) || DEFAULT_SCHEDULE
      const siblingRows = getScheduleSiblings(job.id).map(sibling => ({
        id: newTriggerId(),
        expr: sibling.expr,
        custom: scheduleOptionForExpr(sibling.expr).value === 'custom',
        jobId: sibling.jobId
      }))
      setSchedules([
        {
          id: newTriggerId(),
          expr: primaryExpr,
          custom: scheduleOptionForExpr(primaryExpr).value === 'custom'
        },
        ...siblingRows
      ])
    } else {
      setSchedules([])
    }
    const bound = job?.composio_triggers
    setComposioTriggers(
      Array.isArray(bound)
        ? bound
            .filter(row => row && typeof row.id === 'string' && typeof row.slug === 'string')
            .map(row => ({
              id: row.id,
              slug: row.slug,
              toolkit: row.toolkit ?? null
            }))
        : []
    )
    if (job?.webhook_route?.url) {
      setWebhooks([{ id: newTriggerId(), url: job.webhook_route.url }])
      setWebhookUrlHint(job.webhook_route.url)
    } else {
      setWebhooks([])
    }
    setDeliver(job ? jobDeliver(job) : DEFAULT_DELIVER)
    setModel(job ? jobModel(job) || DEFAULT_MODEL : DEFAULT_MODEL)
    setWorkdir(job ? jobWorkdir(job) : '')
    setSkills(job ? jobSkills(job) : [])
    setEnabledToolsets(job ? jobEnabledToolsets(job) : [])
    setError(null)
    setSaving(false)
    setTab('settings')
  }, [job, editor.mode])

  const modelOptions = useQuery({
    queryFn: () => requestModelOptions({ explicitOnly: true }),
    queryKey: ['model-options', 'automations']
  })

  const modelChoices = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [{ id: DEFAULT_MODEL, label: c.modelDefault }]
    for (const provider of prepareW4yPickerProviders(modelOptions.data?.providers)) {
      for (const id of provider.models ?? []) {
        if (!id) continue
        out.push({ id, label: modelLabel(id) })
      }
    }
    return out
  }, [c.modelDefault, modelOptions.data])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    const api = window.work4youDesktop?.cloud?.api
    if (!api) {
      return
    }

    void api({ method: 'GET', path: '/api/auth/me' })
      .then(res => {
        if (cancelled || !res.ok || !res.json || typeof res.json !== 'object') {
          return
        }

        const me = res.json as AuthMe
        const email = (me.email || '').trim()
        const displayName = (me.display_name || '').trim()
        setAuthorLabel(email || displayName || null)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const listed = await listWebhooks()
        const base = listed.base_url?.replace(/\/$/, '') || ''
        if (base && !cancelled && !webhookUrlHint) {
          // Hint only — real URL is set on save as automation-{jobId}.
          setWebhookUrlHint(`${base}/webhooks/automation`)
        }
      } catch {
        try {
          const status = await getStatus()
          const base = status.gateway_health_url?.replace(/\/health\/?$/, '') || ''
          if (base && !cancelled && !webhookUrlHint) {
            setWebhookUrlHint(`${base}/webhooks/automation`)
          }
        } catch {
          /* optional */
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  useEffect(() => {
    if (tab !== 'history' || !job) {
      return
    }

    let cancelled = false

    const load = async () => {
      setHistoryLoading(true)
      try {
        const runs = await getCronJobRuns(job.id, 50).catch(() => [] as SessionInfo[])
        if (cancelled) return

        const sorted = [...runs].sort((a, b) => runStartedMs(b) - runStartedMs(a))
        const newestId = sorted[0]?.id
        const cronRows: AutomationRunRow[] = sorted.map(run => ({
          jobId: job.id,
          jobName: jobTitle(job),
          outcome: runOutcome(run, job, run.id === newestId),
          run,
          source: 'cron'
        }))

        setHistoryRows(cronRows)
      } finally {
        if (!cancelled) {
          setHistoryLoading(false)
        }
      }
    }

    void load()
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load()
      }
    }, RUNS_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [job, tab])

  const active = job ? isJobActive(job) : false
  const title = name.trim() || (job ? jobTitle(job) : c.namePlaceholder)
  const folderLabel = workdir
    ? workdir.split(/[/\\]/).filter(Boolean).pop() || c.selectRepository
    : c.selectRepository

  const baselineSnapshot = useMemo(
    () => (job ? editorSnapshotFromJob(job) : emptyEditorSnapshot()),
    [job]
  )

  const currentValues = useMemo(
    (): EditorValues => ({
      composioTriggers,
      deliver,
      enabledToolsets,
      model,
      name,
      prompt,
      schedules,
      skills,
      webhooks,
      workdir
    }),
    [
      composioTriggers,
      deliver,
      enabledToolsets,
      model,
      name,
      prompt,
      schedules,
      skills,
      webhooks,
      workdir
    ]
  )

  const currentSnapshot = useMemo(() => normalizeEditorValues(currentValues), [currentValues])
  const isDirty = !editorSnapshotsEqual(baselineSnapshot, currentSnapshot)
  const canSave = isDirty && !saving && !busy && !driftResolving

  function downloadExport() {
    if (!job) {
      return
    }

    const slug = (name.trim() || job.id).replace(/[^\w.-]+/g, '-').slice(0, 48)
    const doc = exportAutomationDocument(job, currentValues)
    const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${slug || 'automation'}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    notify({ kind: 'success', title: c.exportedAutomation, message: anchor.download })
  }

  async function pickWorkdir() {
    try {
      const dir = await pickProjectFolder({ title: c.chooseFolder })
      if (!dir) return
      setWorkdir(dir)
      pushWorkdirRecent(dir)
      setRecents(readWorkdirRecents())
    } catch (err) {
      notifyError(err, c.failedPickFolder)
    }
  }

  async function handleSave() {
    const trimmedPrompt = prompt.trim()
    const cleanedSchedules = schedules
      .map(row => ({ ...row, expr: row.expr.trim() }))
      .filter(row => row.expr)

    if (!trimmedPrompt || cleanedSchedules.length === 0) {
      setError(c.promptScheduleRequired)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const saved = await onSave({
        composioTriggers,
        deliver,
        enabledToolsets,
        model: model === DEFAULT_MODEL ? '' : model,
        name: name.trim(),
        prompt: trimmedPrompt,
        schedules: cleanedSchedules,
        skills,
        webhooks,
        workdir: workdir.trim()
      })

      if (saved) {
        const siblings = getScheduleSiblings(saved.id)
        setSchedules([
          {
            id: schedules[0]?.id ?? newTriggerId(),
            expr: jobScheduleExpr(saved) || cleanedSchedules[0].expr,
            custom: scheduleOptionForExpr(jobScheduleExpr(saved) || cleanedSchedules[0].expr).value === 'custom'
          },
          ...siblings.map(sibling => ({
            id: newTriggerId(),
            expr: sibling.expr,
            custom: scheduleOptionForExpr(sibling.expr).value === 'custom',
            jobId: sibling.jobId
          }))
        ])
        const bound = saved.composio_triggers
        if (Array.isArray(bound)) {
          setComposioTriggers(
            bound
              .filter(row => row && typeof row.id === 'string' && typeof row.slug === 'string')
              .map(row => ({
                id: row.id,
                slug: row.slug,
                toolkit: row.toolkit ?? null
              }))
          )
        }
        if (saved.webhook_route?.url) {
          setWebhooks([{ id: webhooks[0]?.id ?? newTriggerId(), url: saved.webhook_route.url }])
          setWebhookUrlHint(saved.webhook_route.url)
        } else if (webhooks.length === 0) {
          setWebhooks([])
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : c.failedSave)
    } finally {
      setSaving(false)
    }
  }

  function handleTrigger() {
    onTrigger?.()
  }

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-[calc(var(--titlebar-height)+1rem)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-[0.75rem] text-foreground/65">
          <button className="hover:text-foreground" onClick={onBack} type="button">
            {c.title}
          </button>
          <Codicon className="text-foreground/45" name="chevron-right" size="0.7rem" />
          <span className="truncate text-foreground/85">{title}</span>
        </nav>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            className="text-foreground/85 hover:text-foreground disabled:opacity-35"
            disabled={!canSave}
            onClick={() => void handleSave()}
            size="sm"
            type="button"
            variant="text"
          >
            {saving ? t.common.saving : isEdit ? t.common.save : c.createAction}
          </Button>
          <Button
            className="text-foreground/75 hover:text-foreground"
            disabled={!isEdit || busy || !onTrigger}
            onClick={handleTrigger}
            size="icon-sm"
            title={c.triggerNow}
            type="button"
            variant="ghost"
          >
            <Codicon name="play" size="0.9rem" />
          </Button>
          {isEdit && job ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="text-foreground/75 hover:text-foreground"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Codicon name="ellipsis" size="0.9rem" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onDuplicate ? (
                  <DropdownMenuItem onSelect={onDuplicate}>
                    <Codicon name="copy" size="0.85rem" />
                    {c.duplicateAutomation}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={downloadExport}>
                  <Codicon name="export" size="0.85rem" />
                  {c.exportAutomation}
                </DropdownMenuItem>
                {onDelete ? <DropdownMenuSeparator /> : null}
                {onDelete ? (
                  <DropdownMenuItem onSelect={onDelete} variant="destructive">
                    <Codicon name="trash" size="0.85rem" />
                    {t.common.delete}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Input
          aria-label={c.nameLabel}
          className="h-auto min-h-0 w-auto min-w-[8rem] max-w-full flex-1 border-0 bg-transparent px-0 text-[1.625rem] font-semibold tracking-tight shadow-none placeholder:text-foreground/35 focus-visible:ring-0"
          onChange={event => setName(event.target.value)}
          placeholder={c.namePlaceholder}
          value={name}
        />

        <label className="inline-flex shrink-0 items-center gap-2 text-xs text-foreground/65">
          <Switch
            checked={active}
            disabled={!isEdit || busy || !onPauseResume}
            onCheckedChange={() => onPauseResume?.()}
            size="xs"
          />
          {active ? c.statusActive : c.statusInactive}
        </label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="inline-flex max-w-[14rem] shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-foreground/65 transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground"
              type="button"
            >
              <Codicon name="folder" size="0.85rem" />
              <span className="truncate">{folderLabel}</span>
              <Codicon className="text-foreground/45" name="chevron-down" size="0.7rem" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onSelect={() => void pickWorkdir()}>
              <Codicon name="folder-opened" size="0.85rem" />
              {c.chooseFolder}
            </DropdownMenuItem>
            {recents.map(path => (
              <DropdownMenuItem
                key={path}
                onSelect={() => {
                  setWorkdir(path)
                  pushWorkdirRecent(path)
                  setRecents(readWorkdirRecents())
                }}
              >
                <Codicon name="history" size="0.85rem" />
                <span className="truncate">{path}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setWorkdir('')
              }}
            >
              <Codicon name="close" size="0.85rem" />
              {c.noFolder}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {authorLabel ? (
          <span className="shrink-0 text-xs text-foreground/55">{c.byAuthor(authorLabel)}</span>
        ) : null}
      </div>

      {job?.last_error ? (
        jobHasInferenceDrift(job) && onResolveInferenceDrift ? (
          <InferenceDriftBanner
            busy={driftResolving || busy}
            details={parseInferenceDrift(job.last_error)}
            labels={c}
            onAcceptCurrent={() => {
              setDriftResolving(true)
              void onResolveInferenceDrift('accept-current').finally(() => setDriftResolving(false))
            }}
            onKeepOriginal={() => {
              setDriftResolving(true)
              void onResolveInferenceDrift('keep-original').finally(() => setDriftResolving(false))
            }}
          />
        ) : (
          <div className="mb-4 flex items-start gap-1.5 rounded bg-destructive/10 p-2 text-[0.7rem] text-destructive">
            <AlertTriangle className="mt-px size-3 shrink-0" />
            <span className="min-w-0 break-words">{job.last_error}</span>
          </div>
        )
      ) : null}

      <div className="mb-7 flex gap-1 border-b border-(--ui-stroke-tertiary)/60">
        {(
          [
            { id: 'settings' as const, label: c.tabSettings },
            { id: 'history' as const, label: c.tabHistory }
          ] as const
        ).map(item => (
          <button
            className={cn(
              'relative px-3 py-2 text-[0.8125rem] font-medium transition-colors',
              tab === item.id ? 'text-foreground' : 'text-foreground/60 hover:text-foreground'
            )}
            key={item.id}
            onClick={() => setTab(item.id)}
            type="button"
          >
            {item.label}
            {tab === item.id ? (
              <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-foreground" />
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'settings' ? (
        <div className="space-y-7">
          <TriggersPanel
            composioTriggers={composioTriggers}
            job={job}
            nextRunByJobId={nextRunByJobId}
            onComposioChange={setComposioTriggers}
            onOpenChannels={() => navigate(MESSAGING_ROUTE)}
            onSchedulesChange={setSchedules}
            onWebhookUrlHint={setWebhookUrlHint}
            onWebhooksChange={setWebhooks}
            schedules={schedules}
            webhookUrlHint={webhookUrlHint}
            webhooks={webhooks}
          />

          <section className="space-y-2">
            <h3 className="text-[0.8125rem] font-medium text-foreground/75">{c.instructionsSection}</h3>
            <div className="relative flex min-h-52 flex-col overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)/60 bg-background">
              <AutomationPromptField
                onChange={setPrompt}
                placeholder={c.promptPlaceholder}
                value={prompt}
                workdir={workdir}
              />
              <div className="absolute bottom-2 left-2">
                <Select onValueChange={setModel} value={model}>
                  <SelectTrigger className="h-7 w-auto max-w-[15rem] gap-1 rounded-md border-(--ui-stroke-tertiary)/70 bg-background px-2 text-[0.75rem] text-foreground/80 shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelChoices.map(choice => (
                      <SelectItem key={choice.id} value={choice.id}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <ToolsPanel
            deliver={deliver}
            enabledToolsets={enabledToolsets}
            onDeliverChange={setDeliver}
            onEnabledToolsetsChange={setEnabledToolsets}
            onOpenChannels={() => navigate(MESSAGING_ROUTE)}
            onOpenConnectors={() => navigate(`${SKILLS_ROUTE}?tab=connectors`)}
            onSkillsChange={setSkills}
            skills={skills}
          />

          {error ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {!job ? (
            <p className="text-sm text-foreground/70">{c.historySaveFirst}</p>
          ) : (
            <RunsTable
              c={c}
              emptyLabel={c.emptyRunsTitle}
              loading={historyLoading}
              nowMs={nowMs}
              onOpenSession={onOpenSession}
              rows={historyRows}
              showAutomationColumn={false}
            />
          )}
        </div>
      )}
    </div>
  )
}

function InferenceDriftBanner({
  busy,
  details,
  labels,
  onAcceptCurrent,
  onKeepOriginal
}: {
  busy?: boolean
  details: InferenceDriftDetails | null
  labels: Translations['cron']
  onAcceptCurrent: () => void
  onKeepOriginal: () => void
}) {
  const summary = details?.model
    ? labels.driftModelChange(details.model.from, details.model.to)
    : details?.provider
      ? labels.driftProviderChange(details.provider.from, details.provider.to)
      : labels.driftGeneric

  return (
    <div className="mb-4 space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
      <div className="flex items-start gap-2 text-[0.75rem] text-destructive">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-foreground">{labels.driftTitle}</p>
          <p className="text-foreground/80">{summary}</p>
          <p className="text-foreground/65">{labels.driftHint}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={onAcceptCurrent} size="sm" type="button" variant="default">
          {labels.driftAcceptCurrent}
        </Button>
        <Button disabled={busy} onClick={onKeepOriginal} size="sm" type="button" variant="outline">
          {labels.driftKeepOriginal}
        </Button>
      </div>
    </div>
  )
}

export { isJobActive }
