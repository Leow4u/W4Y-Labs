/**
 * Composite backend scope keys for the multi-connection registry — shared
 * shape with the Electron main process (backend pool keying) so both sides
 * derive identical keys.
 */

export const LOCAL_CONNECTION_ID = 'local'

export function backendScopeKey(connectionId: null | string | undefined, profile: null | string | undefined): string {
  const profileKey = String(profile ?? '').trim() || 'default'
  const connection = String(connectionId ?? '').trim()

  if (!connection || connection === LOCAL_CONNECTION_ID) {
    return profileKey
  }

  return `conn:${connection}::${profileKey}`
}

/** Scope a registry route without collapsing its explicit `local` source id. */
export function registryBackendScopeKey(
  connectionId: null | string | undefined,
  profile: null | string | undefined
): string {
  const profileKey = String(profile ?? '').trim() || 'default'
  const connection = String(connectionId ?? '').trim()

  return connection ? `conn:${connection}::${profileKey}` : profileKey
}

/** All pool keys owned by a connection share this prefix (teardown on remove). */
export function backendScopePrefix(connectionId: string): string {
  return `conn:${String(connectionId).trim()}::`
}
