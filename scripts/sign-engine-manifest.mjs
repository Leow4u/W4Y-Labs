#!/usr/bin/env node
/**
 * Sign engine update manifest (latest.json) with Ed25519.
 *
 * Env:
 *   W4Y_ENGINE_SIGNING_PRIVATE_KEY — PEM or base64 PKCS8 private key
 *
 * Usage:
 *   node scripts/sign-engine-manifest.mjs --zip path/to.zip --manifest path/to/latest.json
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const out = { zip: '', manifest: '' }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--zip') out.zip = argv[++i]
    else if (argv[i] === '--manifest') out.manifest = argv[++i]
  }
  return out
}

function loadPrivateKey(raw) {
  const trimmed = raw.trim()
  if (trimmed.includes('BEGIN')) {
    return crypto.createPrivateKey(trimmed)
  }
  return crypto.createPrivateKey({
    key: Buffer.from(trimmed, 'base64'),
    format: 'der',
    type: 'pkcs8'
  })
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

const { zip, manifest } = parseArgs(process.argv)
if (!zip || !manifest) {
  console.error('Usage: node scripts/sign-engine-manifest.mjs --zip <file.zip> --manifest <latest.json>')
  process.exit(1)
}

const pem = process.env.W4Y_ENGINE_SIGNING_PRIVATE_KEY
if (!pem) {
  console.error('W4Y_ENGINE_SIGNING_PRIVATE_KEY is not set — skipping signature (dev only)')
  process.exit(0)
}

const doc = JSON.parse(fs.readFileSync(manifest, 'utf8'))
doc.sha256 = sha256File(path.resolve(zip))

const message = Buffer.from(`${doc.version}|${doc.builtAt}|${doc.sha256}`, 'utf8')
const privateKey = loadPrivateKey(pem)
const signature = crypto.sign(null, message, privateKey)
doc.signature = signature.toString('base64')

// Export public key for embedding in desktop updater (stdout hint)
const publicKey = crypto.createPublicKey(privateKey)
const spki = publicKey.export({ type: 'spki', format: 'der' })
console.error(`Public key (base64 SPKI, embed in updater): ${spki.toString('base64')}`)

fs.writeFileSync(manifest, JSON.stringify(doc, null, 2) + '\n', 'utf8')
console.log('Signed manifest:', manifest)
