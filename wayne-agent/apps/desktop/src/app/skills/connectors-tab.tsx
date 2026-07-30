/**
 * Personalizar → Conectores (manage) + Browse Marketplace (catalog).
 * Manage: Cursor-style dense list. Marketplace: Cursor Discover / Featured /
 * category grids over Composio toolkits (never show the Composio brand).
 */
import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { LogoTile } from '@/components/connectors/logo-tile'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PageLoader } from '@/components/page-loader'
import { useI18n } from '@/i18n'
import {
  attachConnectors,
  connectConnector,
  disconnectAllConnectors,
  disconnectConnectorAccount,
  getConnectorsCatalog,
  getConnectorsStatus
} from '@/lib/connectors-api'
import { $connectorsRevision, notifyConnectorsChanged } from '@/store/connectors'
import {
  filterConnectors,
  groupConnectorsByCategory,
  pickConnected,
  resolveFeaturedConnectors,
  resolveFeaturedDevConnectors,
  stateOf
} from '@/lib/connector-curation'
import type { ConnectorAccount, ConnectorToolkit } from '@/lib/connectors-types'
import { notify, notifyError } from '@/store/notifications'
import { cn } from '@/lib/utils'

import { ICON_BUTTON } from '../master-detail'
import { PanelEmpty } from '../overlays/panel'
import { CustomizeEmpty, CustomizeEmptyAction } from './customize-empty'

const MARKETPLACE_PREVIEW = 4
const DISCOVER_COUNT = 3

function toolkitLabel(tk: ConnectorToolkit): string {
  return (tk.name || tk.slug || '').trim()
}

function isUsableToolkit(tk: ConnectorToolkit): boolean {
  return Boolean(tk?.slug && toolkitLabel(tk))
}

