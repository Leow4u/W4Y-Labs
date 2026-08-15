import { useStore } from '@nanostores/react'
import { useEffect, useRef } from 'react'

import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import { $browserSession, screenshotFileUrl } from './session'

function canEmbedPreviewUrl(url: null | string): boolean {
  if (!url) {
    return false
  }

  if (/^file:/i.test(url)) {
    return true
  }

  try {
    const parsed = new URL(url)

    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:'
    ) && /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(parsed.hostname)
  } catch {
    return false
  }
}

export function BrowserPanelBody() {
  const { t } = useI18n()
  const b = t.rightSidebar.browser
  const session = useStore($browserSession)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const hasSession = Boolean(session.url || session.screenshotPath || session.status !== 'idle')
  const embedUrl = !session.screenshotPath && canEmbedPreviewUrl(session.url) ? session.url : null

  // Local HTML / localhost: mount an Electron <webview> (same partition as the
  // Preview rail) so opening landing.html lands in Ambiente → Browser.
  useEffect(() => {
    const host = hostRef.current

    if (!host || !embedUrl) {
      return
    }

    host.replaceChildren()

    const webview = document.createElement('webview') as HTMLElement & { src?: string }
    webview.className = 'flex h-full w-full flex-1 bg-white'
    webview.setAttribute('partition', 'persist:hermes-preview')
    webview.setAttribute('src', embedUrl)
    webview.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes')
    host.appendChild(webview)

    return () => {
      webview.remove()
      host.replaceChildren()
    }
  }, [embedUrl])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-(--ui-editor-surface-background)">
      <div className="flex shrink-0 items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 py-2">
        <StatusDot status={session.status} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.7rem] font-medium text-foreground">
            {session.url || b.idleTitle}
          </div>
          <div className="truncate text-[0.65rem] text-(--ui-text-tertiary)">
            {statusLabel(session.status, b)}
            {session.lastTool ? ` · ${session.lastTool}` : ''}
          </div>
        </div>
      </div>

      {!hasSession ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-[length:var(--conversation-text-font-size)] font-medium text-foreground">
            {b.emptyTitle}
          </p>
          <p className="max-w-xs text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {b.emptyBody}
          </p>
        </div>
      ) : embedUrl ? (
        <div className="min-h-0 flex-1 overflow-hidden" ref={hostRef} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {session.screenshotPath ? (
            <img
              alt={b.screenshotAlt}
              className="mx-auto max-h-full w-full rounded-lg border border-(--ui-stroke-tertiary) object-contain bg-black/20"
              src={screenshotFileUrl(session.screenshotPath)}
            />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-(--ui-stroke-tertiary) px-4 text-center text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
              {session.status === 'running' ? b.waitingShot : b.noShot}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        status === 'running' && 'bg-primary animate-pulse',
        status === 'complete' && 'bg-emerald-500',
        status === 'error' && 'bg-destructive',
        status === 'idle' && 'bg-(--ui-stroke-secondary)'
      )}
    />
  )
}

function statusLabel(
  status: string,
  b: {
    statusIdle: string
    statusRunning: string
    statusComplete: string
    statusError: string
  }
) {
  if (status === 'running') {
    return b.statusRunning
  }
  if (status === 'complete') {
    return b.statusComplete
  }
  if (status === 'error') {
    return b.statusError
  }
  return b.statusIdle
}
