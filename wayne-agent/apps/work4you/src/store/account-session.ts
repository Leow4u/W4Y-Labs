/**
 * Single source of truth for "am I signed in to Work4You".
 *
 * Until 17/08/2026 the product had three answers: the account gate opened on
 * an OpenRouter key in a file, the sidebar treated `me || hasKey` as signed
 * in, and Settings required `/api/auth/me`. That is how an app could show
 * "Conta" / "Sem sessão" while the gate stayed open and connectors 503'd.
 *
 * Identity is the tenant answering `/api/auth/me`. Model keys (`hasKey`) and
 * platform cookies are credentials for other surfaces — never OR'd into this.
 */
import { atom } from 'nanostores'

import { cloudRunAvailable } from '@/lib/w4y-cloud-projects'

export type AuthMe = {
  display_name?: string | null
  email?: string | null
  user_id?: string | null
}

export type AccountSessionStatus = 'unknown' | 'checking' | 'signedIn' | 'signedOut'

/** Cheap /me classification for the product gate — not the same as identity. */
export type AccountSessionProbe = 'signed-in' | 'signed-out' | 'unavailable'

export interface AccountSessionState {
  me: AuthMe | null
  status: AccountSessionStatus
}

export const $accountSession = atom<AccountSessionState>({
  status: 'unknown',
  me: null
})

export function accountSessionSignedIn(state: AccountSessionState = $accountSession.get()): boolean {
  if (state.status !== 'signedIn' || !state.me) {
    return false
  }
  const email = (state.me.email || '').trim()
  const userId = (state.me.user_id || '').trim()
  return Boolean(email || userId)
}

export function clearAccountSession() {
  $accountSession.set({ status: 'signedOut', me: null })
}

function classifyFailedMe(res: {
  error?: string
  ok?: boolean
  status?: number
} | null): AccountSessionProbe {
  const status = typeof res?.status === 'number' ? res.status : 0
  const error = typeof res?.error === 'string' ? res.error : ''
  if (status === 401 || status === 403 || error === 'not-logged-in') {
    return 'signed-out'
  }
  return 'unavailable'
}

/**
 * Ask the tenant who we are. Distinguishes first-run 401 (signed-out — show
 * Continuar now) from Fly-wake / network 5xx (unavailable — budgeted wait).
 */
export async function probeAccountSession(): Promise<AccountSessionProbe> {
  if (!cloudRunAvailable()) {
    $accountSession.set({ status: 'signedOut', me: null })
    return 'signed-out'
  }

  $accountSession.set({
    status: 'checking',
    me: $accountSession.get().me
  })

  const api = window.work4youDesktop?.cloud?.api
  if (!api) {
    clearAccountSession()
    return 'unavailable'
  }

  try {
    const res = await api({ method: 'GET', path: '/api/auth/me' })
    if (!res?.ok || !res.json || typeof res.json !== 'object') {
      clearAccountSession()
      return classifyFailedMe(res)
    }

    const me = res.json as AuthMe
    const email = (me.email || '').trim()
    const userId = (me.user_id || '').trim()
    if (!email && !userId) {
      clearAccountSession()
      return 'signed-out'
    }

    $accountSession.set({ status: 'signedIn', me })
    return 'signed-in'
  } catch {
    clearAccountSession()
    return 'unavailable'
  }
}

/**
 * Ask the tenant who we are. Returns true only when identity is present.
 * Fail-closed on network errors for callers that only need a boolean.
 */
export async function refreshAccountSession(): Promise<boolean> {
  return (await probeAccountSession()) === 'signed-in'
}
