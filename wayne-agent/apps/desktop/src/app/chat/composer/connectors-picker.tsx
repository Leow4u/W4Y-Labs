/**
 * Composer Conectores control — logos + per-session on/off for ACTIVE apps.
 * Empty → suggest connect-by-chat (featured apps) or marketplace. OFF is enforced
 * via `config.set` connectors.disabled (session scope).
 */
import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { requestComposerSubmit } from '@/app/chat/composer/focus'
import { LogoTile } from '@/components/connectors/logo-tile'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n'
import { resolveFeaturedConnectors } from '@/lib/connector-curation'
import { getConnectorsCatalog, getConnectorsStatus } from '@/lib/connectors-api'
import type { ConnectorToolkit } from '@/lib/connectors-types'
import { ensureComposioMcpReady } from '@/lib/ensure-composio-mcp'
import { ChevronDown, iconSize, Link2 } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $connectorsRevision, $lastConnectedToolkit } from '@/store/connectors'

import { SKILLS_ROUTE } from '../../routes'

const CHIP =
  'flex h-6 max-w-[14rem] items-center gap-1 rounded-md px-1.5 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground'

/** Curated marketplace size for the +N badge (product-selected top connectors). */
const CURATED_CONNECTOR_COUNT = 15

/** How many featured apps to offer as connect-by-chat prompts in the empty menu. */
const SUGGEST_CONNECT_COUNT = 6

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
  const revision = useStore($connectorsRevision)
  const lastConnected = useStore($lastConnectedToolkit)
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState<ConnectorToolkit[] | null>(null)
  const [featured, setFeatured] = useState<ConnectorToolkit[]>([])

  useEffect(() => {
    let alive = true
    // Mint/refresh tool-router URL + reload MCP so mcp_composio_* tools exist.
    // Skip ensure on revision bumps — ConnectLinkCard already forced MCP reload.
    if (revision === 0) {
      void ensureComposioMcpReady().catch(() => null)
    }
    void (async () => {
      try {
        const [status, catalog] = await Promise.all([
          getConnectorsStatus('global').catch(() => null),
          getConnectorsCatalog().catch(() => null)
        ])
        if (!alive) return

        const toolkits = catalog?.toolkits ?? []
        setFeatured(resolveFeaturedConnectors(toolkits).slice(0, SUGGEST_CONNECT_COUNT))

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
        const bySlug = new Map(toolkits.map(tk => [tk.slug.toLowerCase(), tk]))
        const ordered = slugs.map(slug => bySlug.get(slug) ?? fallbackToolkit(slug))
        // Pin the just-authorized app to the front so the composer chip updates visibly.
        if (lastConnected) {
          ordered.sort((a, b) => {
            const aHit = a.slug.toLowerCase() === lastConnected ? 0 : 1
            const bHit = b.slug.toLowerCase() === lastConnected ? 0 : 1
            return aHit - bHit
          })
        }
        setConnected(ordered)
      } catch {
        if (alive) {
          setConnected([])
          setFeatured([])
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [revision, lastConnected])

  const suggestConnect = (tk: ConnectorToolkit) => {
    setOpen(false)
    requestComposerSubmit(t.connectors.connectAppPrompt.replace('{app}', tk.name), { target: 'main' })
  }

  const openMarketplace = () => {
    setOpen(false)
    navigate(`${SKILLS_ROUTE}?view=marketplace`)
  }

  const featuredNotConnected = useMemo(() => {
    if (!connected) return []
    const on = new Set(connected.map(tk => tk.slug.toLowerCase()))
    return featured.filter(tk => !on.has(tk.slug.toLowerCase()))
  }, [connected, featured])

  // Still loading — keep chip footprint so the toolbar doesn't jump.
  if (connected === null) {
    return (
      <span aria-hidden className={cn(CHIP, 'pointer-events-none opacity-40')}>
        <Link2 className={iconSize.sm} />
      </span>
    )
  }

  // No apps connected yet → chip opens connect-by-chat suggestions (+ marketplace).
  if (connected.length === 0) {
    return (
      <DropdownMenu onOpenChange={setOpen} open={open}>
        <DropdownMenuTrigger
          aria-label={t.composer.connectorsAdd}
          className={CHIP}
          title={t.composer.connectorsAdd}
          type="button"
        >
          {featured.length > 0 ? (
            <span className="flex items-center -space-x-1">
              {featured.slice(0, 3).map(tk => (
                <LogoTile
                  className="h-[18px] w-[18px] rounded-full border border-border p-px text-[0.55rem]"
                  key={tk.slug}
                  toolkit={tk}
                />
              ))}
            </span>
          ) : (
            <Link2 className={iconSize.sm} />
          )}
          <span className="tabular-nums text-(--ui-text-tertiary)">+{CURATED_CONNECTOR_COUNT}</span>
          <ChevronDown className={cn(iconSize.sm, 'opacity-60')} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 p-1.5" side="top" sideOffset={8}>
          <DropdownMenuLabel className="text-[0.65rem] uppercase tracking-[0.06em] text-muted-foreground">
            {t.connectors.connectApps}
          </DropdownMenuLabel>
          {featured.length === 0 ? (
            <button
              className="w-full rounded-lg px-2.5 py-2 text-left text-[0.8rem] text-muted-foreground hover:bg-(--chrome-action-hover) hover:text-foreground"
              onClick={openMarketplace}
              type="button"
            >
              {t.composer.connectorsAdd}
            </button>
          ) : (
            featured.map(tk => (
              <button
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-(--chrome-action-hover)"
                key={tk.slug}
                onClick={() => suggestConnect(tk)}
                type="button"
              >
                <LogoTile className="h-6 w-6 rounded-md text-xs" toolkit={tk} />
                <span className="min-w-0 flex-1 truncate text-[0.8rem] font-medium text-foreground">{tk.name}</span>
              </button>
            ))
          )}
          <button
            className="mt-1 w-full rounded-lg border-t border-border/70 px-2.5 py-1.5 text-left text-[0.7rem] text-muted-foreground hover:bg-(--chrome-action-hover) hover:text-foreground"
            onClick={openMarketplace}
            type="button"
          >
            {t.connectors.viewFullCatalog}
          </button>
        </DropdownMenuContent>
      </DropdownMenu>
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
        {enabledToolkits.length > 0 ? (
          <span className="flex items-center -space-x-1">
            {enabledToolkits.slice(0, 3).map(tk => (
              <LogoTile
                className="h-[18px] w-[18px] rounded-full border border-border p-px text-[0.55rem]"
                key={tk.slug}
                toolkit={tk}
              />
            ))}
          </span>
        ) : (
          <Link2 className={iconSize.sm} />
        )}
        {enabledToolkits.length > 3 && (
          <span className="tabular-nums text-(--ui-text-tertiary)">+{enabledToolkits.length - 3}</span>
        )}
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
        {featuredNotConnected.length > 0 && (
          <>
            <DropdownMenuLabel className="mt-1 text-[0.65rem] uppercase tracking-[0.06em] text-muted-foreground">
              {t.connectors.connectApps}
            </DropdownMenuLabel>
            {featuredNotConnected.slice(0, 4).map(tk => (
              <button
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-(--chrome-action-hover)"
                key={tk.slug}
                onClick={() => suggestConnect(tk)}
                type="button"
              >
                <LogoTile className="h-6 w-6 rounded-md text-xs" toolkit={tk} />
                <span className="min-w-0 flex-1 truncate text-[0.8rem] font-medium text-foreground">{tk.name}</span>
              </button>
            ))}
          </>
        )}
        <button
          className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-left text-[0.7rem] text-muted-foreground hover:bg-(--chrome-action-hover) hover:text-foreground"
          onClick={openMarketplace}
          type="button"
        >
          {t.composer.connectorsAdd}
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
