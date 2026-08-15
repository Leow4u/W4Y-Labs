/**
 * Thin RepoModal: GitHub connect / clone URL → cloud mkdir + project row + agent prompt.
 * Same contract as web ProjectPicker RepoModal (no REST clone).
 */
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useI18n } from '@/i18n'
import {
  CLOUD_FILES_ROOT,
  cloudGhReady,
  cloudProjectCwd,
  GIT_URL_RE,
  prepareCloudCloneProject
} from '@/lib/w4y-cloud-projects'
import { Check, Github, Loader2 } from '@/lib/icons'
import { ensureCloudBrainActive } from '@/store/gateway'
import { notifyError } from '@/store/notifications'
import { exitProjectScope } from '@/store/projects'
import { beginCloudProjectSession, queueCloudAgentPrompt } from '@/store/run-target'
import { setCurrentCwd } from '@/store/session'

export function RepoModal({
  open,
  onOpenChange,
  onPrepared
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after cloud project is ready and clone prompt is queued (start fresh chat). */
  onPrepared?: () => void
}) {
  const { t } = useI18n()
  const c = t.composer
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [ghReady, setGhReady] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setUrl('')
    setBusy(false)
    setGhReady(null)
    void cloudGhReady(CLOUD_FILES_ROOT)
      .then(ready => setGhReady(ready))
      .catch(() => setGhReady(false))
  }, [open])

  const close = () => onOpenChange(false)

  const finishCloneSetup = async (repoUrl: string) => {
    const { slug } = await prepareCloudCloneProject(repoUrl)
    exitProjectScope()
    beginCloudProjectSession(slug)
    setCurrentCwd(cloudProjectCwd(slug))
    await ensureCloudBrainActive()
    queueCloudAgentPrompt(c.repoClonePrompt.replace('{url}', repoUrl))
    close()
    onPrepared?.()
  }

  const submit = async () => {
    const u = url.trim()
    if (!GIT_URL_RE.test(u) || busy) return
    setBusy(true)
    try {
      await finishCloneSetup(u)
    } catch (err) {
      notifyError(err, c.cloudCloneFailed)
    } finally {
      setBusy(false)
    }
  }

  const connectGithub = () => {
    void window.hermesDesktop?.openExternal('https://github.com/login/device').catch(() => {
      window.open('https://github.com/login/device', '_blank', 'noopener,noreferrer')
    })
    exitProjectScope()
    beginCloudProjectSession('')
    setCurrentCwd('')
    void ensureCloudBrainActive().catch(() => undefined)
    queueCloudAgentPrompt(c.ghConnectPrompt)
    close()
    onPrepared?.()
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md" fitContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-4 shrink-0 text-muted-foreground" />
            {c.repoModalTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">{c.repoModalTitle}</DialogDescription>
        </DialogHeader>

        {ghReady === null ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : ghReady ? (
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-[0.7rem] text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" />
              {c.repoConnected}
            </p>
            <input
              ref={inputRef}
              autoFocus
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 font-mono text-[0.8rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30"
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void submit()
              }}
              placeholder={c.repoUrlPlaceholder}
              value={url}
            />
            <p className="text-[0.7rem] text-muted-foreground">{c.repoAnyProvider}</p>
            <DialogFooter>
              <Button disabled={!GIT_URL_RE.test(url.trim()) || busy} onClick={() => void submit()} type="button">
                {busy ? c.repoBusy : c.repoConfirm}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <Button className="w-full" onClick={connectGithub} type="button">
              <Github className="size-4" />
              {c.ghConnectCta}
            </Button>
            <p className="text-center text-[0.75rem] text-muted-foreground">{c.ghConnectDesc}</p>
            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{c.repoOrUrl}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 font-mono text-[0.75rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30"
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void submit()
                }}
                placeholder={c.repoUrlPlaceholder}
                value={url}
              />
              <Button
                disabled={!GIT_URL_RE.test(url.trim()) || busy}
                onClick={() => void submit()}
                type="button"
                variant="outline"
              >
                {busy ? c.repoBusy : c.repoConfirm}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
