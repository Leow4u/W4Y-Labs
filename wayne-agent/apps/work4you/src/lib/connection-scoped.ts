import { atom, type WritableAtom } from 'nanostores'

import { type Codec, Codecs } from './persisted'
import { readKey, writeKey } from './storage'

/** Minimal slice of HermesConnection this module keys on. */
export interface ConnectionScopeDescriptor {
  baseUrl?: string
  mode?: 'local' | 'remote'
  profile?: null | string
}

/** The storage-key suffix for a connection. Local (and unknown) connections
 *  map to the bare key; remote connections get their own namespace. */
export function connectionScopeSuffix(connection: ConnectionScopeDescriptor | null | undefined): string {
  if (connection?.mode !== 'remote') {
    return ''
  }

  const base = encodeURIComponent(connection.baseUrl || 'remote')
  const profile = encodeURIComponent(connection.profile || 'default')

  return `.remote.${base}.${profile}`
}

interface ScopedEntry<T> {
  $value: WritableAtom<T>
  codec: Codec<T>
  fallback: T
  key: string
  applying: boolean
}

let activeSuffix = ''

const registry: ScopedEntry<any>[] = []
const scopeListeners = new Set<() => void>()

/** The suffix for the connection the window is currently on. */
export function activeConnectionScopeSuffix(): string {
  return activeSuffix
}

/** Observe scope changes (fires BEFORE the scoped atoms repaint). */
export function onConnectionScopeChange(listener: () => void): () => void {
  scopeListeners.add(listener)

  return () => void scopeListeners.delete(listener)
}

function loadEntry<T>(entry: ScopedEntry<T>): T {
  const raw = readKey(entry.key + activeSuffix)

  if (raw === null) {
    return entry.fallback
  }

  try {
    return entry.codec.decode(raw)
  } catch {
    return entry.fallback
  }
}

/**
 * A `persistentAtom` whose storage key carries the active connection scope.
 */
export function connectionScopedAtom<T>(key: string, fallback: T, codec: Codec<T> = Codecs.json<T>()): WritableAtom<T> {
  const entry: ScopedEntry<T> = { $value: atom<T>(fallback), applying: false, codec, fallback, key }
  entry.$value.set(loadEntry(entry))
  registry.push(entry)

  let creationEmission = true

  entry.$value.subscribe(value => {
    if (creationEmission) {
      creationEmission = false

      return
    }

    if (entry.applying) {
      return
    }

    writeKey(entry.key + activeSuffix, entry.codec.encode(value))
  })

  return entry.$value
}

/** Point every connection-scoped atom at `connection`'s storage scope. */
export function rescopeConnectionScopedStores(connection: ConnectionScopeDescriptor | null | undefined): void {
  if (!connection) {
    return
  }

  const next = connectionScopeSuffix(connection)

  if (next === activeSuffix) {
    return
  }

  activeSuffix = next

  for (const listener of scopeListeners) {
    listener()
  }

  for (const entry of registry) {
    entry.applying = true

    try {
      entry.$value.set(loadEntry(entry))
    } finally {
      entry.applying = false
    }
  }
}
