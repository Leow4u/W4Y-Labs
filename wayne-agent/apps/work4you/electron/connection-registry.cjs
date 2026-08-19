'use strict'

/**
 * connection-registry.cjs
 *
 * Pure, electron-free helpers for the desktop multi-connection registry.
 * Ported from upstream connection-registry.ts (Hermes desktop).
 */

const {
  hostLabelFromBaseUrl,
  modeIsRemoteLike,
  normalizeRemoteBaseUrl,
  normalizeRemoteHeaders,
  normalizeSshConfig,
  normAuthMode
} = require('./connection-config.cjs')

/**
 * connection-registry.ts
 *
 * Pure, electron-free helpers for the desktop's multi-connection registry —
 * the v2 successor to the single global `mode` + `remote` block in
 * connection.json. The registry is a named list of agent SOURCES (local
 * runtime, remote gateways, Work4You instances, SSH hosts) that are all
 * registered at once; routing/pooling changes that consume the registry land
 * separately, so this module is deliberately storage-shaped, not
 * transport-shaped.
 *
 * Design rules (agreed with Teknium, Aug 2026):
 *  - Every connection carries a REQUIRED, registry-unique `label` (the
 *    "device name"). Uniqueness is case-insensitive so `Homelab` and
 *    `homelab` can't coexist and produce two identical badges.
 *  - When two sources expose the same profile name, surfaces disambiguate as
 *    `@<profile>-<label-slug>` — `agentHandle()` is the one place that rule
 *    lives.
 *  - The registry ALWAYS contains exactly one `local` connection (the app's
 *    own runtime). It cannot be removed; it is the default primary.
 *  - `primary` designates the connection that owns the window backend (boot
 *    overlay, install/update machinery). Removing the primary retargets to
 *    the local entry rather than leaving a dangling id.
 *
 * Kept standalone (no `import 'electron'`) so it unit-tests with `node --test`
 * — same pattern as connection-config.ts / backend-probes.ts. main.ts wires
 * these into the IPC layer and owns file I/O + secret encryption.
 */

const REGISTRY_VERSION = 2

const LOCAL_CONNECTION_ID = 'local'

/** Connection kinds. 'cloud' is remote-shaped (see modeIsRemoteLike) but keeps
 * its provenance so the UI can render the right card and updates can skip
 * platform-managed instances. */
// ── Labels and ids ──────────────────────────────────────────────────────────

const LABEL_MAX = 64

/** Canonical comparison key for label uniqueness. */
function labelKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
}

/**
 * Derive a registry-unique label from a candidate: clamps to LABEL_MAX (a
 * migrated URL host can exceed it, which would fail validation on any later
 * edit) and suffixes " 2" / " 3" / … on collision. The single home of the
 * label-dedup rule — normalizeRegistry and the migration both use it.
 */
function uniqueLabel(candidate, taken) {
  const used = new Set([...taken].map(labelKey))

  // Reserve room for a collision suffix so the suffixed form stays in-bounds.
  const base = String(candidate || '')
    .trim()
    .slice(0, LABEL_MAX - 4)

  if (!used.has(labelKey(base))) {
    return base
  }

  for (let n = 2; ; n += 1) {
    const suffixed = `${base} ${n}`

    if (!used.has(labelKey(suffixed))) {
      return suffixed
    }
  }
}

/** Kebab-slug of a label for ids and @handles. Never empty for a non-empty label. */
function labelSlug(label) {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return slug || 'connection'
}

/**
 * The one place the duplicate-agent naming rule lives: a profile that exists
 * on several registered sources renders as `@<profile>-<label-slug>`;
 * a profile unique across the roster keeps its bare name.
 */
function agentHandle(profile, connectionLabel, duplicated) {
  const name = String(profile || '').trim() || 'default'

  return duplicated ? `${name}-${labelSlug(connectionLabel)}` : name
}

/**
 * Pool key for a backend serving (connection, profile). The local/primary
 * connection keeps the BARE profile key so every legacy pool entry, reaper
 * log line, and touch call stays byte-identical for single-source users;
 * non-local connections get an unambiguous composite (`conn:<id>::<profile>`)
 * that cannot collide with a plain profile name (colons are invalid in
 * profile names).
 *
 * NOTE: the renderer's socket registry uses the twin implementation in
 * apps/shared/src/backend-scope.ts (`@hermes/shared`) — tsconfig project
 * boundaries prevent a single physical module here. The two are pinned
 * byte-identical by the cross-copy contract test in
 * connection-registry.test.ts; change BOTH or that test fails.
 */
