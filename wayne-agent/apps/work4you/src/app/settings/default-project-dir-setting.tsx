/**
 * Default project directory — Electron bridge picker for where new sessions
 * start on disk. Lives under Settings → General (workspace pref), not archives.
 */
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { FolderOpen } from '@/lib/icons'
import { notify, notifyError } from '@/store/notifications'
import { applyConfiguredDefaultProjectDir, ensureDefaultWorkspaceCwd } from '@/store/session'

import { ListRow } from './primitives'

export function DefaultProjectDirSetting() {
  const { t } = useI18n()
  const s = t.settings.sessions
  const [dir, setDir] = useState<null | string>(null)
  const [fallback, setFallback] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // The bridge is only present when running inside Electron. In a Vitest
    // / Storybook / non-Electron context `window.hermesDesktop` is
    // undefined, so guard the WHOLE call chain rather than chaining
    // `?.settings.getDefaultProjectDir().then(...)` (the latter would
    // short-circuit to `undefined.then(...)` and throw at runtime).
    const settings = window.hermesDesktop?.settings

    if (!settings) {
      return
    }

    let alive = true

    void settings.getDefaultProjectDir().then(result => {
      if (!alive) {
        return
      }

      setDir(result.dir)
      setFallback(result.defaultLabel)
      applyConfiguredDefaultProjectDir(result.dir)
    })

    return () => {
      alive = false
    }
  }, [])

  const choose = useCallback(async () => {
    const settings = window.hermesDesktop?.settings

    if (!settings) {
      return
    }

    setBusy(true)

    try {
      const picked = await settings.pickDefaultProjectDir()

      if (picked.canceled || !picked.dir) {
        return
      }

      const result = await settings.setDefaultProjectDir(picked.dir)
      setDir(result.dir)
      applyConfiguredDefaultProjectDir(result.dir)
      notify({ durationMs: 4_000, kind: 'success', message: s.defaultDirUpdated })
    } catch (err) {
      notifyError(err, s.updateDirFailed)
    } finally {
      setBusy(false)
    }
  }, [s])

  const clear = useCallback(async () => {
    const settings = window.hermesDesktop?.settings

    if (!settings) {
      return
    }

    setBusy(true)

    try {
      await settings.setDefaultProjectDir(null)
      setDir(null)
      applyConfiguredDefaultProjectDir(null)
      await ensureDefaultWorkspaceCwd()
    } catch (err) {
      notifyError(err, s.clearDirFailed)
    } finally {
      setBusy(false)
    }
  }, [s])

  return (
    <ListRow
      action={
        <div className="flex items-center gap-3">
          <Button disabled={busy} onClick={() => void choose()} size="sm" type="button" variant="textStrong">
            <FolderOpen className="size-3.5" />
            <span>{dir ? s.change : s.choose}</span>
          </Button>
          {dir && (
            <Button disabled={busy} onClick={() => void clear()} size="sm" type="button" variant="text">
              {s.clear}
            </Button>
          )}
        </div>
      }
      description={dir ? s.defaultDirDesc : s.defaultsTo(fallback || '~')}
      inset
      title={dir ? dir : s.defaultDirTitle}
    />
  )
}
