/**
 * Writes build/engine-trust.json for packaged desktop (Ed25519 engine verify).
 * Set W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64 at build time (SPKI, base64).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'build')
const outFile = path.join(outDir, 'engine-trust.json')

const pubB64 = (process.env.W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64 || '').trim()
fs.mkdirSync(outDir, { recursive: true })
const doc = {
  schemaVersion: 1,
  engineUpdatePublicKeyB64: pubB64 || null,
  builtAt: new Date().toISOString(),
}
fs.writeFileSync(outFile, JSON.stringify(doc, null, 2) + '\n', 'utf8')
if (pubB64) {
  console.log('[write-engine-trust] wrote', path.relative(process.cwd(), outFile))
} else {
  console.warn('[write-engine-trust] no public key — engine signature verify disabled in this build')
}
