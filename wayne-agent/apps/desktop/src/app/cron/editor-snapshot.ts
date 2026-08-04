import type { CronComposioTrigger, CronJob } from '@/types/hermes'

import {
  getScheduleSiblings,
  type ScheduleTriggerRow,
  type WebhookTriggerRow
} from './automation-triggers'
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

const DEFAULT_MODEL = '__default__'
export const DEFAULT_SCHEDULE = '0 9 * * *'

export interface EditorValues {
  composioTriggers: CronComposioTrigger[]
  deliver: string
  enabledToolsets: string[]
  model: string
  name: string
  prompt: string
  /** All schedule trigger exprs; index 0 is the primary cron job. */
  schedules: ScheduleTriggerRow[]
  skills: string[]
  webhooks: WebhookTriggerRow[]
  workdir: string
}

export type NormalizedEditorSnapshot = {
  composioTriggers: Array<{ id: string; slug: string; toolkit: null | string }>
  deliver: string
  enabledToolsets: string[]
  model: string
  name: string
  prompt: string
  schedules: Array<{ custom: boolean; expr: string; jobId?: string }>
  skills: string[]
  webhooks: string[]
  workdir: string
}

function normalizeComposio(rows: CronComposioTrigger[]): NormalizedEditorSnapshot['composioTriggers'] {
  return rows
    .filter(row => row.id && row.slug)
    .map(row => ({
      id: row.id,
      slug: row.slug,
      toolkit: row.toolkit ?? null
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function normalizeSchedules(rows: ScheduleTriggerRow[]): NormalizedEditorSnapshot['schedules'] {
  return rows
    .map(row => ({
      custom: row.custom,
      expr: row.expr.trim(),
      ...(row.jobId ? { jobId: row.jobId } : {})
    }))
    .filter(row => row.expr)
}

function normalizeWebhooks(rows: WebhookTriggerRow[]): string[] {
  return rows.map(row => row.url.trim()).filter(Boolean).sort()
}

export function normalizeEditorValues(values: EditorValues): NormalizedEditorSnapshot {
  return {
    composioTriggers: normalizeComposio(values.composioTriggers),
    deliver: values.deliver.trim() || DEFAULT_DELIVER,
    enabledToolsets: [...values.enabledToolsets].sort(),
    model: values.model.trim() || DEFAULT_MODEL,
    name: values.name.trim(),
    prompt: values.prompt.trim(),
    schedules: normalizeSchedules(values.schedules),
    skills: [...values.skills].sort(),
    webhooks: normalizeWebhooks(values.webhooks),
    workdir: values.workdir.trim()
  }
}

export function emptyEditorSnapshot(): NormalizedEditorSnapshot {
  return normalizeEditorValues({
    composioTriggers: [],
    deliver: DEFAULT_DELIVER,
    enabledToolsets: [],
    model: DEFAULT_MODEL,
    name: '',
    prompt: '',
    schedules: [],
    skills: [],
    webhooks: [],
    workdir: ''
  })
}

export function editorSnapshotFromJob(job: CronJob): NormalizedEditorSnapshot {
  const primaryExpr = jobScheduleExpr(job) || DEFAULT_SCHEDULE
  const schedules: ScheduleTriggerRow[] = [
    {
      custom: scheduleOptionForExpr(primaryExpr).value === 'custom',
      expr: primaryExpr,
      id: 'primary'
    },
    ...getScheduleSiblings(job.id).map(sibling => ({
      custom: scheduleOptionForExpr(sibling.expr).value === 'custom',
      expr: sibling.expr,
      id: sibling.jobId,
      jobId: sibling.jobId
    }))
  ]

  const composio = Array.isArray(job.composio_triggers)
    ? job.composio_triggers
        .filter(row => row && typeof row.id === 'string' && typeof row.slug === 'string')
        .map(row => ({
          id: row.id,
          slug: row.slug,
          toolkit: row.toolkit ?? null
        }))
    : []

  const webhooks: WebhookTriggerRow[] = job.webhook_route?.url
    ? [{ id: 'webhook', url: job.webhook_route.url }]
    : []

  return normalizeEditorValues({
    composioTriggers: composio,
    deliver: jobDeliver(job),
    enabledToolsets: jobEnabledToolsets(job),
    model: jobModel(job) || DEFAULT_MODEL,
    name: job.name?.trim() ?? '',
    prompt: jobPrompt(job),
    schedules,
    skills: jobSkills(job),
    webhooks,
    workdir: jobWorkdir(job)
  })
}

export function editorSnapshotsEqual(a: NormalizedEditorSnapshot, b: NormalizedEditorSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function exportAutomationDocument(
  job: CronJob,
  values: EditorValues
): Record<string, unknown> {
  const schedules = normalizeSchedules(values.schedules)
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    job: {
      composio_triggers: values.composioTriggers,
      deliver: values.deliver,
      enabled_toolsets: values.enabledToolsets,
      model: values.model === DEFAULT_MODEL ? null : values.model || null,
      name: values.name.trim() || null,
      prompt: values.prompt.trim(),
      schedules: schedules.map(row => row.expr),
      skills: values.skills,
      webhook_urls: normalizeWebhooks(values.webhooks),
      workdir: values.workdir.trim() || null
    },
    source_job_id: job.id
  }
}
