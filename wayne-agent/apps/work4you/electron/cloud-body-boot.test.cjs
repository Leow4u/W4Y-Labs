'use strict'

/**
 * F3: packaged casca must not extract or spawn a local Python engine.
 * Source-level: main.cjs cannot be required from a unit test (Electron).
 *
 * Run with: node --test electron/cloud-body-boot.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function readMain() {
  return fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8').replace(/\r\n/g, '\n')
}

test('packaged product skips the local engine unless explicitly allowed', () => {
  const source = readMain()
  assert.match(source, /connectionTarget\.localEngineDisabled/)
  assert.match(source, /W4Y_ALLOW_LOCAL_ENGINE/)
  assert.match(source, /connectionTarget\.buildFlyBrainConnection/)

  const start = source.indexOf('async function startHermes()')
  assert.notEqual(start, -1)
  const body = source.slice(start, start + 2500)
  assert.match(body, /if \(localEngineDisabled\(\)\)/)
  assert.match(body, /return cloudBodyConnection\(\)/)
})

test('ensureRuntime cannot extract a Wayne ZIP when the local engine is disabled', () => {
  const source = readMain()
  const index = source.indexOf('async function ensureRuntime(backend)')
  assert.notEqual(index, -1)
  const body = source.slice(index, index + 800)
  assert.match(body, /if \(localEngineDisabled\(\)\)/)
  assert.match(body, /local-engine-disabled/)
})

test('body IPC can write and exec in the open folder', () => {
  const source = readMain()
  assert.match(source, /ipcMain\.handle\('hermes:body:writeFile'/)
  assert.match(source, /ipcMain\.handle\('hermes:body:exec'/)
  assert.match(source, /mkdir\(path\.dirname\(resolved\), \{ recursive: true \}\)/)
})

test('renderer WebSockets to app.work4you.ai carry w4y_route from the jar', () => {
  const cloud = fs
    .readFileSync(path.join(__dirname, 'w4y-cloud.cjs'), 'utf8')
    .replace(/\r\n/g, '\n')
  const main = readMain()
  assert.match(cloud, /installCloudBodyCookieBridge/)
  assert.match(cloud, /cachedAppCookieHeader/)
  assert.match(cloud, /onBeforeSendHeaders/)
  assert.match(cloud, /buildCloudGatewayWsUrl/)
  assert.match(cloud, /\.fly\.dev\/api\/ws/)
  assert.match(main, /installCloudBodyCookieBridge\(\)/)
})

test('hermes:api routes Fly brain REST through the tenant cookie bridge', () => {
  const source = readMain()
  assert.match(source, /function fetchJsonViaCloudBody\(/)
  assert.match(source, /connectionTarget\.isFlyBrainConnection\(connection\)/)
  assert.match(source, /fetchJsonViaCloudBody\(requestPath/)
  assert.match(source, /w4yCloud\.cloudApiRequest/)
})

test('freshGatewayWsUrl mints tenant tickets for Fly brain connections', () => {
  const source = readMain()
  assert.match(source, /async function freshGatewayWsUrl\(profile\)/)
  assert.match(source, /connectionTarget\.isFlyBrainConnection\(connection\)/)
  assert.match(source, /w4yCloud\.mintCloudWsUrl\(\)/)
})
