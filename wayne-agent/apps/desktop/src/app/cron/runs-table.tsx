import { Codicon } from '@/components/ui/codicon'
import type { SessionInfo } from '@/hermes'
import type { Translations } from '@/i18n'
import { coarseElapsed } from '@/lib/time'
import { cn } from '@/lib/utils'

import type { AutomationRunRow, RunOutcome } from './run-stats'
import { runStoryText } from './run-stats'

function formatRunTime(seconds?: null | number): string {
  if (!seconds) {
    return '—'
  }

  const date = new Date(seconds * 1000)

  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString()
}

function formatRunDuration(run: SessionInfo, nowMs: number): string {
  const start = run.started_at

  if (!start) {
    return '—'
  }

  const endSeconds = run.ended_at || (run.is_active ? nowMs / 1000 : run.last_active)

  if (!endSeconds || endSeconds < start) {
    return '—'
  }

  const { unit, value } = coarseElapsed((endSeconds - start) * 1000)

  if (unit === 'second') {
    return `${value}s`
  }

  if (unit === 'minute') {
    return `${value}m`
  }

  if (unit === 'hour') {
    return `${value}h`
  }

  return `${value}d`
}

export function runStatusLabel(outcome: RunOutcome, c: Translations['cron']): string {
  if (outcome === 'running') {
    return c.runStatusRunning
  }

  if (outcome === 'failed') {
    return c.runStatusFailed
  }

  if (outcome === 'success') {
    return c.runStatusSuccess
  }

  return c.runStatusCompleted
}

interface RunsTableProps {
  c: Translations['cron']
  emptyLabel: string
  loading?: boolean
  nowMs: number
  onOpenSession?: (sessionId: string) => void
  rows: AutomationRunRow[]
  showAutomationColumn?: boolean
}

export function RunsTable({
  c,
  emptyLabel,
  loading,
  nowMs,
  onOpenSession,
  rows,
  showAutomationColumn = true
}: RunsTableProps) {
  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center gap-1.5 py-10 text-sm text-foreground/70">
        <Codicon name="loading" size="0.85rem" spinning />
        {c.loading}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)/80 bg-(--ui-chat-surface-background)">
      <table className="w-full border-collapse text-left text-[0.8125rem]">
        <thead className="bg-(--ui-bg-quinary)/40 text-[0.7rem] font-medium text-foreground/70">
          <tr className="border-b border-(--ui-stroke-tertiary)/80">
            {showAutomationColumn ? <th className="px-4 py-3 font-medium">{c.colAutomation}</th> : null}
            <th className="px-4 py-3 font-medium">{c.colTriggered}</th>
            <th className="hidden px-4 py-3 font-medium md:table-cell">{c.colStory}</th>
            <th className="hidden px-4 py-3 font-medium lg:table-cell">{c.colTools}</th>
            <th className="px-4 py-3 font-medium">{c.colStatus}</th>
            <th className="hidden px-4 py-3 font-medium xl:table-cell">{c.colDuration}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                className="px-4 py-16 text-center text-sm text-foreground/70"
                colSpan={showAutomationColumn ? 6 : 5}
              >
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map(row => {
              const active = row.outcome === 'running'
              const failed = row.outcome === 'failed'
              const story = runStoryText(row.run)

              return (
                <tr
                  className="group/row cursor-pointer border-b border-(--ui-stroke-tertiary)/60 last:border-b-0 transition-colors hover:bg-(--chrome-action-hover)"
                  key={`${row.jobId}:${row.run.id}`}
                  onClick={() => onOpenSession?.(row.run.id)}
                  title={c.openRunStory}
                >
                  {showAutomationColumn ? (
                    <td className="px-4 py-3.5">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{row.jobName}</div>
                        <div className="mt-0.5 truncate text-[0.7rem] text-foreground/65 sm:hidden">
                          {formatRunTime(row.run.started_at || row.run.last_active)}
                        </div>
                      </div>
                    </td>
                  ) : null}
                  <td className="px-4 py-3.5 text-foreground/70 tabular-nums">
                    {formatRunTime(row.run.started_at || row.run.last_active)}
                  </td>
                  <td className="hidden max-w-[16rem] px-4 py-3.5 text-foreground/70 md:table-cell">
                    <span className="line-clamp-2 text-[0.75rem] leading-snug">{story}</span>
                  </td>
                  <td className="hidden px-4 py-3.5 text-foreground/70 tabular-nums lg:table-cell">
                    {row.run.tool_call_count > 0 ? String(row.run.tool_call_count) : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-[0.75rem]',
                        failed ? 'text-destructive' : active ? 'text-foreground' : 'text-foreground/70'
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'size-1.5 rounded-full',
                          failed
                            ? 'bg-destructive'
                            : active
                              ? 'bg-emerald-500'
                              : row.outcome === 'success'
                                ? 'bg-emerald-500/80'
                                : 'bg-foreground/40'
                        )}
                      />
                      {runStatusLabel(row.outcome, c)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 text-foreground/70 tabular-nums xl:table-cell">
                    {formatRunDuration(row.run, nowMs)}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
