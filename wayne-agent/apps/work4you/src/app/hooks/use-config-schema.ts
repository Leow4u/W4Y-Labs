import { useQuery } from '@tanstack/react-query'

import { getHermesConfigSchema } from '@/hermes'
import { queryClient } from '@/lib/query-client'
import type { ConfigFieldSchema, ConfigSchemaResponse } from '@/types/hermes'

// Shared with every settings surface that renders schema-driven fields so one
// warm cache paints Voice / Memory / Advanced / … without a loading flash.
export const HERMES_CONFIG_SCHEMA_KEY = ['hermes-config-schema'] as const
export const HERMES_CONFIG_SCHEMA_STALE_MS = 5 * 60 * 1000

export function peekHermesConfigSchema(): ConfigSchemaResponse | undefined {
  return queryClient.getQueryData<ConfigSchemaResponse>(HERMES_CONFIG_SCHEMA_KEY)
}

export function peekHermesConfigSchemaFields(): Record<string, ConfigFieldSchema> | null {
  return peekHermesConfigSchema()?.fields ?? null
}

export const useHermesConfigSchema = () =>
  useQuery({
    queryKey: HERMES_CONFIG_SCHEMA_KEY,
    queryFn: getHermesConfigSchema,
    staleTime: HERMES_CONFIG_SCHEMA_STALE_MS
  })
