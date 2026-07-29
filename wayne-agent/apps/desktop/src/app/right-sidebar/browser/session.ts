import { atom } from 'nanostores'

import { setFileBrowserOpen } from '@/store/layout'

import { $rightSidebarTab, setTerminalTakeover, type RightSidebarTab } from '../store'

export type BrowserSessionStatus = 'idle' | 'running' | 'complete' | 'error'

export interface BrowserSessionState {
  lastTool: null | string
  providerHint: null | string
  screenshotPath: null | string
  sessionId: null | string
  status: BrowserSessionStatus
  updatedAt: number
  url: null | string
}

const IDLE: BrowserSessionState = {
  lastTool: null,
  providerHint: null,
  screenshotPath: null,
  sessionId: null,
  status: 'idle',
  updatedAt: 0,
  url: null
}

export const $browserSession = atom<BrowserSessionState>(IDLE)

const BROWSER_TOOLS = new Set([
  'browser_back',
  'browser_cdp',
  'browser_click',
  'browser_console',
  'browser_dialog',
  'browser_get_images',
  'browser_navigate',
  'browser_press',
  'browser_scroll',
  'browser_snapshot',
  'browser_type',
  'browser_vision'
])

export function isBrowserToolName(name: unknown): boolean {
  return typeof name === 'string' && BROWSER_TOOLS.has(name)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function pickString(...values: unknown[]): null | string {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) {
        return trimmed
      }
    }
  }
  return null
}

/** Pull URL / screenshot from a gateway tool.start|complete payload. */
export function extractBrowserSessionPatch(payload: Record<string, unknown> | undefined): Partial<BrowserSessionState> {
  if (!payload) {
    return {}
  }

  const args = asRecord(payload.args)
  const result = asRecord(payload.result)
  const resultData = asRecord(result?.data)

  const url = pickString(
    args?.url,
    result?.url,
    result?.current_url,
    resultData?.url,
    resultData?.result,
    typeof result?.result === 'string' && /^https?:\/\//i.test(result.result) ? result.result : null
  )

  const screenshotPath = pickString(
    result?.screenshot_path,
    resultData?.screenshot_path,
    resultData?.path,
    result?.path
  )

  return {
    lastTool: typeof payload.name === 'string' ? payload.name : null,
    screenshotPath: screenshotPath ?? undefined,
    url: url ?? undefined
  }
}

export function noteBrowserToolStart(sessionId: string, payload: Record<string, unknown> | undefined) {
  if (!isBrowserToolName(payload?.name)) {
    return
  }

  const patch = extractBrowserSessionPatch(payload)
  const prev = $browserSession.get()
  const next: BrowserSessionState = {
    ...prev,
    ...patch,
    lastTool: typeof payload?.name === 'string' ? payload.name : prev.lastTool,
    sessionId,
    status: 'running',
    updatedAt: Date.now(),
    url: patch.url ?? prev.url,
    screenshotPath: patch.screenshotPath ?? prev.screenshotPath
  }
  $browserSession.set(next)
  openBrowserPanel()
}

export function noteBrowserToolComplete(sessionId: string, payload: Record<string, unknown> | undefined) {
  if (!isBrowserToolName(payload?.name)) {
    return
  }

  const patch = extractBrowserSessionPatch(payload)
  const prev = $browserSession.get()
  const errored =
    typeof payload?.result === 'object' &&
    payload.result !== null &&
    'success' in (payload.result as object) &&
    (payload.result as { success?: boolean }).success === false

  $browserSession.set({
    ...prev,
    ...patch,
    lastTool: typeof payload?.name === 'string' ? payload.name : prev.lastTool,
    sessionId,
    status: errored ? 'error' : 'complete',
    updatedAt: Date.now(),
    url: patch.url ?? prev.url,
    screenshotPath: patch.screenshotPath ?? prev.screenshotPath
  })
  openBrowserPanel()
}

export function clearBrowserSession() {
  $browserSession.set(IDLE)
}

/** Open Ambiente on the Browser tab. */
export function openBrowserPanel() {
  setFileBrowserOpen(true)
  setTerminalTakeover(false)
  if (($rightSidebarTab.get() as RightSidebarTab) !== 'browser') {
    $rightSidebarTab.set('browser')
  }
}

/**
 * Show a local HTML / localhost preview in the Ambiente Browser tab (webview).
 * Used when the user opens landing.html / index.html from the status stack or
 * file tree — not only when the agent runs browser_* tools.
 */
export function openHtmlInBrowserPanel(url: string) {
  const trimmed = url.trim()

  if (!trimmed) {
    return
  }

  const prev = $browserSession.get()

  $browserSession.set({
    ...prev,
    lastTool: 'preview',
    providerHint: 'local-html',
    screenshotPath: null,
    sessionId: prev.sessionId,
    status: 'complete',
    updatedAt: Date.now(),
    url: trimmed
  })
  openBrowserPanel()
}

/** file:// URL for a local screenshot path (Windows-safe). */
export function screenshotFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`
  }
  const encoded = normalized
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')
  return `file://${encoded.startsWith('/') ? encoded : `/${encoded}`}`
}
