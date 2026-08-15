import type { ProfileInfo } from '@/types/hermes'

/**
 * Work (Default) profile helpers — see docs/PRODUTO.md.
 *
 * The installation `default` profile IS Work: day-to-day agent. It must not be
 * treated as a user-editable “extra agent” in Profiles (rename/delete/SOUL
 * self-service). Lapidation of Work is a future product step.
 */

/** True for the Work home profile. */
export function isWorkProfile(
  profile: Pick<ProfileInfo, 'is_default' | 'name'> | null | string | undefined
): boolean {
  if (profile == null) return false
  if (typeof profile === 'string') {
    return profile.trim().toLowerCase() === 'default'
  }
  return Boolean(profile.is_default) || profile.name.trim().toLowerCase() === 'default'
}

/** "redator-financeiro" → "Redator Financeiro". */
export function prettifyAgentName(name: string): string {
  const s = name.replace(/[-_]+/g, ' ').trim()
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

/** Initials for the agent avatar (Copilot-style monogram). */
export function agentMonogram(name: string): string {
  const parts = prettifyAgentName(name).split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return prettifyAgentName(name).slice(0, 2).toUpperCase()
}

/** Profiles excluding Work (Default). Used by Profiles CRUD. */
export function realAgents(profiles: ProfileInfo[]): ProfileInfo[] {
  return profiles.filter(p => !isWorkProfile(p))
}
