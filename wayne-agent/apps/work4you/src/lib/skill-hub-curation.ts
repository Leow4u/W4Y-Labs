/**
 * Browse Hub curation — Work4You product face.
 *
 * Landing uses GET /api/skills/hub/catalog (FEATURED_OPTIONAL_SKILL_IDS on the
 * engine), not the raw wayne-index dump. Search may still hit remote hubs, but
 * formula kit skills (provenance=bundled) are never install targets.
 */
import type { SkillHubResult, SkillInfo } from '@/types/hermes'

export function bundledSkillNames(skills: SkillInfo[]): Set<string> {
  const names = new Set<string>()
  for (const skill of skills) {
    if (skill.provenance === 'bundled' && skill.name) {
      names.add(skill.name.toLowerCase())
    }
  }
  return names
}

/** True when this hub hit is already part of the shipped formula kit. */
export function isFormulaHubSkill(skill: SkillHubResult, bundled: Set<string>): boolean {
  return bundled.has((skill.name || '').toLowerCase())
}

/** Drop kit builtins from remote search; keep optional/official + community. */
export function curateHubSearchResults(
  results: SkillHubResult[],
  bundled: Set<string>
): SkillHubResult[] {
  return results.filter(skill => !isFormulaHubSkill(skill, bundled))
}

/** Client filter over the curated catalog (landing + local search assist). */
export function filterCatalogSkills(skills: SkillHubResult[], query: string): SkillHubResult[] {
  const term = query.trim().toLowerCase()
  if (!term) return skills
  return skills.filter(skill => {
    const hay = `${skill.name} ${skill.description} ${(skill.tags || []).join(' ')}`.toLowerCase()
    return hay.includes(term)
  })
}

/**
 * Merge catalog matches ahead of remote hits (dedupe by identifier, then name).
 * Catalog wins so featured optional skills stay on top when both match.
 */
export function mergeHubListings(
  catalogMatches: SkillHubResult[],
  remoteResults: SkillHubResult[]
): SkillHubResult[] {
  const seen = new Set<string>()
  const out: SkillHubResult[] = []

  for (const skill of [...catalogMatches, ...remoteResults]) {
    const key = (skill.identifier || skill.name || '').toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(skill)
  }

  return out
}
