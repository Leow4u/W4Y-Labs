/**
 * Work4You account gate — desktop must have a platform session before the
 * product UI (chat, provider onboarding, etc.). Logout returns here.
 */
import { atom } from 'nanostores'

import { cloudRunAvailable } from '@/lib/w4y-cloud-projects'

export type AccountGatePhase = 'checking' | 'idle' | 'required' | 'signing-in'

export interface AccountGateState {
  error: null | string
  phase: AccountGatePhase
}

type PlatformSessionProbe = {
  loggedIn?: boolean
  noCredit?: boolean
}

export function w4yAccountGateEnabled(): boolean {
  return cloudRunAvailable()
}

/** Work4You product (platform account + bundled model access), desktop or browser SPA. */
export function isWork4YouProduct(): boolean {
  if (import.meta.env.VITE_APP_SHELL === 'browser') {
    return true
  }

  return cloudRunAvailable()
}

export const $accountGate = atom<AccountGateState>({
  phase: w4yAccountGateEnabled() ? 'checking' : 'idle',
  error: null
})

export function accountGateBlocksApp(phase: AccountGatePhase): boolean {
  return phase === 'checking' || phase === 'required' || phase === 'signing-in'
}

async function probePlatformLogin(): Promise<boolean | null> {
  const w4y = window.work4youDesktop?.w4y
  if (!w4y) {
    return null
  }

  if (typeof w4y.probeSession === 'function') {
    try {
      const res = (await w4y.probeSession()) as PlatformSessionProbe | null
      if (res?.loggedIn === true) {
        return true
      }
      if (res?.loggedIn === false) {
        return false
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const hasKey = await w4y.hasKey?.()
    if (hasKey?.hasKey) {
      return true
    }
  } catch {
    /* ignore */
  }

  return null
}

export async function refreshAccountGate(): Promise<boolean> {
  if (!w4yAccountGateEnabled()) {
    $accountGate.set({ phase: 'idle', error: null })
    return true
  }

  $accountGate.set({ phase: 'checking', error: null })
  const loggedIn = await probePlatformLogin()

  if (loggedIn === true) {
    const { ensurePlatformOnboardingComplete } = await import('./onboarding')
    ensurePlatformOnboardingComplete()
    $accountGate.set({ phase: 'idle', error: null })
    return true
  }

  $accountGate.set({ phase: 'required', error: null })
  return false
}

export function requireAccountLogin() {
  if (!w4yAccountGateEnabled()) {
    return
  }

  $accountGate.set({ phase: 'required', error: null })
}

export async function signInToWork4You(): Promise<boolean> {
  const login = window.work4youDesktop?.w4y?.login

  if (!login) {
    return false
  }

  $accountGate.set({ phase: 'signing-in', error: null })

  try {
    const res = await login()

    if (!res?.ok) {
      const reason = res?.reason || 'login-failed'
      if (reason === 'cancelled') {
        $accountGate.set({ phase: 'required', error: null })
        return false
      }
      throw new Error(reason)
    }

    await window.work4youDesktop?.w4y?.bootstrapApp?.().catch(() => undefined)

    const gateOpen = await refreshAccountGate()
    if (gateOpen) {
      return true
    }

    window.location.reload()
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    $accountGate.set({ phase: 'required', error: message })
    return false
  }
}

export async function signOutFromWork4You(): Promise<void> {
  const logout = window.work4youDesktop?.w4y?.logout

  if (logout) {
    await logout()
  }

  const { resetOnboardingAfterLogout } = await import('./onboarding')
  resetOnboardingAfterLogout()
  requireAccountLogin()
}