function backendScopeKey(connectionId, profile) {
  const profileKey = String(profile ?? '').trim() || 'default'
  const connection = String(connectionId ?? '').trim()

  if (!connection || connection === LOCAL_CONNECTION_ID) {
    return profileKey
  }

  return `conn:${connection}::${profileKey}`
}

/** All pool keys owned by a connection share this prefix (used to stop them on remove). */
function backendScopePrefix(connectionId) {
  return `conn:${String(connectionId).trim()}::`
}

/**
 * Recover registry identity for a descriptor resolved through the legacy v1
 * profile path. Registry-scoped routes already carry `connectionId`; this
 * bridge keeps migrated per-profile remotes truthful until v1 is retired.
 */
function resolvedConnectionId(
  registry,
  descriptor) {
  if (descriptor.mode === 'local') {
    return registry.connections.find(connection => connection.kind === 'local')?.id ?? null
  }

  if (descriptor.mode !== 'remote') {
    return null
  }

  if (descriptor.remoteKind === 'ssh') {
    const remoteHost = String(descriptor.remoteHost || '')
      .trim()
      .toLowerCase()

    if (!remoteHost) {
      return null
    }

    return (
      registry.connections.find(connection => {
        if (connection.kind !== 'ssh') {
          return false
        }

        const host = String(connection.host || '')
          .trim()
          .toLowerCase()

        const target = connection.user ? `${String(connection.user).trim().toLowerCase()}@${host}` : host

        return target === remoteHost
      })?.id ?? null
    )
  }

  let baseUrl = ''

  try {
    baseUrl = normalizeRemoteBaseUrl(descriptor.baseUrl)
  } catch {
    return null
  }

  return (
    registry.connections.find(connection => {
      if (connection.kind !== 'cloud' && connection.kind !== 'remote') {
        return false
      }

      try {
        return normalizeRemoteBaseUrl(connection.url) === baseUrl
      } catch {
        return false
      }
    })?.id ?? null
  )
}

/**
 * How the registry's 'local' entry resolves a backend for `profile`.
 *
 * The 'local' entry means THIS machine's runtime — always. The legacy
 * ensureBackend() path instead follows the v1 connection.json routing table,
 * where a global remote mode (or a per-profile remote override) resolves to a
 * REMOTE descriptor. A migrated user whose v1 global mode was remote gets that
 * remote as the registry primary AND keeps the mandatory 'local' entry, so
 * delegating 'local' to the v1 route made the roster's "This device" rows
 * enumerate and dial the remote box: every profile appeared twice (forcing
 * -slug handles) and "local" agents talked to the remote.
 *
 * When the v1 route is already local we delegate (legacy path, byte-identical
 * pool keys). When v1 says remote, the local entry spawns its own genuinely
 * local child under a composite pool key: backendScopeKey('local', p) maps to
 * the BARE profile key by design, and that slot may already hold the v1
 * route's REMOTE descriptor — so the forced-local child pools under the
 * `conn:local::<profile>` form instead (colons are invalid in profile names,
 * so it cannot collide).
 */
function resolveRegistryLocalRoute(
  profile,
  opts = {}
) {
  const profileKey = String(profile ?? '').trim() || 'default'

  if (opts.globalRemote || opts.profileRemoteOverride) {
    return { delegate: false, poolKey: `${backendScopePrefix(LOCAL_CONNECTION_ID)}${profileKey}` }
  }

  return { delegate: true, poolKey: profileKey }
}

/**
 * Whether the roster enumeration should SKIP the registry's local entry as
 * connect-on-demand. True when the local source is the forced-local route
 * (primary resolves remote — enumerating would spawn a local backend the
 * user never asked for, minting a phantom `default` agent and forcing
 * -device handles onto the real one) AND no forced-local child is already
 * pooled. Pure — main.ts feeds it the live route + pool keys.
 */
