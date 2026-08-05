/**
 * Settings → Memory — view/edit USER.md + status sizes + reset entry points.
 */
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { getMemoryStatus, getUserProfile, setUserProfile } from '@/hermes'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Loader2 } from '@/lib/icons'
import { notify, notifyError } from '@/store/notifications'
import type { MemoryStatusResponse } from '@/types/hermes'

function formatBytes(size: number): string {
  if (size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

interface ManageMemoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManageMemoryDialog({ open, onOpenChange }: ManageMemoryDialogProps) {
  const { t } = useI18n()
  const copy = t.settings.memoryPage
  const [status, setStatus] = useState<MemoryStatusResponse | null>(null)
  const [content, setContent] = useState('')
  const [charLimit, setCharLimit] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [nextStatus, profile] = await Promise.all([getMemoryStatus(), getUserProfile()])
      setStatus(nextStatus)
      setContent(profile.content)
      setCharLimit(profile.char_limit)
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.manageLoadFailed
      setLoadError(message)
      notifyError(error, copy.manageLoadFailed)
    } finally {
      setLoading(false)
    }
  }, [copy.manageLoadFailed])

  useEffect(() => {
    if (!open) {
      setLoadError(null)
      return
    }
    void load()
  }, [load, open, reloadKey])

  const save = async () => {
    setSaving(true)
    try {
      await setUserProfile(content)
      triggerHaptic('success')
      notify({ kind: 'success', title: copy.manageSaved, message: copy.manageSavedDesc })
      setStatus(await getMemoryStatus())
    } catch (error) {
      notifyError(error, copy.manageSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  const providerLabel =
    status?.active && status.active.trim()
      ? (copy.providers[status.active] ?? status.active)
      : (copy.providers.builtin ?? copy.builtinProvider)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(85vh,40rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-(--ui-stroke-tertiary)/80 px-5 py-4">
          <DialogTitle>{copy.manageTitle}</DialogTitle>
          <DialogDescription>{copy.manageDesc}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-(--ui-text-tertiary)">
              <Loader2 className="size-4 animate-spin" />
              {t.common.loading}
            </div>
          ) : loadError ? (
            <div className="grid gap-3 py-6">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button
                onClick={() => setReloadKey(key => key + 1)}
                type="button"
                variant="outline"
              >
                {t.common.retry}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="rounded-lg bg-(--ui-bg-tertiary)/70 px-3.5 py-3 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-secondary)">
                <div>
                  {copy.manageProvider}: <span className="text-foreground">{providerLabel}</span>
                </div>
                <div className="mt-1">
                  {copy.manageMemorySize}:{' '}
                  <span className="text-foreground">
                    {formatBytes(status?.builtin_files.memory ?? 0)}
                  </span>
                  {' · '}
                  {copy.manageProfileSize}:{' '}
                  <span className="text-foreground">{formatBytes(status?.builtin_files.user ?? 0)}</span>
                </div>
              </div>

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {copy.manageProfileLabel}
                  {charLimit > 0 ? ` (${content.length}/${charLimit})` : null}
                </span>
                <Textarea
                  className="min-h-48 font-mono text-[length:var(--conversation-caption-font-size)]"
                  onChange={event => setContent(event.target.value)}
                  placeholder={copy.manageProfilePlaceholder}
                  value={content}
                />
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-(--ui-stroke-tertiary)/80 px-5 py-3">
          <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
            {t.common.cancel}
          </Button>
          <Button
            disabled={loading || saving || Boolean(loadError)}
            onClick={() => void save()}
            type="button"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {saving ? t.common.saving : t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
