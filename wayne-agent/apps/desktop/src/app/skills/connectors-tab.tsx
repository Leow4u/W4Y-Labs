/**
 * Personalizar → Conectores (manage) + Browse Marketplace (catalog).
 * Manage: Cursor-style list (same density as Skills). Marketplace: list by
 * category with “show N more”. OAuth/connect stays the same.
 */
import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

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

const MARKETPLACE_PREVIEW = 6

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
          <span className="block truncate text-[0.78rem] font-medium text-foreground/85">{tk.name}</span>
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

function CategorySection({
  title,
  items,
  renderRow
}: {
  title: string
  items: ConnectorToolkit[]
  renderRow: (tk: ConnectorToolkit) => ReactNode
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, MARKETPLACE_PREVIEW)
  const hidden = Math.max(0, items.length - MARKETPLACE_PREVIEW)

  if (items.length === 0) return null

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <h3 className="flex h-9 items-center border-b border-border px-3 text-[0.78rem] font-medium text-foreground">
        {title}
      </h3>
      <div>{visible.map(renderRow)}</div>
      {hidden > 0 ? (
        <button
          className="flex h-9 w-full items-center border-t border-border px-3 text-left text-[0.72rem] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
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
      setToolkits(catalogRes.toolkits || [])
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

  // Marketplace
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4 pb-6">
      <CategorySection
        items={marketplaceFeatured}
        renderRow={tk => row(tk, false)}
        title={tc.featuredSection}
      />
      {marketplaceDev.length > 0 ? (
        <CategorySection
          items={marketplaceDev}
          renderRow={tk => row(tk, false)}
          title={tc.devSection}
        />
      ) : null}
      {restByCategory.map(({ category, items }) => (
        <CategorySection
          items={items}
          key={category}
          renderRow={tk => row(tk, false)}
          title={category}
        />
      ))}

      {marketplaceFeatured.length === 0 &&
        marketplaceDev.length === 0 &&
        restByCategory.length === 0 && (
          <p className={cn('py-8 text-center text-sm text-muted-foreground')}>{tc.empty}</p>
        )}
    </div>
  )
}
