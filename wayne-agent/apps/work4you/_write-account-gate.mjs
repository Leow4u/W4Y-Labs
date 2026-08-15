import fs from 'node:fs'

const content = `/**
 * Work4You account gate — desktop must have a platform session before the
 * product UI (chat, provider onboarding, etc.). Logout returns here.
 */
import { atom } from 'nanostores'

import { cloudRunAvailable, probeCloudLogin } from '@/lib/w4y-cloud-projects'

export type AccountGatePhase = 'checking' | 'idle' | 'required' | 'signing-in'

export interface AccountGateState {
  error: null | string
  phase: AccountGatePhase
}

export function w4yAccountGateEnabled(): boolean {
  return cloudRunAvailable()
}

export const $accountGate = atom<AccountGateState>({
  phase: w4yAccountGateEnabled() ? 'checking' : 'idle',
  error: null
})

export function accountGateBlocksApp(phase: AccountGatePhase): boolean {
  return phase === 'checking' || phase === 'required' || phase === 'signing-in'
}

export async function refreshAccountGate(): Promise<boolean> {
  if (!w4yAccountGateEnabled()) {
    $accountGate.set({ phase: 'idle', error: null })
    return true
  }

  $accountGate.set({ phase: 'checking', error: null })
  const loggedIn = await probeCloudLogin()

  if (loggedIn === true) {
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
      throw new Error(res?.reason || 'login-failed')
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

export function openByoProviderSetup() {
  $accountGate.set({ phase: 'idle', error: null })
}
`

fs.writeFileSync(new URL('./src/store/account-gate.ts', import.meta.url), content, 'utf8')
