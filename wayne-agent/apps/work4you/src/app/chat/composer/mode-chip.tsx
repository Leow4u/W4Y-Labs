import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { getHermesConfigRecord, saveHermesConfig, type HermesGateway } from '@/hermes'
import { useI18n } from '@/i18n'
import { Check, ChevronDown, iconSize, ShieldCheck, Zap } from '@/lib/icons'
import { setSessionYolo } from '@/lib/yolo-session'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { $yoloActive, setYoloActive } from '@/store/session'
import type { HermesConfigRecord } from '@/types/hermes'

import { peekHermesConfig, setHermesConfigCache, useHermesConfigRecord } from '../../hooks/use-config-record'

export type ApprovalsMode = 'manual' | 'off' | 'smart'

/** What the chip can display: the three engine modes plus the session bypass. */
type ChipState = ApprovalsMode | 'yolo'

const CHIP =
  'flex h-6 max-w-[14rem] items-center gap-1 rounded-md px-1.5 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground'

/**
 * Mirrors `tools/approval.py::_normalize_approval_mode`, including the boolean
 * case: YAML 1.1 parses a bare `mode: off` as False, and the engine reads that
 * back as the 'off' string. Anything the engine treats as a bypass has to
 * arrive here as 'off' — collapsing it into 'manual' made the chip promise a
 * prompt the agent was never going to show.
 */
export function readApprovalsMode(config: Record<string, unknown>): ApprovalsMode {
  const approvals = config.approvals
  if (!approvals || typeof approvals !== 'object' || Array.isArray(approvals)) {
    return 'manual'
  }

  const mode = (approvals as Record<string, unknown>).mode
  if (typeof mode === 'boolean') {
    return mode ? 'manual' : 'off'
  }

  if (typeof mode !== 'string') {
    return 'manual'
  }

  const normalized = mode.trim().toLowerCase()
  if (normalized === 'smart' || normalized === 'off') {
    return normalized
  }

  return 'manual'
}

export function ModeChip({
  gateway,
  sessionId
}: {
  gateway?: HermesGateway | null
  sessionId?: null | string
}) {
  const { t } = useI18n()
  const yoloLive = useStore($yoloActive)
  // Both bypasses need a second click before they arm. `off` is the wider of
  // the two — it outlives the session — so it does not get the easier path.
  const [armed, setArmed] = useState<'off' | 'yolo' | null>(null)
  const [open, setOpen] = useState(false)

  // Same shared config cache the settings surfaces use, so changing the mode
  // here shows in Settings → General and vice versa. Reading it into local
  // component state instead left the two switches disagreeing.
  const { data: config } = useHermesConfigRecord()
  const approvalsMode = readApprovalsMode(config ?? {})

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(null), 5000)
    return () => window.clearTimeout(timer)
  }, [armed])

  const persistApprovalsMode = useCallback(
    async (mode: ApprovalsMode) => {
      let record: HermesConfigRecord | null = peekHermesConfig()

      if (!record) {
        record = await getHermesConfigRecord().catch(() => null)
      }

      // Silence here used to close the menu on the mode the user picked while
      // the agent kept the old one. A permission control that fails has to say
      // so, or the screen and the engine drift apart without anyone noticing.
      if (!record) {
        notify({ kind: 'error', message: t.composer.modeSaveFailed, title: t.composer.modeTitle })
        return
      }

      const prev =
        record.approvals && typeof record.approvals === 'object' && !Array.isArray(record.approvals)
          ? (record.approvals as Record<string, unknown>)
          : {}
      const updated = { ...record, approvals: { ...prev, mode } }

      // Optimistic on the shared cache so both surfaces move together; roll the
      // cache back rather than leaving them out of step when the save fails.
      setHermesConfigCache(updated)

      try {
        await saveHermesConfig(updated)
      } catch (error) {
        setHermesConfigCache(record)
        notifyError(error, t.composer.modeSaveFailed)
      }
    },
    [t]
  )

  const applySessionYolo = useCallback(
    async (on: boolean) => {
      setYoloActive(on)
      if (!sessionId || !gateway) return
      try {
        await setSessionYolo((method, params) => gateway.request(method, params), sessionId, on)
      } catch {
        setYoloActive(!on)
      }
    },
    [gateway, sessionId]
  )

  const pick = useCallback(
    (key: ChipState) => {
      if (key === 'yolo' || key === 'off') {
        if (armed !== key) {
          setArmed(key)
          if (key === 'yolo') {
            notify({
              kind: 'warning',
              title: t.composer.modeYolo,
              message: t.composer.modeYoloHint
            })
          }
          return
        }
        setArmed(null)
        if (key === 'yolo') {
          void applySessionYolo(true)
        } else {
          void persistApprovalsMode('off')
        }
        setOpen(false)
        return
      }
      setArmed(null)
      if (yoloLive) void applySessionYolo(false)
      void persistApprovalsMode(key)
      setOpen(false)
    },
    [armed, applySessionYolo, persistApprovalsMode, yoloLive]
  )

  // `off` outranks the session flag: it bypasses every chat, the CLI and cron,
  // so reporting the narrower "this session only" would understate what is on.
  const current: ChipState = approvalsMode === 'off' ? 'off' : yoloLive ? 'yolo' : approvalsMode
  const bypassing = current === 'off' || current === 'yolo'

  const items = [
    { hint: t.composer.modeManualHint, key: 'manual' as const, label: t.composer.modeManual },
    { hint: t.composer.modeAutoHint, key: 'smart' as const, label: t.composer.modeAuto },
    { hint: t.composer.modeYoloHint, key: 'yolo' as const, label: t.composer.modeYolo },
    { hint: t.composer.modeOffHint, key: 'off' as const, label: t.composer.modeOff }
  ]
  const label = items.find(item => item.key === current)?.label ?? t.composer.modeManual

  return (
    <DropdownMenu
      onOpenChange={next => {
        setOpen(next)
        if (!next) setArmed(null)
      }}
      open={open}
    >
      <DropdownMenuTrigger
        aria-label={t.composer.modeTitle}
        className={cn(CHIP, bypassing && 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}
        title={t.composer.modeTitle}
        type="button"
      >
        {bypassing ? <Zap className={iconSize.sm} /> : <ShieldCheck className={iconSize.sm} />}
        <span className="truncate">{label}</span>
        <ChevronDown className={cn(iconSize.sm, 'opacity-60')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" side="top" sideOffset={8}>
        <DropdownMenuLabel className="text-[0.65rem] uppercase tracking-[0.06em] text-muted-foreground">
          {t.composer.modeTitle}
        </DropdownMenuLabel>
        {items.map(item => {
          const active = current === item.key
          const isBypass = item.key === 'off' || item.key === 'yolo'
          const isArmed = armed === item.key
          return (
            <DropdownMenuItem
              className={cn('flex flex-col items-start gap-0.5 py-2', isArmed && 'bg-amber-500/15')}
              key={item.key}
              onSelect={event => {
                event.preventDefault()
                pick(item.key)
              }}
            >
              <span className="flex w-full items-center gap-2">
                <span className={cn('min-w-0 flex-1 font-medium', isBypass && 'text-amber-700 dark:text-amber-300')}>
                  {isArmed ? t.composer.modeYoloConfirm : item.label}
                </span>
                {active && <Check className={cn(iconSize.sm, 'shrink-0')} />}
              </span>
              <span className="text-[0.7rem] text-muted-foreground">{item.hint}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
