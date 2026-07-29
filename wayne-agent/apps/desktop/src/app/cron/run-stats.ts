import { getCronJobRuns, type CronJob, type SessionInfo } from '@/hermes'
import { DAY } from '@/lib/time'

import { jobState, jobTitle } from './job-state'

export const STATS_WINDOW_MS = 7 * DAY
export const DAY_WINDOW_MS = DAY
export const RUNS_FETCH_LIMIT = 50
export const RUNS_POLL_INTERVAL_MS = 8000

export type RunOutcome = 'completed' | 'failed' | 'running' | 'success'

export interface AutomationRunRow {
  jobId: string
  jobName: string
  outcome: RunOutcome
  run: SessionInfo
  source?: 'cron' | 'event'
}

export interface RunStats {
  failed24h: number
  failed7d: number
  rows: AutomationRunRow[]
  runs7d: number
  sparkline: number[]
  successful24h: number
  successful7d: number
}

export function emptyRunStats(): RunStats {
  return {
    failed24h: 0,
    failed7d: 0,
    rows: [],
    runs7d: 0,
    sparkline: Array.from({ length: 7 }, () => 0),
    successful24h: 0,
    successful7d: 0
  }
}

export function isJobActive(job: CronJob): boolean {
  const state = jobState(job)

  if (state === 'paused' || state === 'disabled' || state === 'completed') {
    return false
  }

  return job.enabled !== false
}

function jobFailedLast(job: CronJob): boolean {
  return job.last_status === 'error' || Boolean(job.last_error && job.last_status !== 'ok')
}

export function runOutcome(run: SessionInfo, job: CronJob, isNewest: boolean): RunOutcome {
  if (run.is_active && !run.ended_at) {
    return 'running'
  }

  if (isNewest && jobFailedLast(job)) {
    return 'failed'
  }

  if (isNewest && job.last_status === 'ok') {
    return 'success'
  }

  return 'completed'
}

export function runStartedMs(run: SessionInfo): number {
  return (run.started_at || run.last_active || 0) * 1000
}

export async function computeRunStats(jobs: CronJob[]): Promise<RunStats> {
  if (jobs.length === 0) {
    return emptyRunStats()
  }

  const now = Date.now()
  const since7d = now - STATS_WINDOW_MS
  const since24h = now - DAY_WINDOW_MS
  const sparkline = Array.from({ length: 7 }, () => 0)
  let successful7d = 0
  let failed7d = 0
  let successful24h = 0
  let failed24h = 0
  let runs7d = 0
  const rows: AutomationRunRow[] = []

  const results = await Promise.all(
    jobs.map(async job => {
      try {
        return { job, runs: await getCronJobRuns(job.id, RUNS_FETCH_LIMIT) }
      } catch {
        return { job, runs: [] as SessionInfo[] }
      }
    })
  )

  for (const { job, runs } of results) {
    const sorted = [...runs].sort((a, b) => runStartedMs(b) - runStartedMs(a))
    const newestId = sorted[0]?.id

    for (const run of sorted) {
      const t = runStartedMs(run)
      const outcome = runOutcome(run, job, run.id === newestId)

      rows.push({
        jobId: job.id,
        jobName: jobTitle(job),
        outcome,
        run,
        source: 'cron'
      })

      if (t < since7d) {
        continue
      }

      runs7d += 1
      const daysAgo = Math.min(6, Math.max(0, Math.floor((now - t) / DAY)))
      sparkline[6 - daysAgo] += 1

      const in24h = t >= since24h
      const countsAsFailed = outcome === 'failed'
      const countsAsSuccess = outcome === 'success' || outcome === 'completed'

      if (countsAsFailed) {
        failed7d += 1
        if (in24h) {
          failed24h += 1
        }
      } else if (countsAsSuccess) {
        successful7d += 1
        if (in24h) {
          successful24h += 1
        }
      }
    }
  }

  rows.sort((a, b) => runStartedMs(b.run) - runStartedMs(a.run))

  return { failed24h, failed7d, rows, runs7d, sparkline, successful24h, successful7d }
}