function shouldDeferLocalEnumeration(
  route,
  poolKeys,
  connectionId = LOCAL_CONNECTION_ID
) {
  if (route.delegate) {
    return false
  }

  const prefix = backendScopePrefix(connectionId)

  return ![...poolKeys].some(key => String(key).startsWith(prefix))
}

// ── Union agent roster ──────────────────────────────────────────────────────

/**
 * SSH roster enumeration skips undialed sources (connect-on-demand). Reuse the
 * last successful profile list so Bot Mode does not go empty the moment the
 * window switches back to local. Never-seen SSH sources still get a `default`
 * seed so the device is clickable.
 */
function rememberSshEnumeration(
  enumeration,
  cached,
  kind
) {
  if (enumeration.profiles && enumeration.profiles.length > 0) {
    return enumeration
  }

  if (kind !== 'ssh') {
    return enumeration
  }

  if (cached && cached.length > 0) {
    return { profiles: cached, error: enumeration.error }
  }

  if (enumeration.error === 'connect-on-demand') {
    return { profiles: ['default'], error: 'connect-on-demand' }
  }

  return enumeration
}

/** Whether an undialed SSH source should be inventoried again. Cached
 *  successes never retry. Failures retry after `retryAfterMs` so a cold box
 *  does not stay seeded as `default` until the user hits Test. */
function shouldRetrySshInventory(
  hasCache,
  lastAttemptMs,
  nowMs,
  retryAfterMs = 60_000
) {
  if (hasCache) {
    return false
  }

  if (lastAttemptMs == null) {
    return true
  }

  return nowMs - lastAttemptMs >= retryAfterMs
}

const PROFILE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

/** Turn `ls ~/.hermes/profiles` output into roster names. Always includes
 *  `default`. Drops rollback snapshots and junk lines. */
function parseRemoteProfileListing(text) {
  const names = new Set(['default'])

  for (const raw of String(text || '').split(/\r?\n/)) {
    const name = raw.trim()

    if (!name || name.startsWith('.') || name.endsWith('.rollback-old')) {
      continue
    }

    if (!PROFILE_NAME_RE.test(name)) {
      continue
    }

    names.add(name)
  }

  return ['default', ...[...names].filter(name => name !== 'default').sort()]
}

/**
 * Flatten per-connection profile enumerations into the union roster, applying
 * the duplicate-handle rule ONCE across all sources. Pure so the disambiguation
 * policy is testable without IPC; main.ts feeds it live enumerations.
 */
function buildAgentRoster(
  enumerations, opts = {}) {
  // A connection can transiently report the same profile more than once (or
  // arrive twice while registry state is reconciling). A roster row represents
  // one routable identity, so collapse strictly by connection + profile before
  // counting names for @name-device disambiguation.
  const identities = new Map()

  let order = 0

  for (const { connection, installId, profiles } of enumerations) {
    for (const profile of profiles || []) {
      const name = String(profile || '').trim() || 'default'
      const key = `${connection.id}\0${name}`

      if (!identities.has(key)) {
        identities.set(key, { connection, installId, order, profile: name })
      }
    }

    order += 1
  }

  // Backend-identity collapse: two connections reporting the same install_id
  // are the SAME physical install registered under two addresses, so their
  // (install, profile) rows are one bot, not two. Connections without an id
  // (older backends, undialed ssh) keep a per-connection key — no collapse.
  const backends = new Map()

  for (const { connection, installId, order: rank, profile } of identities.values()) {
    const key = installId ? `id:${installId}\0${profile}` : `conn:${connection.id}\0${profile}`
    const group = backends.get(key)

    if (group) {
      group.push({ connection, order: rank, profile })
    } else {
      backends.set(key, [{ connection, order: rank, profile }])
    }
  }

  const rows = [...backends.values()].map(group => pickCanonicalConnection(group, opts.primaryConnectionId))

  // The @name-device duplicate-handle rule runs AFTER the collapse, so a
  // profile that only *looked* duplicated (one box, two addresses) keeps its
  // bare name once the rows are recognized as one backend.
  const counts = new Map()

  for (const { profile } of rows) {
    counts.set(profile, (counts.get(profile) || 0) + 1)
  }

  const roster = []

  for (const { connection, profile } of rows) {
    roster.push({
      connectionId: connection.id,
      connectionKind: connection.kind,
      connectionLabel: connection.label,
      profile,
      handle: agentHandle(profile, connection.label, (counts.get(profile) || 0) > 1)
    })
  }

  return roster
}

