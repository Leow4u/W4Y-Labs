import { useI18n } from '@/i18n'
import { useProductRuntime } from '@/adapters'

/** Shown in the terminal pane when the browser shell has no local PTY. */
export function BrowserTerminalPlaceholder() {
  const { t } = useI18n()
  const runtime = useProductRuntime()

  if (runtime.capabilities.localTerminal) {
    return null
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-(--ui-text-secondary)">
      <p>{t.browserShell.terminalUnavailableTitle}</p>
      <p className="max-w-sm text-xs text-(--ui-text-tertiary)">{t.browserShell.terminalUnavailableBody}</p>
    </div>
  )
}
