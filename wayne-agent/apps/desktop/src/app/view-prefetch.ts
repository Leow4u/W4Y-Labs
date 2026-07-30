/**
 * Warm the dynamic `import()` for a lazy route/overlay before the user commits
 * to opening it (hover / focus a nav item). Vite dedupes to the same chunk that
 * `React.lazy` resolves, so the module is already in cache by the time the click
 * lands — the first-open delay disappears.
 *
 * Each loader is fired at most once; a failure clears the guard so a later hover
 * can retry. Import paths MUST match the `lazy(() => import(...))` specifiers in
 * `desktop-controller.tsx` for the dedupe to work.
 */

import { getGlobalModelOptions, getHermesConfigRecord, getHermesConfigSchema } from '@/hermes'
import { queryClient } from '@/lib/query-client'

import { HERMES_CONFIG_KEY, HERMES_CONFIG_STALE_MS } from './hooks/use-config-record'
import { HERMES_CONFIG_SCHEMA_KEY, HERMES_CONFIG_SCHEMA_STALE_MS } from './hooks/use-config-schema'

const prefetched = new Set<string>()

function once(key: string, load: () => Promise<unknown>): void {
  if (prefetched.has(key)) {
    return
  }

  prefetched.add(key)
  void load().catch(() => prefetched.delete(key))
}

/** Warm config + schema (+ models catalog) so Settings tabs skip LoadingState. */
export function prefetchSettingsData(): void {
  void queryClient.prefetchQuery({
    queryKey: HERMES_CONFIG_KEY,
    queryFn: getHermesConfigRecord,
    staleTime: HERMES_CONFIG_STALE_MS
  })
  void queryClient.prefetchQuery({
    queryKey: HERMES_CONFIG_SCHEMA_KEY,
    queryFn: getHermesConfigSchema,
    staleTime: HERMES_CONFIG_SCHEMA_STALE_MS
  })
  void queryClient.prefetchQuery({
    queryKey: ['model-options', 'settings-models'],
    queryFn: () => getGlobalModelOptions(),
    staleTime: HERMES_CONFIG_STALE_MS
  })
}

export const prefetchAgents = () => once('agents', () => import('./agents'))
export const prefetchArtifacts = () => once('artifacts', () => import('./artifacts'))
export const prefetchCommandCenter = () => once('command-center', () => import('./command-center'))
export const prefetchCron = () => once('cron', () => import('./cron'))
export const prefetchMessaging = () => once('messaging', () => import('./messaging'))
export const prefetchProfiles = () => once('profiles', () => import('./profiles'))
export const prefetchSettings = () => {
  once('settings', () => import('./settings'))
  prefetchSettingsData()
}
export const prefetchSkills = () => once('skills', () => import('./skills'))
export const prefetchStarmap = () => once('starmap', () => import('./starmap'))

/** Prefetch by sidebar-nav id. Unknown / non-lazy ids (e.g. new-session, which
 *  renders the always-loaded chat view) are no-ops. */
export function prefetchNavView(id: string): void {
  switch (id) {
    case 'cron':
      prefetchCron()
      break
    case 'skills':
      prefetchSkills()
      break
    case 'messaging':
      prefetchMessaging()
      break
    case 'artifacts':
      prefetchArtifacts()
      break
    default:
      break
  }
}
