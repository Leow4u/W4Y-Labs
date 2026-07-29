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
import { $yoloActive, setYoloActive } from '@/store/session'
import type { HermesConfigRecord } from '@/types/hermes'

import { peekHermesConfig, setHermesConfigCache, useHermesConfigRecord } from '../../hooks/use-config-record'

export type ApprovalsMode = 'manual' | 'smart'

const CHIP =
  'flex h-6 max-w-[14rem] items-center gap-1 rounded-md px-1.5 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground'

function readApprovalsMode(config: Record<string, unknown>): ApprovalsMode {
  const approvals = config.approvals
  if (approvals && typeof approvals === 'object' && !Array.isArray(approvals)) {
    const mode = (approvals as Record<string, unknown>).mode
    if (mode === 'smart') return 'smart'
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
  const [armedYolo, setArmedYolo] = useState(false)
  const [open, setOpen] = useState(false)

  // Same shared config cache the settings surfaces use, so changing the mode
  // here shows in Settings → General and vice versa. Reading it into local
  // component state instead left the two switches disagreeing.
  const { data: config } = useHermesConfigRecord()
  const approvalsMode = readApprovalsMode(config ?? {})

  useEffect(() => {
    if (!armedYolo) return
    const timer = window.setTimeout(() => setArmedYolo(false), 5000)
    return () => window.clearTimeout(timer)
  }, [armedYolo])

  const persistApprovalsMode = useCallback(async (mode: ApprovalsMode) => {
    let current: HermesConfigRecord | null = peekHermesConfig()

    if (!current) {
      current = await getHermesConfigRecord().catch(() => null)
    }

    if (!current) return

    const prev =
      current.approvals && typeof current.approvals === 'object' && !Array.isArray(current.approvals)
        ? (current.approvals as Record<string, unknown>)
        : {}
    const updated = { ...current, approvals: { ...prev, mode } }

    // Optimistic on the shared cache so both surfaces move together; roll the
    // cache back rather than leaving them out of step when the save fails.
    setHermesConfigCache(updated)

    try {
      await saveHermesConfig(updated)
    } catch {
      setHermesConfigCache(current)
    }
  }, [])

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
    (key: 'manual' | 'smart' | 'yolo') => {
      if (key === 'yolo') {
        if (!armedYolo) {
          setArmedYolo(true)
          return
        }
        setArmedYolo(false)
        void applySessionYolo(true)
        setOpen(false)
        return
      }
      setArmedYolo(false)
      if (yoloLive) void applySessionYolo(false)
      void persistApprovalsMode(key)
      setOpen(false)
    },
    [armedYolo, applySessionYolo, persistApprovalsMode, yoloLive]
  )

  const current: 'manual' | 'smart' | 'yolo' = yoloLive ? 'yolo' : approvalsMode
  const label =
    current === 'yolo' ? t.composer.modeYolo : current === 'smart' ? t.composer.modeAuto : t.composer.modeManual

  const items = [
    { key: 'manual' as const, label: t.composer.modeManual, hint: t.composer.modeManualHint },
    { key: 'smart' as const, label: t.composer.modeAuto, hint: t.composer.modeAutoHint },
    { key: 'yolo' as const, label: t.composer.modeYolo, hint: t.composer.modeYoloHint }
  ]

  return (
    <DropdownMenu
      onOpenChange={next => {
        setOpen(next)
        if (!next) setArmedYolo(false)
      }}
      open={open}
    >
      <DropdownMenuTrigger
        aria-label={t.composer.modeTitle}
        className={cn(CHIP, current === 'yolo' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}
        title={t.composer.modeTitle}
        type="button"
      >
        {current === 'yolo' ? (
          <Zap className={iconSize.sm} />
        ) : (
          <ShieldCheck className={iconSize.sm} />
        )}
        <span className="truncate">{label}</span>
        <ChevronDown className={cn(iconSize.sm, 'opacity-60')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" side="top" sideOffset={8}>
        <DropdownMenuLabel className="text-[0.65rem] uppercase tracking-[0.06em] text-muted-foreground">
          {t.composer.modeTitle}
        </DropdownMenuLabel>
        {items.map(item => {
          const active = current === item.key
          const armed = item.key === 'yolo' && armedYolo
          return (
            <DropdownMenuItem
              className={cn('flex flex-col items-start gap-0.5 py-2', armed && 'bg-amber-500/15')}
              key={item.key}
              onSelect={event => {
                event.preventDefault()
                pick(item.key)
              }}
            >
              <span className="flex w-full items-center gap-2">
                <span className={cn('min-w-0 flex-1 font-medium', item.key === 'yolo' && 'text-amber-700 dark:text-amber-300')}>
                  {armed ? t.composer.modeYoloConfirm : item.label}
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
