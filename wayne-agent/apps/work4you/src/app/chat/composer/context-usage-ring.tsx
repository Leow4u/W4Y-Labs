import { useStore } from '@nanostores/react'
import { useMemo, useState } from 'react'

import { ContextUsagePanel } from '@/app/shell/context-usage-panel'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { HermesGateway } from '@/hermes'
import { useI18n } from '@/i18n'
import { LiveDuration, usageContextLabel } from '@/lib/statusbar'
import { cn } from '@/lib/utils'
import { $activeSessionId, $currentUsage, $sessionStartedAt } from '@/store/session'

/** Circular context-usage control for the composer (fills with %). */
export function ContextUsageRing({
  gateway,
  requestGateway
}: {
  gateway?: HermesGateway | null
  requestGateway?: <T>(method: string, params?: Record<string, unknown>) => Promise<T>
}) {
  const { t } = useI18n()
  const usage = useStore($currentUsage)
  const sessionStartedAt = useStore($sessionStartedAt)
  const activeSessionId = useStore($activeSessionId)
  const [open, setOpen] = useState(false)

  const pct = Math.max(0, Math.min(100, Math.round(usage.context_percent ?? 0)))
  const label = useMemo(() => usageContextLabel(usage), [usage])
  const circumference = 2 * Math.PI * 7
  const dash = (pct / 100) * circumference

  const request =
    requestGateway ??
    (gateway
      ? <T,>(method: string, params?: Record<string, unknown>) => gateway.request<T>(method, params)
      : null)

  if (!label && !usage.context_max && !sessionStartedAt) {
    return null
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t.shell.statusbar.openContextUsage}
          className="size-(--composer-control-size) shrink-0 rounded-md p-0 text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground"
          title={t.shell.statusbar.openContextUsage}
          type="button"
          variant="ghost"
        >
          <svg aria-hidden className="size-4" viewBox="0 0 20 20">
            <circle className="stroke-muted-foreground/25" cx="10" cy="10" fill="none" r="7" strokeWidth="2" />
            <circle
              className="stroke-foreground transition-[stroke-dasharray] duration-300"
              cx="10"
              cy="10"
              fill="none"
              r="7"
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              strokeWidth="2"
              transform="rotate(-90 10 10)"
            />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" side="top" sideOffset={8}>
        <div className="border-b border-border px-3 py-2 text-[0.75rem] text-muted-foreground">
          {sessionStartedAt ? (
            <span className="inline-flex items-center gap-1.5">
              <span>{t.shell.statusbar.session}</span>
              <LiveDuration since={sessionStartedAt} />
            </span>
          ) : (
            <span>{t.shell.statusbar.runtimeSessionElapsed}</span>
          )}
          {label ? <span className={cn('ml-2 tabular-nums')}>{label}</span> : null}
          {usage.context_max ? (
            <span className="ml-1 tabular-nums text-(--ui-text-tertiary)">{pct}%</span>
          ) : null}
        </div>
        {request ? (
          <ContextUsagePanel currentUsage={usage} requestGateway={request} sessionId={activeSessionId} />
        ) : (
          <div className="px-3 py-4 text-[0.75rem] text-muted-foreground">{label || '—'}</div>
        )}
      </PopoverContent>
    </Popover>
  )
}
