/**
 * ConnectLinkCard — Composio Connect Link becomes an authorization card in chat
 * (port of web ConnectLinkCard). Authorize → popup → poll status until ACTIVE.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react'

import { LogoTile } from '@/components/connectors/logo-tile'
import { useI18n } from '@/i18n'
import { getConnectorsCatalog, getConnectorsStatus } from '@/lib/connectors-api'
import type { ConnectorAccount, ConnectorToolkit } from '@/lib/connectors-types'
import { ensureComposioMcpReady } from '@/lib/ensure-composio-mcp'
import { CheckCircle2, Link2, Loader2 } from '@/lib/icons'
import { notifyConnectorsChanged } from '@/store/connectors'

type Phase = 'idle' | 'waiting' | 'connected'

/** Full assistant turn text — used to detect which app the agent named. */
export const ConnectLinkContext = createContext('')

let catalogCache: Promise<ConnectorToolkit[]> | null = null

export function loadConnectorsCatalog(): Promise<ConnectorToolkit[]> {
  if (!catalogCache) {
    catalogCache = getConnectorsCatalog()
      .then(r => r.toolkits)
      .catch(() => [])
  }
  return catalogCache
}

const APP_DENYLIST = new Set(['composio'])

/** Conservative: first known app name (≥4 chars) cited in the agent's text. */
function detectApp(text: string, toolkits: ConnectorToolkit[]): ConnectorToolkit | null {
  if (!text) return null
  const lower = ` ${text.toLowerCase()} `
  let best: ConnectorToolkit | null = null
  let bestPos = Infinity
  for (const tk of toolkits) {
    if (APP_DENYLIST.has(tk.slug)) continue
    const name = (tk.name || '').toLowerCase().trim()
    if (name.length < 4) continue
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pos = lower.search(new RegExp(`\\b${esc}\\b`))
    if (pos >= 0 && pos < bestPos) {
      best = tk
      bestPos = pos
    }
  }
  return best
}

/** New ACTIVE id, or same id promoted from INITIATED/… → ACTIVE. */
function findActivatedAccount(
  accounts: ConnectorAccount[],
  beforeStatus: Map<string, string>,
  preferredSlug?: string | null
): ConnectorAccount | undefined {
  const activated = accounts.filter(a => {
    if (!a.id || a.status !== 'ACTIVE') return false
    return beforeStatus.get(a.id) !== 'ACTIVE'
  })
  if (!activated.length) return undefined
  if (preferredSlug) {
    const slug = preferredSlug.toLowerCase()
    const match = activated.find(a => (a.toolkit || '').toLowerCase() === slug)
    if (match) return match
  }
  return activated[0]
}

function AppTile({ app }: { app: ConnectorToolkit | null }) {
  if (app) {
    return <LogoTile className="h-10 w-10 rounded-xl p-1.5" toolkit={app} />
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
      <Link2 className="h-4 w-4" />
    </span>
  )
}

export function ConnectLinkCard({ url, context }: { url: string; context?: string }) {
  const { t } = useI18n()
  const tc = t.connectors
  const messageContext = useContext(ConnectLinkContext)
  const resolvedContext = context ?? messageContext

  const [phase, setPhase] = useState<Phase>('idle')
  const [toolkit, setToolkit] = useState<string | null>(null)
  const [app, setApp] = useState<ConnectorToolkit | null>(null)
  const aliveRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appRef = useRef<ConnectorToolkit | null>(null)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!resolvedContext) return
    let alive = true
    void loadConnectorsCatalog().then(tks => {
      if (!alive) return
      const detected = detectApp(resolvedContext, tks)
      setApp(detected)
      appRef.current = detected
    })
    return () => {
      alive = false
    }
  }, [resolvedContext])

  const authorize = async () => {
    // Snapshot BEFORE opening the window — a fast OAuth can ACTIVE the account
    // before we finish reading status, which would hide the transition.
    let beforeStatus = new Map<string, string>()
    try {
      const st = await getConnectorsStatus('global')
      beforeStatus = new Map(st.accounts.filter(a => a.id).map(a => [a.id, a.status]))
    } catch {
      /* carry on without a snapshot */
    }

    // Keep the window handle (no "noopener") so we can close it when ACTIVE.
    const win = window.open(url, '_blank')
    setPhase('waiting')

    const check = async (): Promise<boolean> => {
      const st = await getConnectorsStatus('global')
      const fresh = findActivatedAccount(st.accounts, beforeStatus, appRef.current?.slug)
      if (!fresh) return false
      setToolkit(fresh.toolkit)
      setPhase('connected')
      notifyConnectorsChanged(fresh.toolkit)
      void ensureComposioMcpReady({ force: true }).catch(() => null)
      try {
        win?.close()
      } catch {
        /* user may have closed it */
      }
      return true
    }

    const poll = (tries: number) => {
      if (!aliveRef.current) return
      timerRef.current = setTimeout(async () => {
        try {
          if (await check()) return
        } catch {
          /* try again */
        }
        if (tries < 40) poll(tries + 1)
        else if (aliveRef.current) setPhase('idle')
      }, tries === 0 ? 800 : 2500)
    }

    // Immediate check, then poll (OAuth often finishes while the popup paints).
    try {
      if (await check()) return
    } catch {
      /* poll */
    }
    poll(0)
  }

  const title = app?.name ?? (phase === 'connected' && toolkit ? toolkit : tc.authTitle)

  return (
    <div className="my-2 flex w-full max-w-md items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <AppTile app={app} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {phase === 'waiting' ? tc.waiting : phase === 'connected' ? tc.connected : tc.authSecure}
        </span>
      </span>
      {phase === 'connected' ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          {tc.connected}
        </span>
      ) : (
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          disabled={phase === 'waiting'}
          onClick={() => void authorize()}
          type="button"
        >
          {phase === 'waiting' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          {tc.authorize}
        </button>
      )}
    </div>
  )
}
