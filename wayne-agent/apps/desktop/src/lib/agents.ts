import type { ProfileInfo } from '@/types/hermes'

/**
 * Work (Default) vs Studio agents — see docs/PRODUTO.md.
 *
 * The installation `default` profile IS Work: day-to-day agent, not a Studio
 * agent. It must never appear in Studio/Profiles as an editable agent, and
 * users must not edit its SOUL.md / rename / delete it via those surfaces.
 * Lapidation of Work is a future product step, not user self-service.
 */

/** True for the Work home profile (never a Studio agent). */
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
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return prettifyAgentName(name).slice(0, 2).toUpperCase()
}

/**
 * Agents the owner manages in Studio / Profiles — excludes Work (default).
 */
export function realAgents(profiles: ProfileInfo[]): ProfileInfo[] {
  return profiles.filter(p => !isWorkProfile(p))
}
