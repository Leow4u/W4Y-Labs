/**
 * Composer Conectores control — logos + per-session on/off for ACTIVE apps.
 * Empty → navigates to Capabilities → Connectors (marketplace). Does not invent
 * backend; OFF is enforced via `config.set` connectors.disabled (session scope).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { LogoTile } from '@/components/connectors/logo-tile'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { getConnectorsCatalog, getConnectorsStatus } from '@/lib/connectors-api'
import type { ConnectorToolkit } from '@/lib/connectors-types'
import { ChevronDown, iconSize, Link2 } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { SKILLS_ROUTE } from '../../routes'

const CHIP =
  'flex h-7 max-w-[14rem] items-center gap-1 rounded-lg px-2 text-[0.75rem] font-medium text-muted-foreground transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground'

function fallbackToolkit(slug: string): ConnectorToolkit {
  return {
    slug,
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    description: '',
    logo: null,
    categories: [],
    no_auth: false,
    managed_auth: false,
    auth_schemes: [],
    tools_count: null,
    triggers_count: null
  }
}

export function ConnectorsPicker({
  disabled,
  onChange
}: {
  disabled: string[]
  onChange: (slugs: string[]) => void
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState<ConnectorToolkit[] | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const status = await getConnectorsStatus('global').catch(() => null)
        if (!alive) return
        if (!status) {
          setConnected([])
          return
        }
        const slugs = [
          ...new Set(
            status.accounts
              .filter(a => a.status === 'ACTIVE')
              .map(a => (a.toolkit || '').toLowerCase())
              .filter(Boolean)
          )
        ]
        if (slugs.length === 0) {
          setConnected([])
          return
        }
        const catalog = await getConnectorsCatalog().catch(() => null)
        if (!alive) return
        const bySlug = new Map((catalog?.toolkits ?? []).map(tk => [tk.slug.toLowerCase(), tk]))
        setConnected(slugs.map(slug => bySlug.get(slug) ?? fallbackToolkit(slug)))
      } catch {
        if (alive) setConnected([])
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Still loading — avoid flicker.
  if (connected === null) return null

  // No apps connected yet → chip opens the marketplace (not raw MCP).
  if (connected.length === 0) {
    return (
      <Tip label={t.composer.connectorsHint}>
        <button
          aria-label={t.composer.connectorsLabel}
          className={CHIP}
          onClick={() => navigate(`${SKILLS_ROUTE}?tab=connectors`)}
          title={t.composer.connectorsHint}
          type="button"
        >
          <Link2 className={iconSize.sm} />
          <span className="truncate">{t.composer.connectorsLabel}</span>
          <ChevronDown className={cn(iconSize.sm, 'opacity-60')} />
        </button>
      </Tip>
    )
  }

  const off = new Set(disabled.map(s => s.toLowerCase()))
  const enabledToolkits = connected.filter(tk => !off.has(tk.slug.toLowerCase()))

  const toggle = (slug: string) => {
    const key = slug.toLowerCase()
    const next = new Set(off)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange([...next].sort())
  }

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        aria-label={t.composer.connectorsSession}
        className={CHIP}
        title={t.composer.connectorsSession}
        type="button"
      >
        {enabledToolkits.length > 0 && (
          <span className="flex items-center -space-x-1">
            {enabledToolkits.slice(0, 3).map(tk => (
              <LogoTile
                className="h-[18px] w-[18px] rounded-full border border-border p-px text-[0.55rem]"
                key={tk.slug}
                toolkit={tk}
              />
            ))}
          </span>
        )}
        <span className="truncate">{t.composer.connectorsLabel}</span>
        <ChevronDown className={cn(iconSize.sm, 'opacity-60')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-1.5" side="top" sideOffset={8}>
        <DropdownMenuLabel className="text-[0.65rem] uppercase tracking-[0.06em] text-muted-foreground">
          {t.composer.connectorsSession}
        </DropdownMenuLabel>
        {connected.map(tk => {
          const isOn = !off.has(tk.slug.toLowerCase())
          return (
            <div className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2" key={tk.slug}>
              <LogoTile className="h-6 w-6 rounded-md text-xs" toolkit={tk} />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[0.8rem] font-medium',
                  isOn ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {tk.name}
              </span>
              <button
                aria-checked={isOn}
                aria-label={tk.name}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                  isOn ? 'bg-emerald-600' : 'bg-muted'
                )}
                onClick={() => toggle(tk.slug)}
                role="switch"
                type="button"
              >
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                    isOn ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  )}
                />
              </button>
            </div>
          )
        })}
        <button
          className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-left text-[0.7rem] text-muted-foreground hover:bg-(--chrome-action-hover) hover:text-foreground"
          onClick={() => {
            setOpen(false)
            navigate(`${SKILLS_ROUTE}?tab=connectors`)
          }}
          type="button"
        >
          {t.composer.connectorsManage}
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
