/**
 * Dashboard plugin discovery — same feed the motor exposes at /api/dashboard/plugins.
 */
import type { HermesApiRequest } from '@/global'

export interface DashboardPluginManifest {
  name: string
  label: string
  description?: string
  icon?: string
  version?: string
  tab?: { path?: string; position?: string }
  entry?: string
  css?: string
  source?: string
}

async function pluginApi<T>(request: HermesApiRequest): Promise<T> {
  const api = window.hermesDesktop?.api
  if (!api) {
    throw new Error('API unavailable')
  }
  return api<T>(request)
}

export async function listDashboardPlugins(): Promise<DashboardPluginManifest[]> {
  try {
    const rows = await pluginApi<DashboardPluginManifest[]>({ method: 'GET', path: '/api/dashboard/plugins' })
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

export function pluginApiPath(name: string, suffix: string): string {
  const base = `/api/plugins/${encodeURIComponent(name)}`
  return suffix.startsWith('/') ? `${base}${suffix}` : `${base}/${suffix}`
}

export async function fetchPluginJson<T>(name: string, suffix: string): Promise<T | null> {
  try {
    return await pluginApi<T>({ method: 'GET', path: pluginApiPath(name, suffix) })
  } catch {
    return null
  }
}
