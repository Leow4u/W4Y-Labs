import type { EnvVarInfo } from '@/types/hermes'

import { isKeyVar } from './credential-key-ui'
import { providerGroup, providerMeta, providerPriority } from './helpers'

export interface ProviderKeyGroup {
  advanced: [string, EnvVarInfo][]
  description?: string
  docsUrl?: string
  hasAnySet: boolean
  name: string
  primary: [string, EnvVarInfo]
  priority: number
}

/**
 * Platform-routed catalog keys stay invisible on the curated Models → API Keys
 * face (Work4You already provisions OpenRouter). BYOK = customer keys only.
 */
const HIDDEN_CATALOG_KEY_GROUPS = new Set(['Model catalog', 'Work4You account'])

export function buildProviderKeyGroups(vars: Record<string, EnvVarInfo>): ProviderKeyGroup[] {
  const buckets = new Map<string, [string, EnvVarInfo][]>()

  for (const [key, info] of Object.entries(vars)) {
    if (info.category !== 'provider' || info.platform_managed) {
      continue
    }

    const name = info.provider_label?.trim() || info.provider?.trim() || providerGroup(key)

    if (name === 'Other') {
      continue
    }

    buckets.set(name, [...(buckets.get(name) ?? []), [key, info]])
  }

  const groups: ProviderKeyGroup[] = []

  for (const [name, entries] of buckets) {
    const primary = entries.find(([k, i]) => !i.advanced && isKeyVar(k, i)) ?? entries.find(([k, i]) => isKeyVar(k, i))

    if (!primary) {
      continue
    }

    const meta = providerMeta(name)

    groups.push({
      advanced: entries
        .filter(([k, i]) => k !== primary[0] && (!isKeyVar(k, i) || i.is_set))
        .sort(([a], [b]) => a.localeCompare(b)),
      description: meta?.description ?? primary[1].description,
      docsUrl: meta?.docsUrl ?? primary[1].url ?? undefined,
      hasAnySet: entries.some(([, i]) => i.is_set),
      name,
      primary,
      priority: providerPriority(name)
    })
  }

  return groups.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
}

/** BYOK surface for Models settings — hides platform catalog keys. */
export function buildByokProviderKeyGroups(vars: Record<string, EnvVarInfo>): ProviderKeyGroup[] {
  return buildProviderKeyGroups(vars).filter(group => !HIDDEN_CATALOG_KEY_GROUPS.has(group.name))
}
