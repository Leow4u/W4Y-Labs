/**
 * Preferred / live run target for Hermes desktop (Local vs Cloud 24/7).
 * Cloud sessions use the Work4You brain via work4youDesktop.cloud — never a PC path.
 */
import { atom } from 'nanostores'

import { isCloudBrainSession, getCloudSession, getCloudSessionMessages } from '@/lib/cloud-sessions'
import {
  $cloudProjectSlug,
  $runTarget,
  $sessionRunTarget,
  applyCloudFirstRunTargetDefault,
  clearCloudProjectSlug,
  cloudProjectCwd,
  cwdForCloudSession,
  isLocalMachinePath,
  markRunTargetUserChoice,
  type RunTarget,
  setCloudProjectSlug,
  setRunTarget,
  setSessionRunTarget
} from '@/lib/w4y-cloud-projects'
import { ensureCloudBrainActive, ensureLocalBrainActive } from '@/store/gateway'
import { $sessions } from '@/store/session'
import { resolveNewSessionCwd } from '@/store/projects'

export type { RunTarget }
export {
  $cloudProjectSlug,
  $runTarget,
  $sessionRunTarget,
  applyCloudFirstRunTargetDefault,
  clearCloudProjectSlug,
  markRunTargetUserChoice,
  setCloudProjectSlug,
  setRunTarget,
  setSessionRunTarget
}

/** One-shot agent prompt after cloud clone / gh auth (cleared when consumed). */
export const $pendingCloudAgentPrompt = atom<null | string>(null)

export function queueCloudAgentPrompt(text: string): void {
  const trimmed = text.trim()
  $pendingCloudAgentPrompt.set(trimmed || null)
}

export function consumeCloudAgentPrompt(): null | string {
  const next = $pendingCloudAgentPrompt.get()
  $pendingCloudAgentPrompt.set(null)
  return next
}

/** True while the live conversation already settled on a brain (chip locks). */
export function isRunTargetLocked(hasActiveSession: boolean): boolean {
  return hasActiveSession
}

/**
 * Cwd for a brand-new chat given the preferred run target.
 * Cloud: projects/<slug> on the cloud volume, or empty — never a Windows/mac path.
 * Local: existing project-scope / workspace resolver.
 */
export function resolveCwdForPreferredTarget(): string {
  if ($runTarget.get() === 'cloud') {
    const slug = $cloudProjectSlug.get().trim()
    return cwdForCloudSession(slug ? cloudProjectCwd(slug) : '')
  }

  return resolveNewSessionCwd()
}

/**
 * Cwd shipped on session.create for the brain we are about to use.
 * Strips PC paths when the session will run in the cloud.
 */
export function resolveSessionCreateCwd(localFallback: string): string {
  const brain: RunTarget =
    $runTarget.get() === 'cloud' || $sessionRunTarget.get() === 'cloud' ? 'cloud' : 'local'

  if (brain === 'cloud') {
    const slug = $cloudProjectSlug.get().trim()
    const preferred = slug ? cloudProjectCwd(slug) : localFallback
    return cwdForCloudSession(preferred)
  }

  if (isLocalMachinePath(localFallback) || localFallback.trim()) {
    return localFallback.trim()
  }

  return resolveNewSessionCwd()
}

export function beginCloudProjectSession(slug: string): void {
  setCloudProjectSlug(slug)
  markRunTargetUserChoice('cloud')
  setRunTarget('cloud')
  setSessionRunTarget('cloud')
}

export function beginLocalSession(): void {
  markRunTargetUserChoice('local')
  setRunTarget('local')
  setSessionRunTarget('local')
}

/**
 * Awaited before every prompt.submit — picks the correct gateway brain and
 * avoids cloud/local races (BACKEND-MAP fly206 / Trilha F4).
 */
export async function prepareBrainForSubmit(storedSessionId: null | string): Promise<void> {
  const row = storedSessionId
    ? $sessions.get().find(s => s.id === storedSessionId || s._lineage_root_id === storedSessionId)
    : undefined

  const useCloud =
    isCloudBrainSession(row) ||
    (!storedSessionId && $runTarget.get() === 'cloud') ||
    $sessionRunTarget.get() === 'cloud'

  if (useCloud) {
    await ensureCloudBrainActive()
    return
  }

  await ensureLocalBrainActive()
}
