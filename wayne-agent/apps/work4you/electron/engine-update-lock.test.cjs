'use strict'

/**
 * The in-app engine update replaces the very venv the desktop's Python backend
 * runs from. On 16/08/2026 it died with EPERM on `.venv`: the chip stopped the
 * backend, the ZIP took minutes to download, the renderer lost its socket and
 * asked for a connection, and a fresh backend spawned out of the venv that was
 * about to be replaced. The engine log shows the restart at 21:32:49 and the
 * EPERM at 21:32:52.
 *
 * The mutual-exclusion marker already existed for the legacy updater handoff
 * (#50238) — the packaged engine path just never claimed it. These assertions
 * are source-level on purpose: main.cjs boots Electron and cannot be required
 * from a unit test.
 *
 * Run with: node --test electron/engine-update-lock.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function readMain() {
  return fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8').replace(/\r\n/g, '\n')
}

test('the engine update claims the marker and releases it even when it fails', () => {
  const source = readMain()
  const index = source.indexOf("ipcMain.handle('hermes:updates:apply'")
  assert.notEqual(index, -1, 'missing the apply handler')
  const handler = source.slice(index, index + 2500)

  assert.match(
    handler,
    /writeUpdateMarker\(HERMES_HOME, process\.pid\)/,
    'the update must claim the marker so reconnects park instead of spawning'
  )
  assert.match(
    handler,
    /finally\s*\{[\s\S]*clearUpdateMarker\(HERMES_HOME\)/,
    'the marker carries our own live pid: nothing self-heals it, so releasing it must survive a failed update'
  )
  assert.match(
    handler,
    /stopAllPoolBackends\(\)/,
    'extra profiles run their own python.exe out of the same venv'
  )
})

test('the gate closes before the backend is torn down, not after', () => {
  const source = readMain()
  const index = source.indexOf("ipcMain.handle('hermes:updates:apply'")
  const handler = source.slice(index, index + 2500)

  const claim = handler.indexOf('writeUpdateMarker(')
  const teardown = handler.indexOf('resetHermesConnection()')
  const wait = handler.indexOf('await waitForBackendExit(')

  assert.notEqual(claim, -1, 'missing the marker claim')
  assert.notEqual(teardown, -1, 'missing the teardown')
  assert.notEqual(wait, -1, 'missing the wait for exit')

  // 1.0.115 claimed it after waiting for the backend to exit. The renderer
  // notices the dropped socket in milliseconds and the wait takes seconds, so a
  // fresh backend spawned inside that window and re-locked the venv (17/08:
  // backend at 09:05:13, marker at 09:05:22).
  assert.ok(claim < teardown, 'the marker must be claimed before the teardown starts')
  assert.ok(claim < wait, 'the marker must be claimed before we wait for the backend to exit')
})

test('every local backend spawn waits for a live update to finish', () => {
  const source = readMain()

  for (const fn of ['async function startHermes()', 'async function spawnPoolBackend(profile, entry)']) {
    const index = source.indexOf(fn)
    assert.notEqual(index, -1, `missing ${fn}`)
    const body = source.slice(index, index + 4000)
    assert.match(body, /await waitForUpdateToFinish\(\)/, `${fn} must park while an update is applying`)
  }
})