function ConnectorListRow({
  tk,
  accounts,
  connecting,
  disconnecting,
  onConnect,
  onDisconnect,
  menu
}: {
  tk: ConnectorToolkit
  accounts: ConnectorAccount[]
  connecting: boolean
  disconnecting: boolean
  onConnect: (tk: ConnectorToolkit) => void
  onDisconnect: (tk: ConnectorToolkit) => void
  /** manage rows use ⋯; marketplace keeps an inline Connect. */
  menu?: boolean
}) {
  const { t } = useI18n()
  const tc = t.connectors
  const state = stateOf(accounts)
  const busy = connecting || disconnecting
  const category = (tk.categories || [])[0]
  const subtitle = category || tk.description || ''

  return (
    <div
      className={cn(
        'group flex h-11 w-full items-center border-b border-border last:border-b-0',
        'text-(--ui-text-secondary) hover:bg-muted/40'
      )}
    >
      <div className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-3">
        <LogoTile className="h-5 w-5 rounded-md p-0.5 text-[0.65rem]" toolkit={tk} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.78rem] font-medium text-foreground/85">
            {toolkitLabel(tk)}
          </span>
          {subtitle ? (
            <span className="block truncate text-[0.62rem] text-muted-foreground/50">{subtitle}</span>
          ) : null}
        </span>
        {state === 'connected' ? (
          <span className="shrink-0 text-[0.65rem] font-medium text-emerald-700 dark:text-emerald-400">
            {tc.connected}
          </span>
        ) : null}
        {!menu ? (
          state === 'connected' ? (
            <Button
              className="h-7 shrink-0 px-2 text-[0.72rem]"
              disabled={busy}
              onClick={() => onDisconnect(tk)}
              size="xs"
              variant="ghost"
            >
              {disconnecting ? tc.connecting : tc.disconnect}
            </Button>
          ) : (
            <Button
              className="h-7 shrink-0 px-2 text-[0.72rem]"
              disabled={busy}
              onClick={() => onConnect(tk)}
              size="xs"
              variant="ghost"
            >
              {connecting ? tc.connecting : state === 'broken' ? tc.reconnect : tc.connect}
            </Button>
          )
        ) : null}
      </div>
      {menu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={tk.name}
              className={cn(
                ICON_BUTTON,
                'mr-1.5 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100'
              )}
              disabled={busy}
              size="icon"
              variant="ghost"
            >
              <Codicon name="ellipsis" size="0.8125rem" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40" sideOffset={6}>
            {state === 'connected' ? (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={busy}
                onSelect={() => onDisconnect(tk)}
              >
                {disconnecting ? tc.connecting : tc.disconnect}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled={busy} onSelect={() => onConnect(tk)}>
                {connecting ? tc.connecting : state === 'broken' ? tc.reconnect : tc.connect}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

/** Cursor Discover hero cards — three wide tiles. */
function DiscoverCard({
  busy,
  onAdd,
  tk
}: {
  busy: boolean
  onAdd: () => void
  tk: ConnectorToolkit
}) {
  const { t } = useI18n()
  const label = toolkitLabel(tk)

  return (
    <button
      className="flex min-h-[8.5rem] flex-col items-start gap-2 rounded-xl border border-border bg-muted/25 p-4 text-left transition-colors hover:bg-muted/45 disabled:opacity-50"
      disabled={busy}
      onClick={onAdd}
      type="button"
    >
      <LogoTile className="h-9 w-9 rounded-lg" toolkit={tk} />
      <span className="truncate text-[0.875rem] font-semibold text-foreground">{label}</span>
      {tk.description ? (
        <span className="line-clamp-2 text-[0.72rem] leading-snug text-muted-foreground">{tk.description}</span>
      ) : null}
    </button>
  )
}

/** Cursor Featured / category row — icon, name, desc, Add. */
function MarketplaceTile({
  accounts,
  connecting,
  onConnect,
  tk
}: {
  accounts: ConnectorAccount[]
  connecting: boolean
  onConnect: (tk: ConnectorToolkit) => void
  tk: ConnectorToolkit
}) {
  const { t } = useI18n()
  const tc = t.connectors
  const state = stateOf(accounts)
  const busy = connecting
  const label = toolkitLabel(tk)

  return (
    <div className="flex min-h-[3.25rem] items-center gap-3 rounded-lg px-1.5 py-2 hover:bg-muted/40">
      <LogoTile className="h-8 w-8 rounded-lg" toolkit={tk} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.8125rem] font-medium text-foreground">{label}</div>
        {tk.description ? (
          <div className="truncate text-[0.68rem] text-muted-foreground">{tk.description}</div>
        ) : null}
      </div>
      {state === 'connected' ? (
        <span className="shrink-0 text-[0.68rem] font-medium text-emerald-700 dark:text-emerald-400">
          {tc.connected}
        </span>
      ) : (
        <Button
          className="h-7 shrink-0 px-2.5 text-[0.72rem]"
          disabled={busy}
          onClick={() => onConnect(tk)}
          size="xs"
          variant="secondary"
        >
          {busy ? tc.connecting : state === 'broken' ? tc.reconnect : tc.add}
        </Button>
      )}
    </div>
  )
}

function MarketplaceSection({
  title,
  items,
  byToolkit,
  connecting,
  onConnect
}: {
  title: string
  items: ConnectorToolkit[]
  byToolkit: Map<string, ConnectorAccount[]>
  connecting: string | null
  onConnect: (tk: ConnectorToolkit) => void
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, MARKETPLACE_PREVIEW)
  const hidden = Math.max(0, items.length - MARKETPLACE_PREVIEW)

  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[0.78rem] font-semibold text-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
        {visible.map(tk => (
          <MarketplaceTile
            accounts={byToolkit.get(tk.slug.toLowerCase()) || []}
            connecting={connecting === tk.slug}
            key={tk.slug}
            onConnect={onConnect}
            tk={tk}
          />
        ))}
      </div>
      {hidden > 0 ? (
        <button
          className="self-start text-[0.72rem] font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(v => !v)}
          type="button"
        >
          {expanded ? t.connectors.showLess : t.connectors.showMore(hidden)}
        </button>
      ) : null}
    </section>
  )
}

export interface ConnectorsTabProps {
  /** manage = connected only; marketplace = Browse Marketplace catalog */
  variant?: 'manage' | 'marketplace'
  /** Shell search query (marketplace / manage filter). */
  search?: string
  /** Open Browse Marketplace from manage empty/+Add. */
  onOpenMarketplace?: () => void
}

export function ConnectorsTab({
  variant = 'manage',
  search = '',
  onOpenMarketplace
}: ConnectorsTabProps) {
  const { t } = useI18n()
  const tc = t.connectors
  const connectorsRevision = useStore($connectorsRevision)

  const [toolkits, setToolkits] = useState<ConnectorToolkit[]>([])
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [disconnectingAll, setDisconnectingAll] = useState(false)
  const aliveRef = useRef(true)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getConnectorsStatus('global')
      if (aliveRef.current) setAccounts(status.accounts || [])
      return status
    } catch {
      return null
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await attachConnectors('global').catch(() => null)
      const [catalogRes] = await Promise.all([getConnectorsCatalog(), refreshStatus()])
      if (!aliveRef.current) return
      setToolkits((catalogRes.toolkits || []).filter(isUsableToolkit))
    } catch (err) {
      if (aliveRef.current) {
        setError(err instanceof Error ? err.message : String(err))
        setToolkits([])
      }
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [refreshStatus])

  useEffect(() => {
    void load()
  }, [load, connectorsRevision])

  const byToolkit = useMemo(() => {
    const m = new Map<string, ConnectorAccount[]>()
    for (const a of accounts) {
      const k = (a.toolkit || '').toLowerCase()
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    return m
  }, [accounts])

  const featured = useMemo(() => resolveFeaturedConnectors(toolkits), [toolkits])
  const featuredDev = useMemo(() => resolveFeaturedDevConnectors(toolkits), [toolkits])
  const connected = useMemo(() => pickConnected(toolkits, byToolkit), [toolkits, byToolkit])

  const filteredConnected = useMemo(
    () => filterConnectors(connected, search, null),
    [connected, search]
  )

  const marketplaceFeatured = useMemo(
    () => filterConnectors(featured, search, null),
    [featured, search]
  )
  const marketplaceDev = useMemo(
    () => filterConnectors(featuredDev, search, null),
    [featuredDev, search]
  )

  const featuredSlugSet = useMemo(() => {
    const s = new Set<string>()
    for (const tk of [...featured, ...featuredDev]) s.add(tk.slug.toLowerCase())
    return s
  }, [featured, featuredDev])

  const restByCategory = useMemo(() => {
    const rest = filterConnectors(toolkits, search, null).filter(
      tk => !featuredSlugSet.has(tk.slug.toLowerCase())
    )
    return groupConnectorsByCategory(rest)
  }, [toolkits, search, featuredSlugSet])

  const pollUntilActive = useCallback(
    (slug: string, tries = 0) => {
      if (!aliveRef.current) return
      pollRef.current = setTimeout(async () => {
        const status = await refreshStatus()
        const accs = (status?.accounts || []).filter(a => (a.toolkit || '').toLowerCase() === slug)
        if (accs.some(a => a.status === 'ACTIVE')) {
          setConnecting(null)
          notify({
            kind: 'success',
            title: tc.connectedToast.replace('{name}', slug),
            message: tc.connected
          })
          notifyConnectorsChanged(slug)
          return
        }
        if (tries < 34) pollUntilActive(slug, tries + 1)
        else setConnecting(null)
      }, 3500)
    },
    [refreshStatus, tc]
  )

  const onConnect = useCallback(
    async (tk: ConnectorToolkit) => {
      setConnecting(tk.slug)
      try {
        const res = await connectConnector(tk.slug, 'global')
        if (res.no_auth) {
          setConnecting(null)
          notify({
            kind: 'success',
            title: tc.connectedToast.replace('{name}', tk.name),
            message: tc.connected
          })
          void refreshStatus()
          notifyConnectorsChanged(tk.slug)
          return
        }
        if (res.redirect_url) {
          window.open(res.redirect_url, '_blank', 'noopener')
          notify({ kind: 'success', title: tc.openedToast, message: tc.openedToast })
          pollUntilActive(tk.slug.toLowerCase())
        } else {
          setConnecting(null)
          notify({ kind: 'error', title: tc.connectFailed, message: tc.connectFailed })
        }
      } catch (err) {
        setConnecting(null)
        notifyError(err, tc.connectFailed)
      }
    },
    [pollUntilActive, refreshStatus, tc]
  )

  const onDisconnect = useCallback(
    async (tk: ConnectorToolkit) => {
      const accs = byToolkit.get(tk.slug.toLowerCase()) || []
      if (!accs.length) return
      setDisconnecting(tk.slug)
      try {
        for (const a of accs) {
          if (a.id) await disconnectConnectorAccount(a.id)
        }
        notify({ kind: 'success', title: tc.disconnectedToast, message: tc.disconnectedToast })
        await refreshStatus()
        notifyConnectorsChanged()
      } catch (err) {
        notifyError(err, tc.disconnect)
      } finally {
        setDisconnecting(null)
      }
    },
    [byToolkit, refreshStatus, tc]
  )

  const onDisconnectAll = useCallback(async () => {
    if (!accounts.length) return
    if (!window.confirm(tc.disconnectAllConfirm)) return
    setDisconnectingAll(true)
    try {
      const res = await disconnectAllConnectors('global')
      const count = res.removed?.length ?? 0
      notify({
        kind: 'success',
        title: tc.disconnectAllDone.replace('{count}', String(count)),
        message: tc.disconnectedToast
      })
      await refreshStatus()
      notifyConnectorsChanged()
    } catch (err) {
      notifyError(err, tc.disconnectAll)
    } finally {
      setDisconnectingAll(false)
    }
  }, [accounts.length, refreshStatus, tc])

  const row = (tk: ConnectorToolkit, menu?: boolean) => (
    <ConnectorListRow
      accounts={byToolkit.get(tk.slug.toLowerCase()) || []}
      connecting={connecting === tk.slug}
      disconnecting={disconnecting === tk.slug}
      key={tk.slug}
      menu={menu}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      tk={tk}
    />
  )

  if (loading) return <PageLoader label={t.skills.loading} />

  if (error) {
    return (
      <PanelEmpty
        action={
          <Button onClick={() => void load()} size="sm">
            {t.skills.refresh}
          </Button>
        }
        description={error}
        icon="error"
        title={tc.connectFailed}
      />
    )
  }

  if (variant === 'manage') {
    if (filteredConnected.length === 0) {
      return (
        <CustomizeEmpty
          actions={
            search.trim() ? undefined : (
              <>
                {onOpenMarketplace ? (
                  <CustomizeEmptyAction onClick={onOpenMarketplace} variant="muted">
                    {tc.addConnector}
                  </CustomizeEmptyAction>
                ) : null}
                <CustomizeEmptyAction
                  onClick={() => window.hermesDesktop?.openExternal?.('https://composio.dev/tools')}
                >
                  {t.skills.documentation}
                </CustomizeEmptyAction>
              </>
            )
          }
          description={search.trim() ? tc.empty : tc.emptyConnectedDesc}
          title={search.trim() ? tc.empty : tc.emptyConnectedTitle}
        />
      )
    }

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
          <span className="truncate text-[0.78rem] font-medium text-foreground">
            {tc.installedCount(filteredConnected.length)}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {accounts.length > 0 ? (
              <Button
                className="h-7 px-2 text-[0.75rem]"
                disabled={disconnectingAll || Boolean(disconnecting)}
                onClick={() => void onDisconnectAll()}
                size="xs"
                variant="ghost"
              >
                {disconnectingAll ? tc.connecting : tc.disconnectAll}
              </Button>
            ) : null}
            {onOpenMarketplace ? (
              <Button
                className="h-7 px-2 text-[0.75rem]"
                onClick={onOpenMarketplace}
                size="xs"
                variant="ghost"
              >
                {tc.addConnector}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filteredConnected.map(tk => row(tk, true))}
        </div>
      </div>
    )
  }

  // Marketplace — Cursor Discover + Featured + category grids (Composio data).
  const discover = marketplaceFeatured.slice(0, DISCOVER_COUNT)
  const featuredRest = marketplaceFeatured.slice(DISCOVER_COUNT)

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto overscroll-contain px-5 py-5"
      data-testid="connectors-marketplace"
    >
      {discover.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h3 className="text-[0.78rem] font-semibold text-foreground">{tc.discoverSection}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {discover.map(tk => (
              <DiscoverCard
                busy={connecting === tk.slug}
                key={tk.slug}
                onAdd={() => void onConnect(tk)}
                tk={tk}
              />
            ))}
          </div>
        </section>
      ) : null}

      {featuredRest.length > 0 ? (
        <MarketplaceSection
          byToolkit={byToolkit}
          connecting={connecting}
          items={featuredRest}
          onConnect={tk => void onConnect(tk)}
          title={tc.featuredSection}
        />
      ) : null}

      {marketplaceDev.length > 0 ? (
        <MarketplaceSection
          byToolkit={byToolkit}
          connecting={connecting}
          items={marketplaceDev}
          onConnect={tk => void onConnect(tk)}
          title={tc.devSection}
        />
      ) : null}

      {restByCategory.map(({ category, items }) => (
        <MarketplaceSection
          byToolkit={byToolkit}
          connecting={connecting}
          items={items}
          key={category}
          onConnect={tk => void onConnect(tk)}
          title={category}
        />
      ))}

      {marketplaceFeatured.length === 0 &&
        marketplaceDev.length === 0 &&
        restByCategory.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{tc.empty}</p>
        )}
    </div>
  )
}
