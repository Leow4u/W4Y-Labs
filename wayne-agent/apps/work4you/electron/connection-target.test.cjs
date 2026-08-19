'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  buildFlyBrainConnection,
  isFlyBrainConnection,
  localEngineDisabled,
  resolvePackagedTarget
} = require('./connection-target.cjs')

describe('connection-target', () => {
  it('disables local engine when packaged without override', () => {
    assert.equal(localEngineDisabled({ isPackaged: true, allowLocalEngine: false }), true)
    assert.equal(localEngineDisabled({ isPackaged: true, allowLocalEngine: true }), false)
    assert.equal(localEngineDisabled({ isPackaged: false, allowLocalEngine: false }), false)
  })

  it('resolves packaged target as fly brain + electron body', () => {
    const target = resolvePackagedTarget(true, false)
    assert.equal(target.brain, 'fly')
    assert.equal(target.body, 'electron')
    assert.equal(target.mode, 'cloud-body')
  })

  it('buildFlyBrainConnection returns empty baseUrl for tenant bridge', () => {
    const conn = buildFlyBrainConnection({ logs: ['boot'] })
    assert.equal(conn.baseUrl, '')
    assert.equal(conn.brain, 'fly')
    assert.equal(conn.mode, 'cloud-body')
    assert.deepEqual(conn.logs, ['boot'])
  })

  it('isFlyBrainConnection detects legacy and explicit brain', () => {
    assert.equal(isFlyBrainConnection({ mode: 'cloud-body' }), true)
    assert.equal(isFlyBrainConnection({ brain: 'fly', mode: 'local' }), true)
    assert.equal(isFlyBrainConnection({ mode: 'local' }), false)
    assert.equal(isFlyBrainConnection(null), false)
  })
})
