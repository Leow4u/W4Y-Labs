/**
 * Account chip at the left-sidebar foot — Settings, Command Center, Language,
 * Plans. Identity comes from cloud `/api/auth/me` (email / display_name);
 * fail-open label when signed out.
 *
 * Beside the name: update pill when an update is available; otherwise a
 * minimal "?" help chip (shortcuts / get help / feedback), Codex-style.
 */
import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { DOCS_ROUTE, NEW_CHAT_ROUTE } from '@/app/routes'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { type Locale, LOCALE_META, useI18n } from '@/i18n'
import {
  Check,
  Command,
  Download,
  FileText,
  Globe,
  HelpCircle,
  Loader2,
  LogOut,
  MessageSquareText,
  Settings,
  Zap
} from '@/lib/icons'
import { cn } from '@/lib/utils'
import { openKeybindPanel } from '@/store/keybinds'
import { notifyError } from '@/store/notifications'
import { signOutFromWork4You } from '@/store/account-gate'
import { $connection } from '@/store/session'

import { prefetchCommandCenter, prefetchSettings } from '../../view-prefetch'
import {
  $backendUpdateApply,
  $backendUpdateStatus,
  $updateApply,
  $updateStatus,
  startActiveUpdate
} from '@/store/updates'

const PLANS_URL = 'https://work4you.ai/planos'
const HELP_URL = 'https://work4you.ai/docs'
const FEEDBACK_URL = 'https://work4you.ai/feedback'

interface AuthMe {
  display_name?: string | null
  email?: string | null
  user_id?: string | null
}

function initialsOf(label: string): string {
  const parts = label.split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return label.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?'
}

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

interface AccountMenuProps {
  onOpenCommandCenter: () => void
  onOpenSettings: () => void
}