/** Deterministic route priority for same-backend rows: local is definitionally
 * this box; ssh beats HTTP remotes; cloud last. */
const CANONICAL_KIND_PRIORITY = { cloud: 3, local: 0, remote: 2, ssh: 1 }

/**
 * Which connection represents a collapsed same-backend roster row: the ACTIVE
 * (primary) connection when it is one of the candidates — the row should route
 * where the window already routes — else the highest kind priority, else the
 * earliest-registered (enumeration order follows registry order).
 */
function pickCanonicalConnection(candidates, primaryConnectionId) {
  const active = primaryConnectionId ? candidates.find(c => c.connection.id === primaryConnectionId) : undefined

  if (active) {
    return active
  }

  return [...candidates].sort(
    (a, b) =>
      CANONICAL_KIND_PRIORITY[a.connection.kind] - CANONICAL_KIND_PRIORITY[b.connection.kind] || a.order - b.order
  )[0]
}

// ── Fan-out update eligibility ──────────────────────────────────────────────

/**
 * Whether "Update all instances" may drive this connection. Work4You
 * instances are platform-managed — we never run `hermes update` against them.
 * Local, remote, and ssh sources are all eligible (reachability and busy
 * checks happen at dispatch time, not here).
 */
function updateEligibility(connection) {
  if (connection.kind === 'cloud') {
    return { eligible: false, reason: 'cloud-managed' }
  }

  return { eligible: true }
}

