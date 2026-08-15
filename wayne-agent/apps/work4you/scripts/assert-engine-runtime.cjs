'use strict'

/**
 * Packaged builds must ship a ready engine tree (standalone CPython + a synced
 * .venv). Without it the app falls back to resolving Python dependencies with
 * `uv sync` on the user's machine — a ~30 minute first launch.
 *
 * This runs from the electron-builder `beforePack` hook, so it covers EVERY
 * target. It used to be a step on the `dist:win:nsis` npm script only, which is
 * exactly how macOS shipped a DMG with no engine at all: `dist:mac:dmg` never
 * called it and nothing else noticed.
 *
 * The runtime is platform- AND arch-specific (it contains native binaries), so
 * a build for one target must never be allowed to ship another's tree. The
 * desktop enforces the same match at runtime via runtime-ready.json; failing
 * here turns a silent unusable install into a loud build error.
 */

const fs = require('node:fs')
const path = require('node:path')

/** Engine tree shipped via extraResources. */
const RUNTIME_DIR = path.join(__dirname, '..', 'build', 'engine-runtime')

/** electron-builder's Arch enum, which the hook context reports numerically. */
const ARCH_NAMES = ['ia32', 'x64', 'armv7l', 'arm64', 'universal']

function archName(arch) {
  if (typeof arch === 'string') return arch
  if (typeof arch === 'number' && ARCH_NAMES[arch]) return ARCH_NAMES[arch]
  return null
}

function exists(p) {
  try {
    fs.statSync(p)
    return true
  } catch {
    return false
  }
}

function buildHint(platform, arch) {
  const target = [platform, arch].filter(Boolean).join('-')
  return (
    `Build it ON a ${platform || 'matching'} host (the runtime carries native binaries):\n` +
    `  node scripts/build-engine-runtime.mjs --out-dir apps/work4you/build/engine-runtime\n` +
    `  (run from the wayne-agent/ root)\n` +
    `Target needed: ${target || '(unknown)'}`
  )
}

/**
 * @param {string} platform  'win32' | 'darwin' | 'linux'
 * @param {string|number|null} arch  electron-builder Arch enum or a Node arch name
 * @throws {Error} when the shipped tree is missing or targets another platform
 */
function assertEngineRuntime(platform, arch) {
  const wanted = archName(arch)

  if (!exists(path.join(RUNTIME_DIR, 'pyproject.toml'))) {
    throw new Error(
      `Engine runtime missing at ${RUNTIME_DIR}.\n${buildHint(platform, wanted)}`
    )
  }

  const markerPath = path.join(RUNTIME_DIR, 'runtime-ready.json')
  if (!exists(markerPath)) {
    throw new Error(
      `Engine tree at ${RUNTIME_DIR} has no runtime-ready.json — it is a ` +
        `source-only build, so first launch would run uv sync on the user's ` +
        `machine.\n${buildHint(platform, wanted)}`
    )
  }

  let marker
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
  } catch (err) {
    throw new Error(`Unreadable runtime-ready.json at ${markerPath}: ${err.message}`)
  }

  if (platform && marker.platform !== platform) {
    throw new Error(
      `Engine runtime is for ${marker.platform}-${marker.arch} but this build ` +
        `targets ${platform}-${wanted || '?'}. The desktop rejects a ` +
        `mismatched runtime at startup, so shipping it would strand every ` +
        `user on uv sync.\n${buildHint(platform, wanted)}`
    )
  }

  if (wanted && wanted !== 'universal' && marker.arch !== wanted) {
    throw new Error(
      `Engine runtime is for ${marker.platform}-${marker.arch} but this build ` +
        `targets ${platform}-${wanted}.\n${buildHint(platform, wanted)}`
    )
  }

  if (wanted === 'universal') {
    throw new Error(
      'Universal builds would need a runtime per architecture; build one ' +
        'target at a time (arm64 / x64).'
    )
  }

  // A tree can carry the marker and still be unusable if the venv never synced.
  const venvPython =
    marker.platform === 'win32'
      ? path.join(RUNTIME_DIR, '.venv', 'Scripts', 'python.exe')
      : path.join(RUNTIME_DIR, '.venv', 'bin', 'python')
  if (!exists(venvPython)) {
    throw new Error(
      `Engine runtime has no interpreter at ${venvPython} — the venv was ` +
        `never synced.\n${buildHint(platform, wanted)}`
    )
  }

  return { runtimeDir: RUNTIME_DIR, marker }
}

module.exports = { assertEngineRuntime, RUNTIME_DIR }

// Standalone use: validate the tree for the host platform.
if (require.main === module) {
  try {
    const { marker } = assertEngineRuntime(process.platform, process.arch)
    console.log(
      `[assert-engine-runtime] ready: ${RUNTIME_DIR} (${marker.platform}-${marker.arch}, extra=${marker.extra})`
    )
  } catch (err) {
    console.error(`[assert-engine-runtime] ${err.message}`)
    process.exit(1)
  }
}
