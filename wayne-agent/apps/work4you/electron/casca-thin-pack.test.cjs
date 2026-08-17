'use strict'

/**
 * Casca fina: the Electron installer must not embed the Python engine.
 *
 * Run with: node --test electron/casca-thin-pack.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('package.json extraResources does not ship build/engine-runtime', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  )
  const extras = pkg.build?.extraResources || []
  const engineEntry = extras.find(
    e => e && (e.to === 'engine' || String(e.from || '').includes('engine-runtime'))
  )
  assert.equal(
    engineEntry,
    undefined,
    'NSIS/DMG must stay shell-only — motor comes from the GCS feed on first launch'
  )
})

test('beforePack defaults to shell-only (fat pack is opt-in)', () => {
  const source = fs
    .readFileSync(path.join(__dirname, '..', 'scripts', 'before-pack.cjs'), 'utf8')
    .replace(/\r\n/g, '\n')

  assert.match(source, /W4Y_PACK_WITH_ENGINE === '1'/)
  assert.match(source, /shell-only pack/)
  // Must not call assertEngineRuntime unconditionally on the default path.
  const defaultFn = source.slice(source.indexOf('exports.default'))
  assert.match(defaultFn, /if \(packWithEngine\(\)\)/)
})
