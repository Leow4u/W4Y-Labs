/**
 * Guided import: copy a prompt for another AI, paste the reply into USER.md.
 */
import { useEffect, useState } from 'react'

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
import { getUserProfile, setUserProfile } from '@/hermes'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Check, Copy, Loader2 } from '@/lib/icons'
import { notify, notifyError } from '@/store/notifications'

function mergeProfile(existing: string, imported: string): string {
  const base = existing.trim()
  const addition = imported.trim()
  if (!addition) return base
  if (!base) return addition
  return `${base}\n\n---\n\n${addition}`
}

interface ImportMemoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When true, profile toggle is off — caller can enable before save. */
  profileEnabled: boolean
  onEnableProfile: () => void
}

export function ImportMemoryDialog({
  open,
  onOpenChange,
  profileEnabled,
  onEnableProfile
}: ImportMemoryDialogProps) {
  const { t } = useI18n()
  const copy = t.settings.memoryPage
  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setPasted('')
      setCopied(false)
      setSaving(false)
    }
  }, [open])

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(copy.importPrompt)
      setCopied(true)
      triggerHaptic('success')
      window.setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      notifyError(error, copy.importCopyFailed)
    }
  }

  const save = async () => {
    if (!pasted.trim()) return

    if (!profileEnabled) {
      onEnableProfile()
    }

    setSaving(true)
    try {
      const profile = await getUserProfile()
      const merged = mergeProfile(profile.content, pasted)
      if (merged.length > profile.char_limit) {
        notifyError(
          new Error(`${merged.length}/${profile.char_limit}`),
          copy.importTooLong(profile.char_limit)
        )
        return
      }
      await setUserProfile(merged)
      triggerHaptic('success')
      notify({ kind: 'success', title: copy.importSaved, message: copy.importSavedDesc })
      onOpenChange(false)
    } catch (error) {
      notifyError(error, copy.importSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(85vh,42rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-(--ui-stroke-tertiary)/80 px-5 py-4">
          <DialogTitle>{copy.importTitle}</DialogTitle>
          <DialogDescription>{copy.importDesc}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="grid gap-2">
            <h3 className="text-[length:var(--conversation-text-font-size)] font-medium">
              {copy.importStep1Title}
            </h3>
            <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
              {copy.importStep1Desc}
            </p>
            <div className="rounded-lg bg-(--ui-bg-tertiary)/70 p-3">
              <pre className="whitespace-pre-wrap font-sans text-[length:var(--conversation-caption-font-size)] leading-relaxed text-foreground">
                {copy.importPrompt}
              </pre>
              <Button className="mt-3" onClick={() => void copyPrompt()} size="sm" type="button" variant="outline">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? t.common.copied : t.common.copy}
              </Button>
            </div>
          </section>

          <section className="grid gap-2">
            <h3 className="text-[length:var(--conversation-text-font-size)] font-medium">
              {copy.importStep2Title}
            </h3>
            <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
              {copy.importStep2Desc}
            </p>
            <Textarea
              className="min-h-36 text-[length:var(--conversation-caption-font-size)]"
              onChange={event => setPasted(event.target.value)}
              placeholder={copy.importPastePlaceholder}
              value={pasted}
            />
            {!profileEnabled ? (
              <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                {copy.importEnableProfileHint}
              </p>
            ) : null}
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-(--ui-stroke-tertiary)/80 px-5 py-3">
          <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
            {t.common.cancel}
          </Button>
          <Button disabled={!pasted.trim() || saving} onClick={() => void save()} type="button">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {saving ? t.common.saving : copy.importConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
