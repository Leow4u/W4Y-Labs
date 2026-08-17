'use strict'

/**
 * What happens after the shell update finishes downloading.
 *
 * The app quits and hands the .exe to NSIS, which then writes ~700 MB across
 * 13k files because the Python engine ships inside the installer. On 17/08/2026
 * that ran with /S: the window closed, nothing appeared for nine minutes, and
 * the app never came back — the user's report was "fechou e nao abriu
 * novamente". Silent also meant the relaunch depended solely on
 * ExecShellAsUser from a windowless installer, which did not fire.
 *
 * These assertions are source-level on purpose: electron-updater cannot be
 * driven from a unit test.
 *
 * Run with: node --test electron/casca-install-handoff.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function readUpdater() {
  return fs.readFileSync(path.join(__dirname, 'w4y-app-updater.cjs'), 'utf8').replace(/\r\n/g, '\n')
}

test('the installer runs visibly, and is still told to relaunch the app', () => {
  const source = readUpdater()
  const call = source.match(/autoUpdater\.quitAndInstall\(([^)]*)\)/)

  assert.ok(call, 'missing the quitAndInstall handoff')

  const [isSilent, isForceRunAfter] = call[1].split(',').map(arg => arg.trim())
  assert.equal(
    isSilent,
    'false',
    'minutes of installing with nothing on screen reads as a dead app; the oneClick progress window needs no interaction'
  )
  assert.equal(isForceRunAfter, 'true', 'the app must come back on its own after the install')
})

test('the user is told a window is about to open, not that the app is restarting', () => {
  const source = readUpdater()
  const index = source.indexOf('const onDownloaded')
  assert.notEqual(index, -1, 'missing the download-complete handler')

  const handler = source.slice(index, index + 900)
  assert.match(
    handler,
    /emit\('restart',[^)]*janela de progresso/,
    'the last thing shown before the app quits must set the expectation for the installer window'
  )
})
