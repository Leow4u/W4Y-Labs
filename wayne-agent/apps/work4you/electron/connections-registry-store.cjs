'use strict'

const fs = require('node:fs')
const path = require('node:path')

const {
  connectionDialFieldsChanged,
  ensureWork4YouCloudConnection,
  mergeConnectionInput,
  migrateV1ToRegistry,
  normalizeConnectionInput,
  normalizeRegistry,
  removeConnection,
  setConnectionLaunchMode,
  setLastUsedConnection,
  setPrimaryConnection,
  upsertConnection,
  WORK4YOU_CLOUD_CONNECTION_ID
} = require('./connection-registry.cjs')

/**
 * File-backed v2 connection registry (connections.json).
 * Pure storage — routing lives in registry-backend.cjs.
 */
function createConnectionsRegistryStore(deps) {
  const {
    userDataPath,
    readV1Config,
    writeAtomic,
    decryptSecret,
    encryptSecret,
    safeStorageAvailable
  } = deps

  const registryPath = path.join(userDataPath, 'connections.json')
  let cache = null
  let cacheMtime = null

  function read() {
    let mtime = null

    try {
      mtime = fs.statSync(registryPath).mtimeMs
    } catch {
      mtime = null
    }

    if (cache && cacheMtime === mtime) {
      return cache
    }

    let registry

    if (mtime === null) {
      registry = migrateV1ToRegistry(readV1Config())

      try {
        write(registry)
      } catch {
        cache = registry
        cacheMtime = null
      }

      return cache || registry
    }

    try {
      registry = normalizeRegistry(JSON.parse(fs.readFileSync(registryPath, 'utf8')))
    } catch {
      registry = normalizeRegistry(null)
    }

    cache = registry
    cacheMtime = mtime

    return registry
  }

  function write(registry) {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true })
    writeAtomic(registryPath, JSON.stringify(registry, null, 2))
    cache = registry

    try {
      cacheMtime = fs.statSync(registryPath).mtimeMs
    } catch {
      cacheMtime = null
    }
  }

  function tokenPreview(token) {
    const value = String(token || '')

    if (!value) {
      return ''
    }

    if (value.length <= 8) {
      return '••••'
    }

    return `${value.slice(0, 4)}…${value.slice(-4)}`
  }

  function sanitizeConnection(entry) {
    const { token, headers, ...rest } = entry
    const decrypted = decryptSecret(token)

    return {
      ...rest,
      tokenSet: Boolean(decrypted),
      tokenPreview: tokenPreview(decrypted),
      headerNames: headers && typeof headers === 'object' ? Object.keys(headers) : []
    }
  }

  function sanitize(registry = read()) {
    return {
      version: registry.version,
      primary: registry.primary,
      launchMode: registry.launchMode,
      lastUsed: registry.lastUsed,
      secureTokenStorage: safeStorageAvailable(),
      connections: registry.connections.map(sanitizeConnection)
    }
  }

  function resolvePersistedToken({ incomingToken, existingToken, allowPlainText, persistToken }) {
    const trimmed = typeof incomingToken === 'string' ? incomingToken.trim() : ''

    if (!persistToken) {
      return existingToken
    }

    if (trimmed) {
      return encryptSecret(trimmed, { allowPlainText })
    }

    return existingToken
  }

  function saveConnection(input = {}) {
    const registry = read()
    const existing = input.id ? registry.connections.find(c => c.id === input.id) : null
    const incomingToken = typeof input.token === 'string' ? input.token.trim() : ''
    const token = resolvePersistedToken({
      incomingToken,
      existingToken: existing?.token,
      allowPlainText: input.allowPlainTextToken,
      persistToken: true
    })

    const merged = mergeConnectionInput({ ...input, token }, existing)
    const entry = normalizeConnectionInput(merged, registry)

    if (entry.kind === 'remote' && entry.authMode !== 'oauth' && !decryptSecret(entry.token)) {
      throw new Error('Remote gateway session token is required.')
    }

    write(upsertConnection(registry, entry))

    return sanitizeConnection(entry)
  }

  function remove(id) {
    const key = String(id || '')
    const registry = removeConnection(read(), key)
    write(registry)

    return sanitize(registry)
  }

  function setPrimary(id) {
    const registry = setPrimaryConnection(read(), String(id || ''))
    write(registry)

    return sanitize(registry)
  }

  function setLastUsed(id) {
    const registry = setLastUsedConnection(read(), String(id || ''))
    write(registry)

    return sanitize(registry)
  }

  function setLaunchMode(mode) {
    const registry = setConnectionLaunchMode(read(), String(mode || ''))
    write(registry)

    return sanitize(registry)
  }

  /** Packaged product: ensure Work4You cloud entry is primary. */
  function syncPackagedCloud(opts = {}) {
    const next = ensureWork4YouCloudConnection(read(), opts)
    write(next)

    return next
  }

  function dialFieldsChanged(before, after) {
    return connectionDialFieldsChanged(before, after)
  }

  function find(id) {
    return read().connections.find(c => c.id === String(id || '')) || null
  }

  function invalidateCache() {
    cache = null
    cacheMtime = null
  }

  return {
    WORK4YOU_CLOUD_CONNECTION_ID,
    dialFieldsChanged,
    find,
    invalidateCache,
    read,
    registryPath,
    remove,
    sanitize,
    saveConnection,
    setLastUsed,
    setLaunchMode,
    setPrimary,
    syncPackagedCloud,
    write
  }
}

module.exports = { createConnectionsRegistryStore }
