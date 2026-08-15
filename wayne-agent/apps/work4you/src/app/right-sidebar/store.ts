import { atom } from 'nanostores'

import { persistBoolean, storedBoolean } from '@/lib/storage'
import { setFileBrowserOpen } from '@/store/layout'

const TAKEOVER_KEY = 'hermes.desktop.terminalTakeover'

export type RightSidebarTab = 'agents' | 'browser' | 'files' | 'terminal'

/** Active Ambiente tab (Files | Agents | Browser | Terminal). */
export const $rightSidebarTab = atom<RightSidebarTab>('files')

export const $terminalTakeover = atom(storedBoolean(TAKEOVER_KEY, false))

$terminalTakeover.subscribe(active => persistBoolean(TAKEOVER_KEY, active))

export const setTerminalTakeover = (active: boolean) => $terminalTakeover.set(active)

/** Open Ambiente on the Terminal tab and surface the embedded terminal. */
export const openTerminalPanel = () => {
  setFileBrowserOpen(true)
  $rightSidebarTab.set('terminal')
  setTerminalTakeover(true)
}

/** Hide the terminal surface and leave Ambiente on Files. */
export const hideTerminalPanel = () => {
  setTerminalTakeover(false)
  if ($rightSidebarTab.get() === 'terminal') {
    $rightSidebarTab.set('files')
  }
}

/** A command queued to run in the embedded terminal. The terminal pane flushes
 *  (and clears) it once its session is live, so a value set before the pane
 *  mounts still runs. Cleared after flush so a later remount can't replay it. */
export const $terminalInjection = atom<null | string>(null)

/** Open the terminal pane and run a command in it. Used to disconnect external
 *  (CLI-managed) providers, which Hermes can't clear via the API — the user
 *  sees exactly what runs instead of Hermes silently deleting their creds. */
export const runInTerminal = (command: string) => {
  const trimmed = command.trim()

  if (!trimmed) {
    return
  }

  openTerminalPanel()
  $terminalInjection.set(trimmed)
}
