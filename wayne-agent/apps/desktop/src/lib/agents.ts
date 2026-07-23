import type { ProfileInfo } from '@/types/hermes'

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
 * Agents the owner manages in Studio — excludes the installation "default"
 * profile (the Work / day-to-day agent home). Same curation as web Equipe.
 */
export function realAgents(profiles: ProfileInfo[]): ProfileInfo[] {
  return profiles.filter(p => !p.is_default && p.name !== 'default')
}
