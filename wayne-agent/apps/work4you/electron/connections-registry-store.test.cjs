'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createConnectionsRegistryStore } = require('./connections-registry-store.cjs')
const { WORK4YOU_CLOUD_CONNECTION_ID } = require('./connection-registry.cjs')

describe('connections-registry-store', () => {
  it('syncPackagedCloud sets work4you-cloud as primary', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w4y-reg-'))
    const store = createConnectionsRegistryStore({
      userDataPath: dir,
      readV1Config: () => ({ mode: 'local', remote: {}, profiles: {} }),
      writeAtomic: (file, data) => fs.writeFileSync(file, data, 'utf8'),
      decryptSecret: () => '',
      encryptSecret: v => ({ encoding: 'plain', value: v }),
      safeStorageAvailable: () => true
    })

    const next = store.syncPackagedCloud({ label: 'Work4You', tenantSlug: 'wayne-demo' })
    assert.equal(next.primary, WORK4YOU_CLOUD_CONNECTION_ID)
    const cloud = next.connections.find(c => c.id === WORK4YOU_CLOUD_CONNECTION_ID)
    assert.ok(cloud)
    assert.equal(cloud.kind, 'cloud')
    assert.match(cloud.url || '', /wayne-demo\.fly\.dev/)
  })
})
