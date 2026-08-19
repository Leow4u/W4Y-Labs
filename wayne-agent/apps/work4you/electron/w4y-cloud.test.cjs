'use strict'

/**
 * Cloud-body WS URL must bypass router-w4y when the tenant fly app is known.
 *
 * Run with: node --test electron/w4y-cloud.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, 'w4y-cloud.cjs'), 'utf8').replace(/\r\n/g, '\n')

test('desktop WS URL targets the tenant Fly directly when route is known', () => {
  assert.match(source, /function buildCloudGatewayWsUrl\(/)
  assert.match(source, /wss:\/\/\$\{flyApp\}\.fly\.dev\/api\/ws/)
  assert.match(source, /readW4yRouteFlyApp/)
})

test('cookie bridge uses a sync cache — no async before onBeforeSendHeaders callback', () => {
  const start = source.indexOf('function installCloudBodyCookieBridge(')
  const body = source.slice(start, source.indexOf('\nmodule.exports', start))
  assert.match(body, /cachedAppCookieHeader/)
  assert.doesNotMatch(body, /void \(async \(\) => \{[\s\S]*callback\(\{ requestHeaders/)
})

test('mintCloudWsUrl reads fly route before building the WS URL', () => {
  const start = source.indexOf('async function mintCloudWsUrl(')
  const body = source.slice(start, source.indexOf('\nfunction registerCloudIpc', start))
  assert.match(body, /readW4yRouteFlyApp\(\)/)
  assert.match(body, /buildCloudGatewayWsUrl\(/)
})
