/**
 * Featured BR marketplace layer for Conectores (port of web connector-curation).
 */
import type { ConnectorAccount, ConnectorToolkit } from './connectors-types'

export const FEATURED_CONNECTOR_SLUGS = [
  'gmail',
  'googlecalendar',
  'google_calendar',
  'googledrive',
  'google_drive',
  'googlesheets',
  'google_sheets',
  'outlook',
  'microsoft_outlook',
  'notion',
  'slack',
  'discord',
  'telegram',
  'microsoft_teams',
  'teams',
  'hubspot',
  'salesforce',
  'pipedrive',
  'rdstation',
  'rd_station',
  'stripe',
  'mercadopago',
  'mercado_pago',
  'instagram',
  'linkedin',
  'meta_ads',
  'facebook'
] as const

export const FEATURED_DEV_CONNECTOR_SLUGS = ['github', 'jira', 'linear'] as const

export function normalizeConnectorKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function indexToolkits(toolkits: ConnectorToolkit[]): Map<string, ConnectorToolkit> {
  const m = new Map<string, ConnectorToolkit>()
  for (const tk of toolkits) {
    m.set(normalizeConnectorKey(tk.slug), tk)
    m.set(normalizeConnectorKey(tk.name), tk)
  }
  return m
}

function pickBySlugs(toolkits: ConnectorToolkit[], slugs: readonly string[]): ConnectorToolkit[] {
  const byKey = indexToolkits(toolkits)
  const out: ConnectorToolkit[] = []
  const seen = new Set<string>()
  for (const raw of slugs) {
    const tk = byKey.get(normalizeConnectorKey(raw))
    if (!tk || seen.has(tk.slug)) continue
    seen.add(tk.slug)
    out.push(tk)
  }
  return out
}

export function resolveFeaturedConnectors(toolkits: ConnectorToolkit[]): ConnectorToolkit[] {
  return pickBySlugs(toolkits, FEATURED_CONNECTOR_SLUGS)
}

export function resolveFeaturedDevConnectors(toolkits: ConnectorToolkit[]): ConnectorToolkit[] {
  return pickBySlugs(toolkits, FEATURED_DEV_CONNECTOR_SLUGS)
}

export function stateOf(
  accounts: ConnectorAccount[]
): 'connected' | 'pending' | 'broken' | 'none' {
  if (accounts.some(a => a.status === 'ACTIVE')) return 'connected'
  if (accounts.some(a => a.status === 'INITIATED' || a.status === 'INITIALIZING')) return 'pending'
  if (accounts.length > 0) return 'broken'
  return 'none'
}

export function pickConnected(
  toolkits: ConnectorToolkit[],
  byToolkit: Map<string, ConnectorAccount[]>
): ConnectorToolkit[] {
  return toolkits.filter(tk => stateOf(byToolkit.get(tk.slug.toLowerCase()) || []) === 'connected')
}

export function pickConnectedExtra(
  toolkits: ConnectorToolkit[],
  featured: ConnectorToolkit[],
  byToolkit: Map<string, ConnectorAccount[]>
): ConnectorToolkit[] {
  const featuredSlugs = new Set(featured.map(t => t.slug.toLowerCase()))
  return pickConnected(toolkits, byToolkit).filter(tk => !featuredSlugs.has(tk.slug.toLowerCase()))
}

/** Group catalog toolkits by first category for marketplace sections. */
export function groupConnectorsByCategory(
  toolkits: ConnectorToolkit[]
): { category: string; items: ConnectorToolkit[] }[] {
  const buckets = new Map<string, ConnectorToolkit[]>()
  for (const tk of toolkits) {
    const cat = (tk.categories && tk.categories[0]) || 'General'
    if (!buckets.has(cat)) buckets.set(cat, [])
    buckets.get(cat)!.push(tk)
  }
  return [...buckets.entries()]
    .map(([category, items]) => ({
      category,
      items: items.slice().sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.category.localeCompare(b.category))
}

export function filterConnectors(
  toolkits: ConnectorToolkit[],
  search: string,
  activeCat: string | null
): ConnectorToolkit[] {
  const lower = search.trim().toLowerCase()
  return toolkits.filter(tk => {
    if (activeCat && !(tk.categories || []).includes(activeCat)) return false
    if (!lower) return true
    return (
      tk.name.toLowerCase().includes(lower) ||
      tk.slug.toLowerCase().includes(lower) ||
      (tk.description || '').toLowerCase().includes(lower) ||
      (tk.categories || []).some(c => c.toLowerCase().includes(lower))
    )
  })
}