/** Mint a registry-unique id from a label (slug, then -2/-3… suffixes). */
function connectionIdForLabel(label, taken) {
  const used = new Set([...taken])
  const base = labelSlug(label)

  if (!used.has(base) && base !== LOCAL_CONNECTION_ID) {
    return base
  }

  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`

    if (!used.has(candidate) && candidate !== LOCAL_CONNECTION_ID) {
      return candidate
    }
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate + normalize a save payload into a RegistryConnection.
 * Throws with a user-facing message on any violation. `registry` supplies the
 * uniqueness context; when `input.id` matches an existing entry this is an
 * edit and that entry is excluded from the label-collision check.
 */
function normalizeConnectionInput(input, registry) {
  const label = String(input.label || '').trim()

  if (!label) {
    throw new Error('Every connection needs a name. Give this instance a device name (e.g. "Homelab", "Work laptop").')
  }

  if (label.length > LABEL_MAX) {
    throw new Error(`Connection name is too long (max ${LABEL_MAX} characters).`)
  }

  const key = labelKey(label)
  const collision = registry.connections.find(c => labelKey(c.label) === key && c.id !== input.id)

  if (collision) {
    throw new Error(`A connection named "${collision.label}" already exists. Connection names must be unique.`)
  }

  const kind = input.kind

  if (kind === 'local') {
    // The local entry is managed by the app; only its label is editable.
    return { id: LOCAL_CONNECTION_ID, kind: 'local', label }
  }

  // The reserved local id can never be claimed by a non-local entry — a
  // crafted IPC payload ({id:'local', kind:'remote', …}) would otherwise
  // replace the local entry via upsert and break the exactly-one-local
  // invariant. connectionIdForLabel never mints 'local'; reject it when
  // supplied, too.
  if (input.id === LOCAL_CONNECTION_ID) {
    throw new Error('The id "local" is reserved for the local connection.')
  }

  const id =
    input.id ||
    connectionIdForLabel(
      label,
      registry.connections.map(c => c.id)
    )

  if (kind === 'ssh') {
    const ssh = normalizeSshConfig({
      mode: 'ssh',
      host: input.host,
      user: input.user,
      port: input.port,
      keyPath: input.keyPath,
      remoteHermesPath: input.remoteHermesPath,
      remoteProfile: input.remoteProfile
    })

    if (!ssh) {
      throw new Error('SSH connections need a host.')
    }

    const { mode: _mode, ...sshFields } = ssh

    // Duplicate prevention (enforced here so a crafted IPC payload can't slip
    // past the editor's check): two ssh entries collide on the same
    // user@host:port + remote profile.
    const sshKey = c =>
      `${(c.user || '').toLowerCase()}@${(c.host || '').toLowerCase()}:${c.port ?? 22}::${(c.remoteProfile || '').trim()}`

    const sshDupe = registry.connections.find(c => c.kind === 'ssh' && c.id !== id && sshKey(c) === sshKey(sshFields))

    if (sshDupe) {
      throw new Error(`A connection to this SSH host already exists ("${sshDupe.label}").`)
    }

    return { id, kind: 'ssh', label, ...sshFields }
  }

  if (kind === 'remote' || kind === 'cloud') {
    // normalizeRemoteBaseUrl throws its own user-facing message on bad input.
    const url = normalizeRemoteBaseUrl(input.url)

    // Duplicate prevention: remote/cloud entries collide on the normalized URL
    // (trimmed, trailing slashes stripped, lowercased) regardless of kind — a
    // cloud entry and a remote entry pointing at the same gateway are dupes.
    const urlKey = (value) => value.trim().replace(/\/+$/, '').toLowerCase()

    const urlDupe = registry.connections.find(
      c => (c.kind === 'remote' || c.kind === 'cloud') && c.id !== id && urlKey(c.url || '') === urlKey(url)
    )

    if (urlDupe) {
      throw new Error(`A connection to this gateway URL already exists ("${urlDupe.label}").`)
    }

    const authMode = normAuthMode(input.authMode)
    const entry = { id, kind, label, url, authMode }

    // A token is only meaningful for token-auth remotes. Dropping it here is
    // what clears the stale envelope when an entry is switched token→oauth
    // (or is a cloud entry, which authenticates via the portal session) —
    // otherwise dead secret material rides along on the edited entry.
    if (input.token !== undefined && kind === 'remote' && authMode === 'token') {
      entry.token = input.token
    }

    // Extra gateway headers (access-proxy credentials) apply to any
    // remote-shaped entry regardless of auth mode — Cloudflare Access sits in
    // front of both token- and OAuth-gated gateways. Normalization drops
    // transport-/Hermes-managed names; an empty result stores nothing.
    if (input.headers !== undefined) {
      const headers = normalizeRemoteHeaders(input.headers)

      if (Object.keys(headers).length > 0) {
        entry.headers = headers
      }
    }

    const org = String(input.org || '').trim()

    if (kind === 'cloud' && org) {
      entry.org = org
    }

    return entry
  }

  throw new Error(`Unknown connection kind: ${String(kind)}`)
}

/**
 * Merge a (possibly partial) edit payload over the stored entry so fields the
 * editor doesn't carry survive a save. Renaming a migrated cloud entry must
 * not drop its `org` (downstream update-fanout uses it to skip
 * platform-managed instances), and renaming an ssh entry must not drop
 * `remoteHermesPath`/`remoteProfile`. Only fields the payload explicitly
 * carries (non-undefined) override; `token` is deliberately NOT merged here —
 * the caller owns secret handling.
 */
function mergeConnectionInput(input, existing) {
  if (!existing || existing.kind !== input.kind) {
    return input
  }

  const merged = { ...input }

  const inherit = field => {
    if (merged[field] === undefined && existing[field] !== undefined) {
      ;merged[field] = existing[field]
    }
  }

  inherit('url')
  inherit('authMode')
  inherit('org')
  inherit('host')
  inherit('keyPath')
  inherit('remoteHermesPath')
  inherit('remoteProfile')
  // Headers inherit like other dial fields: an edit payload that omits the
  // field keeps the stored set; an explicit payload (even {}) is
  // authoritative so the editor can clear them.
  inherit('headers')

  // ssh user/port: the editor shows ONE composite host field (user@host:port),
  // and normalizeSshConfig gives explicit user/port fields precedence over the
  // parsed host string. Inheriting stored user/port alongside a NEW host string
  // would resurrect the old values over what the user just typed — so when the
  // payload carries a host, the host string is authoritative and stored
  // user/port are NOT inherited.
  if (input.host === undefined || !String(input.host).trim()) {
    inherit('user')
    inherit('port')
  }

  return merged
}

/**
 * True when an edit changes how a connection is DIALED — endpoint, auth, or
 * ssh routing fields — as opposed to a cosmetic label rename. Callers use
 * this to decide whether live pooled backends / renderer sockets for the
 * connection must be recycled after a save: a label-only edit keeps traffic
 * flowing, while a url/token/host change means everything currently open
 * points at the OLD target and must be torn down and re-dialed.
 */
function connectionDialFieldsChanged(before, after) {
  if (before.kind !== after.kind) {
    return true
  }

  const fields = [
    'url',
    'authMode',
    'org',
    'host',
    'user',
    'port',
    'keyPath',
    'remoteHermesPath',
    'remoteProfile'
  ]

  for (const field of fields) {
    if ((before[field] ?? null) !== (after[field] ?? null)) {
      return true
    }
  }

  // Token envelopes are opaque here (main.ts encrypts). An edit that carries
  // no new token inherits the stored envelope verbatim, so structural
  // equality is exact for the label-only case.
  if (JSON.stringify(before.token ?? null) !== JSON.stringify(after.token ?? null)) {
    return true
  }

  // Headers are dial material too: a changed access-proxy credential means
  // every open socket/backend authenticated with the OLD set.
  return JSON.stringify(before.headers ?? null) !== JSON.stringify(after.headers ?? null)
}

// ── Registry-level operations (all pure: return a new registry) ────────────

function localEntry(label = 'This device') {
  return { id: LOCAL_CONNECTION_ID, kind: 'local', label }
}

/**
 * Coerce arbitrary parsed JSON into a valid registry: version stamped, a
 * local entry guaranteed, labels de-duplicated defensively (suffix, never
 * drop), primary always pointing at an existing entry. A hand-edited or
 * corrupt file degrades to a minimal local-only registry rather than
 * throwing at boot.
 */
function normalizeRegistry(raw) {
  const parsed = raw && typeof raw === 'object' ? raw : {}
  const rawConnections = Array.isArray(parsed.connections) ? parsed.connections : []
  const seenLabels = new Set()
  const seenIds = new Set()
  const connections = []

  for (const item of rawConnections) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const entry = item
    const kind = entry.kind

    if (kind !== 'local' && kind !== 'remote' && kind !== 'cloud' && kind !== 'ssh') {
      continue
    }

    let label = String(entry.label || '').trim()

    if (!label) {
      // Defensive: registry entries are always written with labels, but a
      // hand-edited file may drop one. Derive rather than discard.
      label =
        kind === 'ssh' ? String(entry.host || 'ssh') : hostLabelFromBaseUrl(String(entry.url || '')) || String(kind)
    }

    label = uniqueLabel(label, seenLabels)

    let id = kind === 'local' ? LOCAL_CONNECTION_ID : String(entry.id || '').trim()

    if (!id || (seenIds.has(id) && kind !== 'local')) {
      id = connectionIdForLabel(label, seenIds)
    }

    if (seenIds.has(id)) {
      continue // second 'local' entry — first one wins
    }

    seenLabels.add(labelKey(label))
    seenIds.add(id)

    const clean = { id, kind, label }

    if (kind === 'remote' || kind === 'cloud') {
      const url = String(entry.url || '').trim()

      if (!url) {
        continue
      }

      clean.url = url
      clean.authMode = normAuthMode(entry.authMode)

      if (entry.token !== undefined) {
        clean.token = entry.token
      }

      const storedHeaders = normalizeRemoteHeaders(entry.headers)

      if (Object.keys(storedHeaders).length > 0) {
        clean.headers = storedHeaders
      }

      const org = String(entry.org || '').trim()

      if (kind === 'cloud' && org) {
        clean.org = org
      }
    } else if (kind === 'ssh') {
      const ssh = normalizeSshConfig({ ...entry, mode: 'ssh' })

      if (!ssh) {
        continue
      }

      const { mode: _mode, ...sshFields } = ssh
      Object.assign(clean, sshFields)
    }

    connections.push(clean)
  }

  if (!connections.some(c => c.kind === 'local')) {
    connections.unshift(localEntry())
  }

  const storedPrimary = String(parsed.primary || '').trim()
  const primary = connections.some(c => c.id === storedPrimary) ? storedPrimary : LOCAL_CONNECTION_ID
  const storedLastUsed = String(parsed.lastUsed || '').trim()

  return {
    version: REGISTRY_VERSION,
    primary,
    launchMode: parsed.launchMode === 'last-used' ? 'last-used' : 'primary',
    lastUsed: connections.some(c => c.id === storedLastUsed) ? storedLastUsed : primary,
    connections
  }
}

/**
 * One-time import of the v1 connection.json shape (global `mode` + `remote`
 * block + per-profile `profiles` map) into a v2 registry. v1 had no labels,
 * so they are derived (URL host, SSH host, "This device") and uniqued by
 * suffixing. The active v1 global connection becomes the primary. The v1
 * file is left untouched by the caller — old builds keep working.
 *
 * Per-profile override entries become registry connections too (deduped by
 * URL/host against the global block), so a user who had `research` pinned to
 * a second gateway sees both sources registered on first launch.
 */
function migrateV1ToRegistry(v1) {
  const config = v1 && typeof v1 === 'object' ? v1 : {}
  const connections = [localEntry()]
  const byFingerprint = new Map()

  const addRemoteLike = (block, kind) => {
    const url = String(block?.url || '').trim()

    if (!url) {
      return null
    }

    const fingerprint = `${kind}:${url}`
    const existing = byFingerprint.get(fingerprint)

    if (existing) {
      return existing
    }

    const label = uniqueLabel(
      hostLabelFromBaseUrl(url) || (kind === 'cloud' ? 'Work4You' : 'Remote gateway'),
      connections.map(c => c.label)
    )

    const entry = {
      id: connectionIdForLabel(
        label,
        connections.map(c => c.id)
      ),
      kind,
      label,
      url,
      authMode: normAuthMode(block.authMode)
    }

    if (block.token !== undefined) {
      entry.token = block.token
    }

    const v1Headers = normalizeRemoteHeaders(block.headers)

    if (Object.keys(v1Headers).length > 0) {
      entry.headers = v1Headers
    }

    const org = String(block.org || '').trim()

    if (kind === 'cloud' && org) {
      entry.org = org
    }

    connections.push(entry)
    byFingerprint.set(fingerprint, entry)

    return entry
  }

  const addSsh = block => {
    const ssh = normalizeSshConfig({ ...block, mode: 'ssh' })

    if (!ssh) {
      return null
    }

    const fingerprint = `ssh:${ssh.user || ''}@${ssh.host}:${ssh.port || 22}`
    const existing = byFingerprint.get(fingerprint)

    if (existing) {
      return existing
    }

    const label = uniqueLabel(
      ssh.host,
      connections.map(c => c.label)
    )

    const { mode: _mode, ...sshFields } = ssh

    const entry = {
      id: connectionIdForLabel(
        label,
        connections.map(c => c.id)
      ),
      kind: 'ssh',
      label,
      ...sshFields
    }

    connections.push(entry)
    byFingerprint.set(fingerprint, entry)

    return entry
  }

  // Global connection → an entry + the primary designation.
  let primary = LOCAL_CONNECTION_ID
  const globalMode = config.mode

  if (modeIsRemoteLike(globalMode)) {
    const entry = addRemoteLike(config.remote || {}, globalMode === 'cloud' ? 'cloud' : 'remote')

    if (entry) {
      primary = entry.id
    }
  } else if (globalMode === 'ssh') {
    const entry = addSsh(config.remote || {})

    if (entry) {
      primary = entry.id
    }
  }

  // Per-profile overrides → additional registered sources (deduped).
  const profiles = config.profiles && typeof config.profiles === 'object' ? config.profiles : {}

  for (const block of Object.values(profiles)) {
    if (!block || typeof block !== 'object') {
      continue
    }

    if (modeIsRemoteLike(block.mode)) {
      addRemoteLike(block, block.mode === 'cloud' ? 'cloud' : 'remote')
    } else if (block.mode === 'ssh') {
      addSsh(block)
    } else if (block.mode === 'local' && block.savedSsh) {
      addSsh(block.savedSsh)
    }
  }

  return { version: REGISTRY_VERSION, primary, launchMode: 'primary', lastUsed: primary, connections }
}

/** Insert or replace by id. Input must already be normalized/validated. */
function upsertConnection(registry, entry) {
  const connections = registry.connections.some(c => c.id === entry.id)
    ? registry.connections.map(c => (c.id === entry.id ? entry : c))
    : [...registry.connections, entry]

  return { ...registry, connections }
}

/**
 * Remove a connection. The local entry is not removable; removing the
 * current primary retargets primary to local.
 */
function removeConnection(registry, id) {
  const target = registry.connections.find(c => c.id === id)

  if (!target) {
    return registry
  }

  if (target.kind === 'local') {
    throw new Error('The local connection cannot be removed.')
  }

  const primary = registry.primary === id ? LOCAL_CONNECTION_ID : registry.primary

  return {
    ...registry,
    primary,
    lastUsed: registry.lastUsed === id ? primary : registry.lastUsed,
    connections: registry.connections.filter(c => c.id !== id)
  }
}

/** Point the window/primary backend at another registered connection. */
function setPrimaryConnection(registry, id) {
  if (!registry.connections.some(c => c.id === id)) {
    throw new Error(`No connection with id "${id}".`)
  }

  return { ...registry, primary: id }
}

/** Remember the last source the Sessions workspace opened successfully. */
function setLastUsedConnection(registry, id) {
  if (!registry.connections.some(c => c.id === id)) {
    throw new Error(`No connection with id "${id}".`)
  }

  return { ...registry, lastUsed: id }
}

/** Choose whether launch restores the explicit primary or the last-used source. */
function setConnectionLaunchMode(registry, launchMode) {
  if (launchMode !== 'last-used' && launchMode !== 'primary') {
    throw new Error(`Unknown connection launch mode "${String(launchMode)}".`)
  }

  return { ...registry, launchMode }
}

const WORK4YOU_CLOUD_CONNECTION_ID = 'work4you-cloud'

const WORK4YOU_APP_ORIGIN = (process.env.W4Y_APP_ORIGIN || 'https://app.work4you.ai').replace(/\/$/, '')

function work4YouCloudBaseUrl(tenantSlug) {
  const slug = String(tenantSlug || '').trim()

  if (!slug) {
    return WORK4YOU_APP_ORIGIN
  }

  return `https://${slug}.fly.dev`
}

