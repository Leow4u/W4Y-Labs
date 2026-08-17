/**
 * Work4You account gate — desktop must have a **tenant** session before the
 * product UI. Logout returns here.
 *
 * Identity is `$accountSession` (`/api/auth/me`). An OpenRouter key on disk is
 * model access, not proof of login — treating it as such left the gate open
 * while every tenant surface said "Sem sessão" (17/08).
 */
import { atom } from 'nanostores'

import { cloudRunAvailable } from '@/lib/w4y-cloud-projects'

import {
  accountSessionSignedIn,
  clearAccountSession,
  refreshAccountSession
} from './account-session'

export type AccountGatePhase = 'checking' | 'idle' | 'required' | 'signing-in'

export interface AccountGateState {
  error: null | string
  phase: AccountGatePhase
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

/**
 * Heal credentials first (tenant SSO + Composio key when possible), then ask
 * the tenant who we are. The gate opens only on that answer.
 */
export async function refreshAccountGate(): Promise<boolean> {
  if (!w4yAccountGateEnabled()) {
    $accountGate.set({ phase: 'idle', error: null })
    return true
  }

  $accountGate.set({ phase: 'checking', error: null })

  // Same-home soft login and cold boots both land here: ensureCredentials
  // re-runs the tenant handoff when cookies died but the model key survived.
  try {
    await window.work4youDesktop?.w4y?.ensureCredentials?.()
  } catch {
    /* identity check below decides */
  }

  const signedIn = await refreshAccountSession()

  if (signedIn) {
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

  clearAccountSession()
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

    // Soft motor restart (same account home) returns here. Full relaunch exits
    // the process before this line — cold start then runs refreshAccountGate.
    const gateOpen = await refreshAccountGate()
    if (gateOpen) {
      return true
    }

    // Handoff wrote the key but the tenant still does not know us — keep the
    // gate up with an error rather than pretending hasKey is enough.
    if (res.tenantSession === false) {
      $accountGate.set({
        phase: 'required',
        error: 'tenant-session-failed'
      })
      return false
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

/** @deprecated Prefer accountSessionSignedIn — kept for call sites mid-migration. */
export function isAccountGateSignedIn(): boolean {
  return accountSessionSignedIn()
}
