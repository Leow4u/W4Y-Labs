/**
 * Composer chip: where the NEXT (or live) session runs — Local vs cloud 24/7.
 * When a session is active, the picker locks but I2 brain handoff stays available.
 */
import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n'
import { Check, Cloud, iconSize, Monitor } from '@/lib/icons'
import { cloudRunAvailable, probeCloudLogin } from '@/lib/w4y-cloud-projects'
import { cn } from '@/lib/utils'
import { isCloudBrainSession } from '@/lib/cloud-sessions'
import { ensureCloudBrainActive, ensureLocalBrainActive } from '@/store/gateway'
import { notifyError } from '@/store/notifications'
import { $sessions } from '@/store/session'
import {
  $runTarget,
  $sessionRunTarget,
  isRunTargetLocked,
  markRunTargetUserChoice,
  resolveCwdForPreferredTarget,
  type RunTarget,
  setRunTarget,
  setSessionRunTarget,
  transferSessionBrain
} from '@/store/run-target'
import { setCurrentCwd } from '@/store/session'

const CHIP =
  'flex h-6 max-w-[12rem] items-center gap-1 rounded-md px-1.5 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground'

async function signInW4Y(): Promise<void> {
  const login = window.work4youDesktop?.w4y?.login
  if (!login) {
    throw new Error('login-unavailable')
  }
  const res = await login()
  if (!res?.ok) {
    throw new Error(res?.reason || 'login-failed')
  }
}

export function RunTargetChip({ sessionId }: { sessionId?: null | string }) {
  const { t } = useI18n()
  const c = t.composer
  const preferred = useStore($runTarget)
  const live = useStore($sessionRunTarget)
  const sessions = useStore($sessions)
  const locked = isRunTargetLocked(Boolean(sessionId))
  const value: RunTarget = locked ? live : preferred
  const available = cloudRunAvailable()
  const [open, setOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [transferring, setTransferring] = useState(false)

  const storedSession = sessionId ? sessions.find(s => s.id === sessionId) : undefined
  const onCloud = isCloudBrainSession(storedSession) || live === 'cloud'
  const handoffTarget: RunTarget = onCloud ? 'local' : 'cloud'

  useEffect(() => {
    if (!open || !available) return
    let alive = true
    setLoggedIn(null)
    void probeCloudLogin().then(r => {
      if (alive) setLoggedIn(r === true)
    })
    return () => {
      alive = false
    }
  }, [open, available])

  const applyTarget = (target: RunTarget) => {
    markRunTargetUserChoice(target)
    setRunTarget(target)
    setSessionRunTarget(target)
    setCurrentCwd(resolveCwdForPreferredTarget())
    if (target === 'cloud') {
      void ensureCloudBrainActive().catch(err => notifyError(err, c.runCloudUnavailable))
    } else {
      void ensureLocalBrainActive()
    }
  }

  const pick = (target: RunTarget) => {
    if (locked) return

    if (target === 'cloud' && loggedIn !== true) {
      void signInW4Y()
        .then(() => probeCloudLogin())
        .then(ok => {
          if (ok === true) {
            setLoggedIn(true)
            applyTarget('cloud')
            setOpen(false)
          }
        })
        .catch(err => notifyError(err, c.runCloudSignIn))
      return
    }

    applyTarget(target)
    setOpen(false)
  }

  const moveSession = () => {
    if (!sessionId || transferring) return

    if (handoffTarget === 'cloud' && loggedIn !== true) {
      void signInW4Y()
        .then(() => probeCloudLogin())
        .then(ok => {
          if (ok === true) {
            setLoggedIn(true)
            void runTransfer()
          }
        })
        .catch(err => notifyError(err, c.runCloudSignIn))
      return
    }

    void runTransfer()
  }

  const runTransfer = () => {
    if (!sessionId) return
    setTransferring(true)
    void transferSessionBrain(sessionId, handoffTarget)
      .catch(err => notifyError(err, c.brainHandoffFailed))
      .finally(() => {
        setTransferring(false)
        setOpen(false)
      })
  }

  const label = value === 'cloud' ? c.runCloudOption : c.runLocalOption
  const Icon = value === 'cloud' ? Cloud : Monitor

  if (!available) {
    return (
      <span aria-label={c.runWhereTooltip} className={cn(CHIP, 'cursor-default')} title={c.runWhereTooltip}>
        <Monitor className={iconSize.sm} />
        <span className="truncate">{c.runLocalOption}</span>
      </span>
    )
  }

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        aria-label={c.runWhereTooltip}
        className={cn(CHIP, locked && 'opacity-95')}
        title={locked ? c.runLockedHint : c.runWhereTooltip}
        type="button"
      >
        <Icon className={iconSize.sm} />
        <span className="truncate">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72" side="bottom" sideOffset={6}>
        {!locked ? (
          <>
            <DropdownMenuLabel className="px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)">
              {c.continueOn}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={e => {
                e.preventDefault()
                pick('local')
              }}
            >
              <Monitor className={iconSize.sm} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{c.runLocalOption}</span>
                <span className="block text-[0.65rem] text-muted-foreground">{c.runLocalHint}</span>
              </span>
              {value === 'local' && <Check className={cn(iconSize.sm, 'shrink-0')} />}
            </DropdownMenuItem>
            <DropdownMenuItem
              className={cn(loggedIn === false && 'opacity-80')}
              onSelect={e => {
                e.preventDefault()
                pick('cloud')
              }}
            >
              <Cloud className={iconSize.sm} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{c.runCloudOption}</span>
                <span className="block text-[0.65rem] text-muted-foreground">
                  {loggedIn === false ? c.runCloudSignIn : c.runCloudHint}
                </span>
              </span>
              {value === 'cloud' && <Check className={cn(iconSize.sm, 'shrink-0')} />}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel className="px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)">
              {c.runLockedHint}
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={transferring}
              onSelect={e => {
                e.preventDefault()
                moveSession()
              }}
            >
              {handoffTarget === 'cloud' ? <Cloud className={iconSize.sm} /> : <Monitor className={iconSize.sm} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">
                  {handoffTarget === 'cloud' ? c.brainHandoffToCloud : c.brainHandoffToLocal}
                </span>
                <span className="block text-[0.65rem] text-muted-foreground">{c.brainHandoffHint}</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[0.65rem] text-muted-foreground" disabled>
              {c.brainHandoffNote}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
