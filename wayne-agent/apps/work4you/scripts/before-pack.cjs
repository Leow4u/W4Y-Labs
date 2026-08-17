'use strict'

/**
 * before-pack.cjs — electron-builder beforePack hook.
 *
 * Removes any stale unpacked app directory (`appOutDir`) before
 * electron-builder stages the Electron binaries into it.
 *
 * WHY THIS EXISTS
 * ---------------
 * electron-builder's final packaging step copies the stock `electron`
 * binary into `release/<platform>-unpacked/` and then renames it to the
 * product name. If a PREVIOUS `npm run pack` was interrupted the unpacked
 * directory is left in a corrupted partial state and the next run dies with
 * ENOENT renaming `electron` → product name. Wipe up front so packaging is
 * idempotent across interrupted runs.
 *
 * ENGINE POLICY (casca fina, 17/08/2026)
 * --------------------------------------
 * The NSIS/DMG no longer embeds `build/engine-runtime`. First launch (and the
 * update chip) pull the motor from `gs://w4y-engine-dist/latest-*.json`. That
 * is what made casca updates take 5–10 minutes: every shell bump rewrote
 * ~700 MB of CPython. Opt back into the fat pack only with
 * `W4Y_PACK_WITH_ENGINE=1` (legacy / air-gapped experiments).
 */

const fs = require('node:fs')
const { assertEngineRuntime } = require('./assert-engine-runtime.cjs')

function packWithEngine() {
  return process.env.W4Y_PACK_WITH_ENGINE === '1'
}

function cleanStaleAppOutDir(appOutDir) {
  if (!appOutDir || typeof appOutDir !== 'string') {
    return false
  }
  if (!fs.existsSync(appOutDir)) {
    return false
  }
  fs.rmSync(appOutDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  return true
}

exports.cleanStaleAppOutDir = cleanStaleAppOutDir
exports.packWithEngine = packWithEngine

exports.default = async function beforePack(context) {
  if (packWithEngine()) {
    const { marker } = assertEngineRuntime(
      context && context.electronPlatformName,
      context && context.arch
    )
    console.log(
      `[before-pack] fat pack: engine runtime ok (${marker.platform}-${marker.arch})`
    )
  } else {
    console.log(
      '[before-pack] shell-only pack — motor vem do feed GCS no primeiro arranque / chip'
    )
  }

  const appOutDir = context && context.appOutDir
  try {
    if (cleanStaleAppOutDir(appOutDir)) {
      console.log(`[before-pack] removed stale unpacked dir before staging: ${appOutDir}`)
    }
  } catch (err) {
    console.warn(`[before-pack] could not clean ${appOutDir} (${err.message}); continuing`)
  }
}
