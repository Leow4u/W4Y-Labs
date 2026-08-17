/**
 * Writes build/engine-trust.json for packaged desktop (Ed25519 engine verify).
 *
 * The key below is the PUBLIC half — it belongs in the repo. It used to come
 * only from W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64, which nobody set, so every build
 * shipped `engineUpdatePublicKeyB64: null` and the updater's verification
 * quietly did nothing (17/08). A committed constant means every build — CI,
 * local, anyone's — trusts the same signer without a step to remember.
 *
 * Its private half is the GitHub secret W4Y_ENGINE_SIGNING_PRIVATE_KEY and a
 * PEM outside the repo. Rotating is a visible diff here plus a new secret, and
 * only shells built after that diff will accept the new signature.
 *
 * The env var still wins when set, for testing a rotation before committing it.
 */
const fs = require('node:fs')
const path = require('node:path')

const ENGINE_UPDATE_PUBLIC_KEY_B64 = 'MCowBQYDK2VwAyEAMAhc1rhLyLt6JxvQ5/j/POwyzQtQehqi3uLEfTy3cRk='

const outDir = path.join(__dirname, '..', 'build')
const outFile = path.join(outDir, 'engine-trust.json')

const pubB64 = (process.env.W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64 || '').trim() || ENGINE_UPDATE_PUBLIC_KEY_B64
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
