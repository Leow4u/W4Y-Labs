'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { applyConnectionChange, commitConnectionFailure, resolveTerminalConnection } = require('./connection-apply.cjs')

function deferred() {
  let resolve

  const promise = new Promise(done => {
    resolve = done
  })

  return { promise, resolve }
}

test('applyConnectionChange serializes primary changes behind bootstrap rollback', async () => {
  const gate = deferred()
  const events = []

  const run = applyConnectionChange({
    cancelAndWait: async () => {
      events.push('cancel')
      await gate.promise
      events.push('drained')
    },
    isPrimary: true,
    scope: '',
    sendApplied: () => events.push('applied'),
    stopPool: () => {},
    teardownPrimary: async () => {
      events.push('primary')
    },
    teardownSsh: async () => {
      events.push('ssh')
    }
  })

  await Promise.resolve()
  assert.deepEqual(events, ['cancel'])
  gate.resolve()
  await run
  assert.deepEqual(events, ['cancel', 'drained', 'ssh', 'primary', 'applied'])
})

test('applyConnectionChange tears down only a non-primary scope', async () => {
  const events = []
  await applyConnectionChange({
    cancelAndWait: async scope => {
      events.push(`cancel:${scope}`)
    },
    isPrimary: false,
    scope: 'worker',
    sendApplied: () => events.push('applied'),
    stopPool: scope => events.push(`pool:${scope}`),
    teardownPrimary: async () => {
      events.push('primary')
    },
    teardownSsh: async scope => {
      events.push(`ssh:${scope}`)
    }
  })
  assert.deepEqual(events, ['cancel:worker', 'ssh:worker', 'pool:worker'])
})

test('resolveTerminalConnection joins an in-flight backend before resolving', async () => {
  const target = { ssh: {}, scope: '' }
  let calls = 0
  const getTarget = () => {
    calls += 1
    return calls === 1 ? 'pending' : target
  }
  let ensured = false
  const ensureBackend = async () => {
    ensured = true
  }

  await assert.doesNotReject(resolveTerminalConnection(getTarget, ensureBackend))
  assert.equal(ensured, true)
})

test('resolveTerminalConnection rejects when SSH stays unavailable', async () => {
  await assert.rejects(
    resolveTerminalConnection(
      () => 'pending',
      async () => undefined
    ),
    /not ready/
  )
})

test('commitConnectionFailure prevents a stale bootstrap from publishing failure state', () => {
  const stale = Promise.resolve('stale')
  const current = Promise.resolve('current')
  let committed = 0
  const commit = () => {
    committed += 1
  }

  assert.equal(commitConnectionFailure(current, stale, commit), false)
  assert.equal(committed, 0)
  assert.equal(commitConnectionFailure(current, current, commit), true)
  assert.equal(committed, 1)
})
