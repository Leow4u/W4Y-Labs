'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { rehomePrimaryConnection } = require('./primary-connection-rehome.cjs')

test('rehomePrimaryConnection resumes first-run remote without tearing down', async () => {
  const events = []

  const result = await rehomePrimaryConnection({
    clearLocalBootstrapFailure: () => events.push('clear'),
    mode: 'remote',
    notifyConnectionApplied: () => events.push('applied'),
    resumeFirstRunRemote: () => true,
    teardownPrimaryBackend: async () => {
      events.push('teardown')
    }
  })

  assert.deepEqual(result, { resumedFirstRunRemote: true })
  assert.deepEqual(events, ['clear'])
})

test('rehomePrimaryConnection soft-teardowns and notifies when first-run does not resume', async () => {
  const events = []

  const result = await rehomePrimaryConnection({
    clearLocalBootstrapFailure: () => events.push('clear'),
    mode: 'remote',
    notifyConnectionApplied: () => events.push('applied'),
    resumeFirstRunRemote: () => false,
    teardownPrimaryBackend: async opts => {
      events.push(`teardown:${opts.soft}`)
    }
  })

  assert.deepEqual(result, { resumedFirstRunRemote: false })
  assert.deepEqual(events, ['clear', 'teardown:true', 'applied'])
})

test('rehomePrimaryConnection skips first-run hooks for non-remote modes', async () => {
  const events = []

  const result = await rehomePrimaryConnection({
    clearLocalBootstrapFailure: () => events.push('clear'),
    mode: 'local',
    notifyConnectionApplied: () => events.push('applied'),
    resumeFirstRunRemote: () => {
      throw new Error('should not resume local')
    },
    teardownPrimaryBackend: async opts => {
      events.push(`teardown:${opts.soft}`)
    }
  })

  assert.deepEqual(result, { resumedFirstRunRemote: false })
  assert.deepEqual(events, ['teardown:true', 'applied'])
})
