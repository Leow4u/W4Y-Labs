import { useQuery } from '@tanstack/react-query'

import { getHermesConfigRecord } from '@/hermes'
import { queryClient, writeCache } from '@/lib/query-client'
import type { HermesConfigRecord } from '@/types/hermes'

// One shared cache for the whole profile config record (`GET /api/config`).
// Every settings surface (MCP, model, config) reads and writes through this key
// so a save in one shows in the others, and revisiting a tab paints the cache
// instead of blanking on a fresh fetch.
//
// Distinct from session/hooks/use-hermes-config.ts, which is side-effecting —
// it pushes personality/cwd/voice/… into the session stores for live chat.
export const HERMES_CONFIG_KEY = ['hermes-config-record'] as const
export const HERMES_CONFIG_STALE_MS = 60_000

export function peekHermesConfig(): HermesConfigRecord | null {
  return queryClient.getQueryData<HermesConfigRecord>(HERMES_CONFIG_KEY) ?? null
}

// Serve warm cache immediately; background-revalidate after staleTime.
export const useHermesConfigRecord = () =>
  useQuery({
    queryKey: HERMES_CONFIG_KEY,
    queryFn: getHermesConfigRecord,
    staleTime: HERMES_CONFIG_STALE_MS
  })

export const setHermesConfigCache = writeCache<HermesConfigRecord>(HERMES_CONFIG_KEY)

export const invalidateHermesConfig = () => queryClient.invalidateQueries({ queryKey: HERMES_CONFIG_KEY })
