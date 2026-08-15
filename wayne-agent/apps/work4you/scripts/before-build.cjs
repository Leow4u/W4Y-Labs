/**
 * Desktop bundles ship precompiled renderer assets. Returning false here tells
 * electron-builder to skip the node_modules collector/install step, which
 * avoids workspace dependency graph explosions and keeps packaging
 * deterministic across environments. The Work4You engine (CPython + .venv)
 * ships as an extraResources DIRECTORY (`engine/`), written natively by the
 * installer, and is seeded into the user's engine root with an OS-native copy
 * on first launch — no uv sync on the user's machine. See `electron/main.cjs`.
 */
module.exports = async function beforeBuild() {
  return false
}
