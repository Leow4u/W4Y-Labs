'use strict'

/**
 * Motor-only chip relaunch must flush cookies; boot heal must not await motor.
 *
 * Run with: node --test electron/update-session-safety.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('motor-only relaunch flushes cookie jar before app.exit', () => {
  const source = fs
    .readFileSync(path.join(__dirname, 'w4y-app-updater.cjs'), 'utf8')
    .replace(/\r\n/g, '\n')
  const marker = '// Motor updated successfully.'
  const start = source.indexOf(marker)
  assert.ok(start > 0, 'motor-only success branch missing')
  const body = source.slice(start, source.indexOf('// Both motor and casca', start))
  assert.match(body, /cookies\.flushStore\(\)/)
  const flush = body.indexOf('flushStore()')
  const relaunch = body.indexOf('app.relaunch()')
  const exit = body.indexOf('app.exit(0)')
  assert.ok(flush > 0 && relaunch > flush && exit > relaunch, 'flush must precede relaunch/exit')
})

test('ensurePlatformCredentials does not await onAccountSwitched', () => {
  const source = fs
    .readFileSync(path.join(__dirname, 'w4y-login.cjs'), 'utf8')
    .replace(/\r\n/g, '\n')
  const start = source.indexOf('async function ensurePlatformCredentials')
  const body = source.slice(start, source.indexOf('\nasync function healTenantSession', start))
  assert.match(body, /void Promise\.resolve\(\s*onAccountSwitched/)
  assert.doesNotMatch(body, /await onAccountSwitched\(/)
})
