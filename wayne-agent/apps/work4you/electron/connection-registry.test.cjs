'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  WORK4YOU_CLOUD_CONNECTION_ID,
  LOCAL_CONNECTION_ID,
  REGISTRY_VERSION,
  agentHandle,
  backendScopeKey,
  backendScopePrefix,
  buildAgentRoster,
  connectionIdForLabel,
  ensureWork4YouCloudConnection,
  labelKey,
  labelSlug,
  migrateV1ToRegistry,
  normalizeConnectionInput,
  normalizeRegistry,
  resolveWork4YouCloudConnection,
  setPrimaryConnection,
  uniqueLabel,
  updateEligibility,
  upsertConnection,
  work4YouCloudBaseUrl
} = require('./connection-registry.cjs')

function emptyRegistry() {
  return normalizeRegistry(null)
}

test('labelKey is case-insensitive and trimmed', () => {
  assert.equal(labelKey('  Homelab '), 'homelab')
  assert.equal(labelKey('HOMELAB'), labelKey('homelab'))
})

test('labelSlug kebab-cases and never returns empty for non-empty input', () => {
  assert.equal(labelSlug('Work Laptop'), 'work-laptop')
  assert.equal(labelSlug('!!!'), 'connection')
})

test('agentHandle bare when unique, suffixed when duplicated', () => {
  assert.equal(agentHandle('research', 'Homelab', false), 'research')
  assert.equal(agentHandle('research', 'Homelab', true), 'research-homelab')
})

test('backendScopeKey keeps bare profile key for local connection', () => {
  assert.equal(backendScopeKey(null, 'research'), 'research')
  assert.equal(backendScopeKey(LOCAL_CONNECTION_ID, 'research'), 'research')
  assert.equal(backendScopeKey('homelab', 'research'), 'conn:homelab::research')
  assert.ok(backendScopeKey('homelab', 'research').startsWith(backendScopePrefix('homelab')))
})

test('normalizeRegistry degrades junk to a local-only registry', () => {
  for (const junk of [null, undefined, 42, 'nope', { connections: 'zzz' }]) {
    const registry = normalizeRegistry(junk)

    assert.equal(registry.version, REGISTRY_VERSION)
    assert.equal(registry.primary, LOCAL_CONNECTION_ID)
    assert.equal(registry.connections.length, 1)
    assert.equal(registry.connections[0].kind, 'local')
  }
})

test('migrate: v1 cloud keeps cloud provenance + org', () => {
  const registry = migrateV1ToRegistry({
    mode: 'cloud',
    remote: { url: 'https://a.example.cloud', authMode: 'oauth', org: 'acme' }
  })

  const cloud = registry.connections.find(c => c.kind === 'cloud')

  assert.ok(cloud)
  assert.equal(registry.primary, cloud.id)
  assert.equal(cloud.org, 'acme')
})

test('update fan-out: cloud is platform-managed', () => {
  assert.deepEqual(updateEligibility({ id: 'c', kind: 'cloud', label: 'Cloud' }), {
    eligible: false,
    reason: 'cloud-managed'
  })
  assert.equal(updateEligibility({ id: 'local', kind: 'local', label: 'x' }).eligible, true)
})

test('remote input normalizes scheme-less URLs', () => {
  const remote = normalizeConnectionInput(
    { kind: 'remote', label: 'LAN box', url: '10.0.0.5:9119', authMode: 'weird' },
    emptyRegistry()
  )

  assert.equal(remote.url, 'http://10.0.0.5:9119')
  assert.equal(remote.authMode, 'token')
})

test('roster applies duplicate-handle rule once across sources', () => {
  const local = { id: 'local', kind: 'local', label: 'This device' }
  const homelab = { id: 'homelab', kind: 'remote', label: 'Homelab', url: 'http://h:1' }

  const roster = buildAgentRoster([
    { connection: local, profiles: ['default', 'research'] },
    { connection: homelab, profiles: ['research', 'coder'] }
  ])

  const byKey = new Map(roster.map(a => [`${a.connectionId}/${a.profile}`, a.handle]))

  assert.equal(byKey.get('local/research'), 'research-this-device')
  assert.equal(byKey.get('homelab/research'), 'research-homelab')
  assert.equal(byKey.get('local/default'), 'default')
  assert.equal(roster.length, 4)
})

test('work4YouCloudBaseUrl uses tenant fly host or app router fallback', () => {
  assert.equal(work4YouCloudBaseUrl('wayne-acme'), 'https://wayne-acme.fly.dev')
  assert.equal(work4YouCloudBaseUrl(''), 'https://app.work4you.ai')
})

test('resolveWork4YouCloudConnection builds packaged cloud entry', () => {
  const entry = resolveWork4YouCloudConnection({ label: 'My tenant', tenantSlug: 'wayne-acme' })

  assert.equal(entry.id, WORK4YOU_CLOUD_CONNECTION_ID)
  assert.equal(entry.kind, 'cloud')
  assert.equal(entry.label, 'My tenant')
  assert.equal(entry.url, 'https://wayne-acme.fly.dev')
  assert.equal(entry.authMode, 'oauth')
  assert.equal(entry.org, 'wayne-acme')
})

test('ensureWork4YouCloudConnection upserts and sets primary', () => {
  let registry = emptyRegistry()
  const remote = normalizeConnectionInput({ kind: 'remote', label: 'Homelab', url: 'http://10.0.0.5:9119' }, registry)
  registry = upsertConnection(registry, remote)
  registry = setPrimaryConnection(registry, remote.id)

  registry = ensureWork4YouCloudConnection(registry, { label: 'Work4You', tenantSlug: 'wayne-acme' })

  assert.equal(registry.primary, WORK4YOU_CLOUD_CONNECTION_ID)
  const cloud = registry.connections.find(c => c.id === WORK4YOU_CLOUD_CONNECTION_ID)
  assert.equal(cloud.label, 'Work4You')
  assert.equal(cloud.url, 'https://wayne-acme.fly.dev')

  registry = ensureWork4YouCloudConnection(registry, { label: 'Work4You', tenantSlug: 'wayne-other' })
  const updated = registry.connections.find(c => c.id === WORK4YOU_CLOUD_CONNECTION_ID)
  assert.equal(updated.url, 'https://wayne-other.fly.dev')
  assert.equal(registry.connections.filter(c => c.id === WORK4YOU_CLOUD_CONNECTION_ID).length, 1)
})

test('connectionIdForLabel never mints the reserved local id', () => {
  assert.equal(connectionIdForLabel('Local', []), 'local-2')
})

test('uniqueLabel suffixes on collision', () => {
  assert.equal(uniqueLabel('Homelab', []), 'Homelab')
  assert.equal(uniqueLabel('Homelab', ['Homelab']), 'Homelab 2')
})