export function AccountMenu({ onOpenCommandCenter, onOpenSettings }: AccountMenuProps) {
  const navigate = useNavigate()
  const { t, locale, setLocale, isSavingLocale } = useI18n()
  const a = t.sidebar.account
  const [me, setMe] = useState<AuthMe | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [hasPlatformKey, setHasPlatformKey] = useState(false)
  const connection = useStore($connection)
  const updateStatus = useStore($updateStatus)
  const updateApply = useStore($updateApply)
  const backendUpdateStatus = useStore($backendUpdateStatus)
  const backendUpdateApply = useStore($backendUpdateApply)

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
        setMe(res.json as AuthMe)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void window.work4youDesktop?.w4y?.hasKey()?.then(res => {
      setHasPlatformKey(Boolean(res?.hasKey))
    })
  }, [])

  const email = (me?.email || '').trim()
  const displayName = (me?.display_name || '').trim()
  const label = displayName || email || a.fallbackName
  const secondary = email && displayName && email !== displayName ? email : null

  const remote = connection?.mode === 'remote'
  const clientBehind = updateStatus?.behind ?? 0
  const clientAvailable = Boolean(updateStatus?.updateAvailable || clientBehind > 0)
  const clientApplying = updateApply.applying || updateApply.stage === 'restart'
  const backendBehind = backendUpdateStatus?.behind ?? 0
  const backendAvailable = Boolean(backendUpdateStatus?.updateAvailable || backendBehind > 0)
  const backendApplying = backendUpdateApply.applying || backendUpdateApply.stage === 'restart'
  const updateAvailable = remote ? backendAvailable || clientAvailable : clientAvailable
  const applying = remote ? backendApplying || clientApplying : clientApplying
  const showUpdateToast = updateAvailable || applying
  const applyPercent = (() => {
    const clientPct = updateApply.percent
    const backendPct = backendUpdateApply.percent

    if (remote) {
      if (backendApplying && typeof backendPct === 'number') {
        return Math.max(0, Math.min(100, Math.round(backendPct)))
      }

      if (clientApplying && typeof clientPct === 'number') {
        return Math.max(0, Math.min(100, Math.round(clientPct)))
      }

      return null
    }

    return typeof clientPct === 'number' ? Math.max(0, Math.min(100, Math.round(clientPct))) : null
  })()

  const pickLocale = async (code: Locale) => {
    if (code === locale || isSavingLocale) {
      return
    }
    try {
      await setLocale(code)
    } catch (error) {
      notifyError(error, t.language.saveError)
    }
  }

  const canSignOut = Boolean(window.work4youDesktop?.w4y?.logout)
  const signedIn = Boolean(email || me?.user_id || hasPlatformKey)

  const signOut = async () => {
    if (signingOut) {
      return
    }
    setSigningOut(true)
    try {
      await signOutFromWork4You()
      if (import.meta.env.VITE_APP_SHELL !== 'browser') {
        navigate(NEW_CHAT_ROUTE, { replace: true })
      }
    } catch (error) {
      notifyError(error, a.signOutFailed)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className={cn(
              'h-9 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-left text-[0.8125rem] font-medium',
              'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground',
              '[-webkit-app-region:no-drag]'
            )}
            variant="ghost"
          >
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-md bg-(--ui-control-active-background) text-[0.65rem] font-semibold text-foreground"
            >
              {initialsOf(label)}
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60" side="top" sideOffset={6}>
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-medium text-foreground">{label}</div>
            {secondary ? <div className="truncate text-xs text-muted-foreground">{secondary}</div> : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onFocus={() => prefetchSettings()}
            onPointerEnter={() => prefetchSettings()}
            onSelect={() => {
              onOpenSettings()
            }}
          >
            <Settings className="size-3.5" />
            {a.settings}
          </DropdownMenuItem>
          <DropdownMenuItem
            onFocus={() => prefetchCommandCenter()}
            onPointerEnter={() => prefetchCommandCenter()}
            onSelect={() => {
              onOpenCommandCenter()
            }}
          >
            <Command className="size-3.5" />
            {a.commandCenter}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe className="size-3.5" />
              {a.language}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              {(Object.entries(LOCALE_META) as Array<[Locale, (typeof LOCALE_META)[Locale]]>).map(
                ([code, meta]) => (
                  <DropdownMenuItem
                    key={code}
                    onSelect={() => {
                      void pickLocale(code)
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{meta.name}</span>
                    {code === locale ? <Check className="size-3.5 opacity-80" /> : null}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openExternal(PLANS_URL)}>
            <Zap className="size-3.5" />
            {a.viewPlans}
          </DropdownMenuItem>
          {canSignOut && signedIn ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={signingOut}
                onSelect={() => {
                  void signOut()
                }}
              >
                {signingOut ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
                {a.signOut}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {showUpdateToast ? (
        <button
          className={cn(
            'group/upd relative flex h-5 shrink-0 items-center justify-center self-center overflow-hidden rounded-full bg-primary text-[0.625rem] font-medium leading-none text-primary-foreground',
            'transition-colors hover:bg-primary/90',
            '[-webkit-app-region:no-drag]',
            applying ? 'min-w-[7.25rem] px-2' : 'px-[0.25rem]'
          )}
          disabled={applying}
          onClick={() => {
            if (applying) {
              return
            }

            // Silent apply: progress % lives on this chip; no changelog/download modals.
            startActiveUpdate()
          }}
          title={
            applying
              ? applyPercent != null
                ? a.updateInstallingProgress(applyPercent)
                : a.updateInstalling
              : a.updateAvailable
          }
          type="button"
        >
          {applying && applyPercent != null ? (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-primary-foreground/25 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(4, applyPercent)}%` }}
            />
          ) : null}
          <span className="relative z-1 flex items-center">
            {applying ? (
              <Loader2 className="size-3 shrink-0 animate-spin" />
            ) : (
              <Download className="size-3 shrink-0" />
            )}
            <span
              className={cn(
                'overflow-hidden whitespace-nowrap leading-none transition-all duration-200',
                applying
                  ? 'ml-1 max-w-[8rem] opacity-100'
                  : 'max-w-0 opacity-0 group-hover/upd:ml-1 group-hover/upd:max-w-[6rem] group-hover/upd:opacity-100'
              )}
            >
              {applying
                ? applyPercent != null
                  ? a.updateInstallingProgress(applyPercent)
                  : a.updateInstalling
                : a.updateShort}
            </span>
          </span>
        </button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={a.helpMenu}
              className={cn(
                'grid size-5 shrink-0 place-items-center self-center rounded-full border border-(--ui-stroke-secondary)',
                'text-[0.7rem] font-medium leading-none text-(--ui-text-tertiary)',
                'transition-colors hover:border-(--ui-stroke-primary) hover:text-foreground',
                '[-webkit-app-region:no-drag]'
              )}
              type="button"
            >
              ?
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52" side="top" sideOffset={6}>
            <DropdownMenuItem
              onSelect={() => {
                openKeybindPanel()
              }}
            >
              <Command className="size-3.5" />
              {t.titlebar.openKeybinds}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                navigate(DOCS_ROUTE)
              }}
            >
              <FileText className="size-3.5" />
              {t.docsView.title}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openExternal(HELP_URL)}>
              <HelpCircle className="size-3.5" />
              {a.getHelp}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openExternal(FEEDBACK_URL)}>
              <MessageSquareText className="size-3.5" />
              {a.giveFeedback}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
