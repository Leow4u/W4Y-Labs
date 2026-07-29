/**
 * Capabilities → Connectors tab — Composio marketplace (featured + connect).
 * Full catalog behind ?catalog=1. Raw MCP editor stays on the MCP tab.
 */
import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { LogoTile } from '@/components/connectors/logo-tile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  pickConnectedExtra,
  resolveFeaturedConnectors,
  resolveFeaturedDevConnectors,
  stateOf
} from '@/lib/connector-curation'
import type { ConnectorAccount, ConnectorToolkit } from '@/lib/connectors-types'
import { notify, notifyError } from '@/store/notifications'
import { cn } from '@/lib/utils'

import { PanelEmpty } from '../overlays/panel'

function ConnectorCard({
  tk,
  accounts,
  connecting,
  disconnecting,
  onConnect,
  onDisconnect
}: {
  tk: ConnectorToolkit
  accounts: ConnectorAccount[]
  connecting: boolean
  disconnecting: boolean
  onConnect: (tk: ConnectorToolkit) => void
  onDisconnect: (tk: ConnectorToolkit) => void
}) {
  const { t } = useI18n()
  const tc = t.connectors
  const state = stateOf(accounts)
  const busy = connecting || disconnecting

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
      <LogoTile toolkit={tk} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{tk.name}</span>
          {(tk.categories || []).slice(0, 1).map(c => (
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

export function ConnectorsTab() {
  const { t } = useI18n()
  const tc = t.connectors
  const connectorsRevision = useStore($connectorsRevision)
  const [params, setParams] = useSearchParams()
  const catalog = params.get('catalog') === '1'

  const [toolkits, setToolkits] = useState<ConnectorToolkit[]>([])
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
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
      // Ensure mcp_servers.composio exists when COMPOSIO_API_KEY is present.
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
  const featuredAll = useMemo(() => [...featured, ...featuredDev], [featured, featuredDev])
  const connectedExtra = useMemo(
    () => pickConnectedExtra(toolkits, featuredAll, byToolkit),
    [toolkits, featuredAll, byToolkit]
  )

  const catalogShown = useMemo(
    () => filterConnectors(toolkits, search, null),
    [toolkits, search]
  )

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

  const setCatalog = (open: boolean) => {
    const next = new URLSearchParams(params)
    if (open) next.set('catalog', '1')
    else next.delete('catalog')
    setParams(next)
  }

  const card = (tk: ConnectorToolkit) => (
    <ConnectorCard
      accounts={byToolkit.get(tk.slug.toLowerCase()) || []}
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

  return (
    <div className="flex flex-col gap-4 p-1">
      <p className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[0.75rem] leading-relaxed text-muted-foreground">
        {tc.workScopeHint}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-sm"
          onChange={e => setSearch(e.target.value)}
          placeholder={tc.searchPlaceholder}
          value={search}
        />
        <Button onClick={() => setCatalog(!catalog)} size="sm" variant="ghost">
          {catalog ? tc.backToFeatured : tc.viewFullCatalog}
        </Button>
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

      {catalog ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {catalogShown.map(card)}
        </div>
      ) : (
        <>
          {connectedExtra.length > 0 && (
            <section>
              <h3 className="mb-2 text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {tc.connectedSection}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {connectedExtra.map(card)}
              </div>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              {tc.featuredSection}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(search.trim() ? filterConnectors(featured, search, null) : featured).map(card)}
            </div>
          </section>
          {featuredDev.length > 0 && (
            <section>
              <h3 className="mb-2 text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {tc.devSection}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(search.trim() ? filterConnectors(featuredDev, search, null) : featuredDev).map(
                  card
                )}
              </div>
            </section>
          )}
        </>
      )}

      {!catalog && featured.length === 0 && toolkits.length === 0 && (
        <p className={cn('py-8 text-center text-sm text-muted-foreground')}>{tc.empty}</p>
      )}
    </div>
  )
}
