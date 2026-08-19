'use strict'

const {
  WORK4YOU_CLOUD_CONNECTION_ID,
  backendScopeKey,
  backendScopePrefix,
  resolveRegistryLocalRoute
} = require('./connection-registry.cjs')

/**
 * Resolve a backend for (connectionId, profile) against the v2 registry.
 * Work4You packaged: work4you-cloud → Fly brain (no local Python).
 */
function createRegistryBackend(deps) {
  const {
    readRegistry,
    buildFlyBrainConnection,
    buildRemoteConnection,
    decryptSecret,
    ensureBackend,
    getWindowState,
    hermesLog,
    localEngineDisabled,
    normAuthMode,
    globalRemoteActive,
    profileHasRemoteOverride,
    backendPool,
    POOL_MAX_BACKENDS,
    spawnPoolBackend,
    evictLruPoolBackends,
    startPoolIdleReaper,
    stopPoolBackend,
    waitForBackendExit,
    stopBackendChild
  } = deps

  function isWork4YouCloudEntry(source) {
    return source && (source.id === WORK4YOU_CLOUD_CONNECTION_ID || source.kind === 'cloud')
  }

  async function ensureRegistryBackend(connectionId, profile) {
    const registry = readRegistry()
    const id = String(connectionId || '').trim() || registry.primary
    const source = registry.connections.find(c => c.id === id)

    if (!source) {
      throw new Error(`No connection with id "${id}".`)
    }

    const profileKey = String(profile ?? '').trim() || 'default'

    if (isWork4YouCloudEntry(source) && localEngineDisabled()) {
      return {
        ...buildFlyBrainConnection({
          logs: hermesLog.slice(-80),
          windowState: getWindowState()
        }),
        profile: profileKey,
        connectionId: id,
        registryScoped: true,
        sharedRemote: true
      }
    }

    if (source.kind === 'local') {
      const localRoute = resolveRegistryLocalRoute(profileKey, {
        globalRemote: globalRemoteActive(),
        profileRemoteOverride: profileHasRemoteOverride(profileKey)
      })

      if (localEngineDisabled()) {
        return ensureRegistryBackend(WORK4YOU_CLOUD_CONNECTION_ID, profileKey)
      }

      if (localRoute.delegate) {
        const connection = await ensureBackend(profileKey)

        return { ...connection, connectionId: id, registryScoped: true }
      }

      const existingLocal = backendPool.get(localRoute.poolKey)

      if (existingLocal) {
        existingLocal.lastActiveAt = Date.now()

        return existingLocal.connectionPromise
      }

      evictLruPoolBackends(POOL_MAX_BACKENDS - 1)

      const localEntry = {
        process: null,
        port: null,
        token: null,
        connectionPromise: null,
        lastActiveAt: Date.now(),
        remoteBaseUrl: null
      }

      localEntry.connectionPromise = spawnPoolBackend(profileKey, localEntry, {
        forceLocal: true,
        poolKey: localRoute.poolKey
      }).catch(async error => {
        if (backendPool.get(localRoute.poolKey) === localEntry) {
          backendPool.delete(localRoute.poolKey)
        }

        stopBackendChild(localEntry.process)
        await waitForBackendExit(localEntry.process)
        throw error
      })
      backendPool.set(localRoute.poolKey, localEntry)
      startPoolIdleReaper()

      const connection = await localEntry.connectionPromise

      return { ...connection, connectionId: id, registryScoped: true }
    }

    const key = backendScopeKey(id, profileKey)
    const existing = backendPool.get(key)

    if (existing) {
      existing.lastActiveAt = Date.now()

      return existing.connectionPromise
    }

    evictLruPoolBackends(POOL_MAX_BACKENDS - 1)

    const entry = {
      process: null,
      port: null,
      token: null,
      connectionPromise: null,
      lastActiveAt: Date.now(),
      remoteBaseUrl: null
    }

    entry.connectionPromise = connectRegistryRemote(source, profileKey, key, entry).catch(error => {
      if (backendPool.get(key) === entry) {
        backendPool.delete(key)
      }

      throw error
    })
    backendPool.set(key, entry)
    startPoolIdleReaper()

    return entry.connectionPromise
  }

  async function connectRegistryRemote(source, profileKey, poolKey, poolEntry) {
    if (isWork4YouCloudEntry(source)) {
      const connection = {
        ...buildFlyBrainConnection({
          logs: hermesLog.slice(-80),
          windowState: getWindowState()
        }),
        profile: profileKey,
        connectionId: source.id,
        registryScoped: true,
        sharedRemote: true
      }

      return connection
    }

    const authMode = normAuthMode(source.authMode)
    const token = authMode === 'oauth' ? null : decryptSecret(source.token)
    const connection = await buildRemoteConnection(
      source.url,
      authMode,
      token,
      `registry:${source.id}`,
      undefined,
      source.kind === 'cloud' ? 'cloud' : 'url',
      undefined,
      source.headers
    )

    poolEntry.remoteBaseUrl = connection.baseUrl

    return {
      ...connection,
      profile: profileKey,
      connectionId: source.id,
      registryScoped: true,
      sharedRemote: true,
      logs: hermesLog.slice(-80),
      ...getWindowState()
    }
  }

  async function stopRegistryConnectionBackends(connectionId) {
    const prefix = backendScopePrefix(connectionId)

    for (const [key] of [...backendPool.entries()]) {
      if (String(key).startsWith(prefix)) {
        stopPoolBackend(key)
      }
    }
  }

  return {
    ensureRegistryBackend,
    stopRegistryConnectionBackends
  }
}

module.exports = { createRegistryBackend }