function resolveWork4YouCloudConnection(opts = {}) {
  const label = String(opts.label || '').trim() || 'Work4You'
  const tenantSlug = String(opts.tenantSlug || '').trim()
  const entry = {
    id: WORK4YOU_CLOUD_CONNECTION_ID,
    kind: 'cloud',
    label,
    url: work4YouCloudBaseUrl(tenantSlug),
    authMode: 'oauth'
  }

  if (tenantSlug) {
    entry.org = tenantSlug
  }

  return entry
}

function ensureWork4YouCloudConnection(registry, opts = {}) {
  const existing = registry.connections.find(c => c.id === WORK4YOU_CLOUD_CONNECTION_ID)
  const draft = resolveWork4YouCloudConnection(opts)
  const merged = mergeConnectionInput(
    {
      id: WORK4YOU_CLOUD_CONNECTION_ID,
      kind: 'cloud',
      label: draft.label,
      url: draft.url,
      authMode: draft.authMode,
      org: draft.org
    },
    existing
  )

  const withoutSelf = {
    ...registry,
    connections: registry.connections.filter(c => c.id !== WORK4YOU_CLOUD_CONNECTION_ID)
  }

  const entry = normalizeConnectionInput(merged, withoutSelf)
  let next = upsertConnection(registry, entry)
  next = setPrimaryConnection(next, WORK4YOU_CLOUD_CONNECTION_ID)

  return next
}


module.exports = {
  REGISTRY_VERSION,
  LOCAL_CONNECTION_ID,
  WORK4YOU_CLOUD_CONNECTION_ID,
  labelKey,
  uniqueLabel,
  labelSlug,
  agentHandle,
  backendScopeKey,
  backendScopePrefix,
  resolvedConnectionId,
  resolveRegistryLocalRoute,
  shouldDeferLocalEnumeration,
  rememberSshEnumeration,
  shouldRetrySshInventory,
  parseRemoteProfileListing,
  buildAgentRoster,
  updateEligibility,
  connectionIdForLabel,
  normalizeConnectionInput,
  mergeConnectionInput,
  connectionDialFieldsChanged,
  normalizeRegistry,
  migrateV1ToRegistry,
  upsertConnection,
  removeConnection,
  setPrimaryConnection,
  setLastUsedConnection,
  setConnectionLaunchMode,
  work4YouCloudBaseUrl,
  resolveWork4YouCloudConnection,
  ensureWork4YouCloudConnection
}
