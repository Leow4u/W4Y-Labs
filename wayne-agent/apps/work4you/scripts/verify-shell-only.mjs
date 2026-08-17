#!/usr/bin/env node
// ===========================================================================
// Prove the Windows/macOS shell pack is casca-fina: no engine inside.
// ===========================================================================
// Until 17/08/2026 every NSIS rewrite paid ~700 MB because
// extraResources shipped build/engine-runtime → resources/engine. The product
// policy is now feed-first: motor lives only on gs://w4y-engine-dist/.
//
// Usage: node scripts/verify-shell-only.mjs [--release <dir>]
// ===========================================================================

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.join(SCRIPT_DIR, '..')

function fail(msg) {
  console.error(`[verify-shell] FAIL ${msg}`)
  process.exit(1)
}

function exists(p) {
  try {
    fs.statSync(p)
    return true
  } catch {
    return false
  }
}

/** Collect every resources/engine candidate electron-builder may have produced. */
function findEngineDirs(releaseDir) {
  const found = []
  if (!exists(releaseDir)) return found

  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (/-unpacked$/.test(entry.name)) {
      found.push(path.join(releaseDir, entry.name, 'resources', 'engine'))
    }
    const appDir = path.join(releaseDir, entry.name)
    let inners = []
    try {
      inners = fs.readdirSync(appDir, { withFileTypes: true }).filter(d => d.isDirectory())
    } catch {
      continue
    }
    for (const inner of inners) {
      if (inner.name.endsWith('.app')) {
        found.push(path.join(appDir, inner.name, 'Contents', 'Resources', 'engine'))
      }
    }
  }
  return found
}

function main() {
  const argv = process.argv.slice(2)
  const relIdx = argv.indexOf('--release')
  const releaseDir = path.resolve(relIdx >= 0 ? argv[relIdx + 1] : path.join(APP_ROOT, 'release'))

  if (!exists(releaseDir)) {
    fail(`release dir missing: ${releaseDir}`)
  }

  const engines = findEngineDirs(releaseDir).filter(p => exists(p))
  if (engines.length > 0) {
    fail(
      `casca fina broken — engine still packed at:\n  ${engines.join('\n  ')}\n` +
        `Remove build/engine-runtime from electron-builder extraResources.`
    )
  }

  console.log(`[verify-shell] OK — no resources/engine under ${releaseDir}`)
}

main()
