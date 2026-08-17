import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { AppSpinner } from '@/components/ui/app-spinner'
import { useI18n } from '@/i18n'
import { Download, ExternalLink, Loader2, LogIn } from '@/lib/icons'
import { cn } from '@/lib/utils'
import {
  $accountGate,
  accountGateBlocksApp,
  refreshAccountGate,
  signInToWork4You,
  w4yAccountGateEnabled
} from '@/store/account-gate'
import { $updateStatus, checkUpdates, startActiveUpdate } from '@/store/updates'

const SIGNUP_URL = 'https://work4you.ai/login'
const DOWNLOAD_URL = 'https://work4you.ai/baixar'

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function Work4YouAccountGate() {
  const { t } = useI18n()
  const copy = t.accountGate
  const gate = useStore($accountGate)
  const updateStatus = useStore($updateStatus)

  useEffect(() => {
    if (!w4yAccountGateEnabled()) {
      return
    }

    void refreshAccountGate()
    void checkUpdates()
  }, [])

  if (!w4yAccountGateEnabled() || !accountGateBlocksApp(gate.phase)) {
    return null
  }

  const signingIn = gate.phase === 'signing-in'
  const checking = gate.phase === 'checking'
  const clientBehind = updateStatus?.behind ?? 0
  const updateAvailable = Boolean(updateStatus?.updateAvailable || clientBehind > 0)

  return (
    <div
      className={cn(
        'fixed inset-0 z-[1320] flex items-center justify-center bg-(--ui-chat-surface-background) p-6',
        '[-webkit-app-region:drag]'
      )}
    >
      <div className="w-full max-w-md text-center [-webkit-app-region:no-drag]">
        <BrandMark className="mx-auto size-20" />
        <p className="mt-5 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Work4You
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{copy.title}</h1>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-muted-foreground">{copy.subtitle}</p>

        {updateAvailable ? (
          <div className="mt-4 rounded-lg border border-(--ui-accent)/30 bg-(--ui-accent)/5 px-3 py-3 text-sm">
            <p className="text-foreground">{copy.updateAvailable}</p>
            <Button
              className="mt-3 h-9 w-full"
              onClick={() => void startActiveUpdate()}
              type="button"
              variant="secondary"
            >
              <Download className="size-4" />
              {copy.updateNow}
            </Button>
          </div>
        ) : null}

        {gate.error ? (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {copy.signInFailed}
          </p>
        ) : null}

        <div className="mt-8 grid gap-3">
          <Button
            className="h-11 w-full text-[0.9375rem]"
            disabled={checking || signingIn}
            onClick={() => void signInToWork4You()}
            size="lg"
            type="button"
          >
            {checking ? (
              <AppSpinner className="size-5" />
            ) : signingIn ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <LogIn className="size-5" />
            )}
            {checking ? copy.checking : signingIn ? copy.signingIn : copy.continueSignIn}
          </Button>

          <Button
            className="h-10 w-full text-[0.875rem] font-normal text-muted-foreground"
            disabled={checking || signingIn}
            onClick={() => openExternal(SIGNUP_URL)}
            type="button"
            variant="ghost"
          >
            {copy.createAccount}
            <ExternalLink className="size-3.5 opacity-70" />
          </Button>

          {/* Already running the installed app — a link to /baixar belongs on
              the web gate only. Showing it here was part of what made this
              screen feel unfinished next to Cursor/Claude. */}
          {window.work4youDesktop?.isDesktop ? null : (
            <button
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => openExternal(DOWNLOAD_URL)}
              type="button"
            >
              {copy.manualDownload}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}