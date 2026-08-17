'use strict'

/**
 * The contract between who signs the engine feed and who checks it.
 *
 * Two files have to agree on one string: scripts/sign-engine-manifest.mjs at
 * the repo root builds `version|builtAt|sha256` and signs it, and
 * verifyEngineManifest rebuilds the same string to verify. Nothing links them
 * but that convention, and a change to either side fails only on a user's
 * machine, at the moment they try to update — which is the worst place to
 * find out.
 *
 * These tests sign with a throwaway key so they need no secret: what they lock
 * is the shape of the agreement, not which key is trusted (that is
 * engine-trust-key.test.cjs).
 *
 * Run with: node --test electron/engine-manifest-signature.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { verifyEngineManifest } = require('./w4y-wayne-resolve.cjs')
const SIGNER = path.join(__dirname, '..', '..', '..', '..', 'scripts', 'sign-engine-manifest.mjs')

/** A signed manifest + the ZIP it describes, as the publish step produces them. */
function publishFixture(zipBody = 'engine bytes') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w4y-sig-'))
  const zip = path.join(dir, 'wayne-engine-20260817-win32-x64.zip')
  const manifest = path.join(dir, 'latest-win32-x64.json')

  fs.writeFileSync(zip, zipBody)
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      version: '20260817-win32-x64',
      zipUrl: 'https://storage.googleapis.com/w4y-engine-dist/wayne-engine-20260817-win32-x64.zip',
      builtAt: '2026-08-17T00:01:40Z',
      runtimeReady: true,
      platform: 'win32-x64'
    })
  )

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  execFileSync(process.execPath, [SIGNER, '--zip', zip, '--manifest', manifest], {
    stdio: 'pipe',
    env: {
      ...process.env,
      W4Y_ENGINE_SIGNING_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' })
    }
  })

  return {
    dir,
    zip,
    manifest: JSON.parse(fs.readFileSync(manifest, 'utf8')),
    publicKeyB64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  }
}

/** verifyEngineManifest reads the key off the environment when one is set. */
function verifyWith(publicKeyB64, manifest, zip) {
  const previous = process.env.W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64
  process.env.W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64 = publicKeyB64
  try {
    verifyEngineManifest(manifest, zip)
  } finally {
    if (previous === undefined) delete process.env.W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64
    else process.env.W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64 = previous
  }
}

test('the publish step emits a manifest the desktop accepts', () => {
  const { manifest, zip, publicKeyB64 } = publishFixture()

  assert.ok(manifest.sha256, 'the signer must add the hash the desktop compares against')
  assert.ok(manifest.signature, 'the signer must add the signature')

  verifyWith(publicKeyB64, manifest, zip)
})

test('a ZIP swapped under a genuine manifest is refused', () => {
  const { manifest, dir, publicKeyB64 } = publishFixture()

  // Same manifest, different bytes: whoever controls the bucket cannot serve
  // an engine other than the one that was signed.
  const swapped = path.join(dir, 'swapped.zip')
  fs.writeFileSync(swapped, 'someone elses engine')

  assert.throws(() => verifyWith(publicKeyB64, manifest, swapped), /sha256 mismatch/)
})

test('editing the manifest around a genuine hash is refused', () => {
  const { manifest, zip, publicKeyB64 } = publishFixture()

  // version and builtAt are inside the signed message, so pointing an old
  // shell at a downgraded version breaks the signature.
  const downgraded = { ...manifest, version: '20250101-win32-x64' }
  assert.throws(() => verifyWith(publicKeyB64, downgraded, zip), /signature verification failed/)
})

test('a signature from the wrong signer is refused', () => {
  const { manifest, zip } = publishFixture()
  const { publicKey } = crypto.generateKeyPairSync('ed25519')
  const stranger = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')

  assert.throws(() => verifyWith(stranger, manifest, zip), /signature verification failed/)
})
