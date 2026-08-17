'use strict'

/**
 * Whether a packaged build knows who signs its engine updates.
 *
 * verifyEngineManifest checks the ZIP's hash and signature only when the
 * manifest carries both fields AND the build carries a public key. Until
 * 17/08/2026 the key came solely from W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64, which
 * nobody ever set: every shipped build had engineUpdatePublicKeyB64: null, the
 * feed had no sha256 and no signature, and the updater installed whatever the
 * bucket served while the docs claimed the manifest was signed.
 *
 * Run with: node --test electron/engine-trust-key.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const SCRIPT = path.join(__dirname, '..', 'scripts', 'write-engine-trust.cjs')
// The script always writes here; `npm run build` regenerates it, so a test run
// leaving its own copy behind costs nothing.
const OUT = path.join(__dirname, '..', 'build', 'engine-trust.json')

function runWith(env) {
  execFileSync(process.execPath, [SCRIPT], {
    stdio: 'pipe',
    env: { ...process.env, ...env }
  })
  return JSON.parse(fs.readFileSync(OUT, 'utf8'))
}

test('a build with nothing configured still trusts a signer', () => {
  const doc = runWith({ W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64: '' })

  assert.ok(
    doc.engineUpdatePublicKeyB64,
    'a null key silently disables engine signature verification for everyone on that build'
  )
})

test('the pinned key is a usable Ed25519 public key, not a placeholder', () => {
  const doc = runWith({ W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64: '' })

  // The updater feeds this straight to createPublicKey as SPKI DER; a typo here
  // would only surface on a user's machine, at the moment they try to update.
  const key = crypto.createPublicKey({
    key: Buffer.from(doc.engineUpdatePublicKeyB64, 'base64'),
    format: 'der',
    type: 'spki'
  })
  assert.equal(key.asymmetricKeyType, 'ed25519')
})

test('the environment still wins, so a rotation can be tried before it is committed', () => {
  const { publicKey } = crypto.generateKeyPairSync('ed25519')
  const rotated = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')

  const doc = runWith({ W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64: rotated })
  assert.equal(doc.engineUpdatePublicKeyB64, rotated)
})
