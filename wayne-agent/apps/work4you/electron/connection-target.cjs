/**
 * Work4You connection target — brain (Fly) + body (Electron) model.
 *
 * Packaged product: brain runs on the tenant Fly VM; the Electron shell is the
 * PC body (folder, git, PTY). Dev builds can still spawn a local Python brain
 * when W4Y_ALLOW_LOCAL_ENGINE=1.
 *
 * Replaces scattered `cloud-body` special cases with one resolver.
 */
'use strict'

/** @typedef {'fly' | 'local' | 'remote'} BrainKind */
/** @typedef {'electron' | 'none'} BodyKind */

/**
 * @typedef {object} ConnectionTarget
 * @property {BrainKind} brain
 * @property {BodyKind} body
 * @property {'cloud' | 'local' | 'remote'} authMode
 * @property {string} mode Legacy HermesConnection.mode — `cloud-body` for packaged Fly.
 * @property {string} source
 */

/**
 * @param {{ isPackaged?: boolean, allowLocalEngine?: boolean }} [opts]
 * @returns {boolean}
 */
function localEngineDisabled(opts = {}) {
  const isPackaged = Boolean(opts.isPackaged)
  const allowLocal = Boolean(opts.allowLocalEngine)
  return isPackaged && !allowLocal
}

/**
 * @param {boolean} packaged
 * @param {boolean} [allowLocalEngine]
 * @returns {ConnectionTarget}
 */
function resolvePackagedTarget(packaged, allowLocalEngine = false) {
  if (packaged && !allowLocalEngine) {
    return {
      brain: 'fly',
      body: 'electron',
      authMode: 'cloud',
      mode: 'cloud-body',
      source: 'cloud-body'
    }
  }

  return {
    brain: 'local',
    body: 'none',
    authMode: 'local',
    mode: 'local',
    source: 'local'
  }
}

/**
 * @param {{ mode?: string, brain?: string } | null | undefined} connection
 * @returns {boolean}
 */
function isFlyBrainConnection(connection) {
  if (!connection || typeof connection !== 'object') {
    return false
  }

  if (connection.brain === 'fly') {
    return true
  }

  return connection.mode === 'cloud-body'
}

/**
 * Build the HermesConnection-shaped descriptor for packaged Fly brain.
 *
 * @param {{ logs?: string[], windowState?: Record<string, unknown> }} [extras]
 * @returns {Record<string, unknown>}
 */
function buildFlyBrainConnection(extras = {}) {
  const target = resolvePackagedTarget(true, false)

  return {
    baseUrl: '',
    mode: target.mode,
    brain: target.brain,
    body: target.body,
    source: target.source,
    authMode: target.authMode,
    token: '',
    wsUrl: '',
    logs: extras.logs || [],
    ...(extras.windowState || {})
  }
}

module.exports = {
  buildFlyBrainConnection,
  isFlyBrainConnection,
  localEngineDisabled,
  resolvePackagedTarget
}
