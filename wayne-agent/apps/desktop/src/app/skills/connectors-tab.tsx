/**
 * Personalizar → Conectores (manage) + Browse Marketplace (catalog).
 * Manage shows connected accounts only; marketplace is the Cursor-style
 * category browse with “show N more” expand. OAuth/connect stays the same.
 */
import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { LogoTile } from '@/components/connectors/logo-tile'
import { Button } from '@/components/ui/button'
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

import { PanelEmpty } from '../overlays/panel'

const MARKETPLACE_PREVIEW = 6

function ConnectorCard({
  tk,
  accounts,
  connecting,
  disconnecting,
  onConnect,
  onDisconnect,
  compact
}: {
  tk: ConnectorToolkit
  accounts: ConnectorAccount[]
  connecting: boolean
  disconnecting: boolean
  onConnect: (tk: ConnectorToolkit) => void
  onDisconnect: (tk: ConnectorToolkit) => void
  compact?: boolean
}) {
  const { t } = useI18n()
  const tc = t.connectors
  const state = stateOf(accounts)
  const busy = connecting || disconnecting

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-border bg-card',
        compact ? 'p-3' : 'p-3.5'
      )}
    >
      <LogoTile toolkit={tk} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{tk.name}</span>
          {!compact &&
            (tk.categories || []).slice(0, 1).map(c => (
              <span
                className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] text-muted-foreground"
                key={c}
              >
                {c}
              </span>
            ))}
        </div>
        {tk.description ? (
          <p className="mt-1 line-clamp-2 text-[0.75rem] text-muted-foreground">{tk.description}</p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {state === 'connected' ? (
            <>
              <span className="text-[0.7rem] font-medium text-emerald-700 dark:text-emerald-400">
                {tc.connected}
              </span>
              <Button
                disabled={busy}
                onClick={() => onDisconnect(tk)}
                size="sm"
                variant="ghost"
              >
                {disconnecting ? tc.connecting : tc.disconnect}
              </Button>
            </>
          ) : (
            <Button disabled={busy} onClick={() => onConnect(tk)} size="sm">
              {connecting ? tc.connecting : state === 'broken' ? tc.reconnect : tc.connect}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function CategorySection({
  title,
  items,
  renderCard
}: {
  title: string
  items: ConnectorToolkit[]
  renderCard: (tk: ConnectorToolkit) => ReactNode
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, MARKETPLACE_PREVIEW)
  const hidden = Math.max(0, items.length - MARKETPLACE_PREVIEW)

  if (items.length === 0) return null

  return (
    <section>
      <h3 className="mb-2 text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">{visible.map(renderCard)}</div>
      {hidden > 0 ? (
        <button
          className="mt-2 text-[0.75rem] font-medium text-muted-foreground hover:text-foreground"
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

  const card = (tk: ConnectorToolkit, compact?: boolean) => (
    <ConnectorCard
      accounts={byToolkit.get(tk.slug.toLowerCase()) || []}
      compact={compact}
      connecting={connecting === tk.slug}
      disconnecting={disconnecting === tk.slug}
      key={tk.slug}
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
        <div className="flex h-full min-h-0 flex-1 flex-col">
          <PanelEmpty
            action={
              onOpenMarketplace ? (
                <Button onClick={onOpenMarketplace} size="sm">
                  {tc.addConnector}
                </Button>
              ) : undefined
            }
            description={
              search.trim()
                ? tc.empty
                : tc.emptyConnectedDesc
            }
            icon="link"
            title={search.trim() ? tc.empty : tc.emptyConnectedTitle}
          />
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-4 overflow-y-auto p-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            {tc.connectedSection}
          </h3>
          <div className="flex items-center gap-2">
            {onOpenMarketplace ? (
              <Button onClick={onOpenMarketplace} size="sm" variant="ghost">
                {tc.addConnector}
              </Button>
            ) : null}
            {accounts.length > 0 ? (
              <Button
                disabled={disconnectingAll || Boolean(disconnecting)}
                onClick={() => void onDisconnectAll()}
                size="sm"
                variant="ghost"
              >
                {disconnectingAll ? tc.connecting : tc.disconnectAll}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredConnected.map(tk => card(tk))}
        </div>
      </div>
    )
  }

  // Marketplace
  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-1 pb-6">
      <p className="text-[0.8rem] text-muted-foreground">{tc.marketplaceTitle}</p>

      <CategorySection
        items={marketplaceFeatured}
        renderCard={tk => card(tk, true)}
        title={tc.featuredSection}
      />
      {marketplaceDev.length > 0 ? (
        <CategorySection
          items={marketplaceDev}
          renderCard={tk => card(tk, true)}
          title={tc.devSection}
        />
      ) : null}
      {restByCategory.map(({ category, items }) => (
        <CategorySection
          items={items}
          key={category}
          renderCard={tk => card(tk, true)}
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
