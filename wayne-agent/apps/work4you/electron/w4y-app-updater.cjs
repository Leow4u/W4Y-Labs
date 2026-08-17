/**
 * w4y-app-updater.cjs — Casca (Electron shell) auto-updater for Work4You.
 *
 * Wraps electron-updater with the generic GCS feed
 * (https://storage.googleapis.com/w4y-engine-dist/).
 *
 * API surface expected by main.cjs:
 *   w4yAppUpdater.check()            → Promise<DesktopUpdateStatus>
 *   w4yAppUpdater.apply(emitFn)      → Promise<DesktopUpdateApplyResult>
 *   w4yAppUpdater.isAvailable()      → boolean (electron-updater loaded OK)
 *
 * Design decisions:
 *   - autoDownload = false  → user always triggers via the Update chip.
 *   - autoInstallOnAppQuit = false → we call quitAndInstall explicitly.
 *   - fail-open: if electron-updater is missing (dev checkout), exports no-op
 *     stubs so non-packaged dev mode is unaffected.
 *   - Progress events are emitted on `hermes:updates:progress` via the
 *     caller-supplied `emitFn` (same shape as git-based updates).
 *
 * Blocked on infra (leave TODOs as-is until resolved):
 *   - GCS bucket gs://w4y-engine-dist must be public-read and contain
 *     latest.yml + Work4You-<version>-win-x64.exe + blockmap.
 *   - Code-signing cert must be configured in GitHub Actions / CI before
 *     building the installer (signAndEditExecutable: true in package.json).
 */

'use strict'

const https = require('node:https')
const path = require('node:path')
const { app, session } = require('electron')
const w4yWayne = require('./w4y-wayne-resolve.cjs')
const {
  resolvePlatformRoot,
  resolveSharedEngineRoot
} = require('./w4y-home.cjs')

// TODO: configure GCS bucket → gs://w4y-engine-dist/  (public read, objects world-readable)
// The electron-updater generic provider reads: <feedUrl>/latest.yml on Windows,
// <feedUrl>/latest-mac.yml on macOS, <feedUrl>/latest-linux.yml on Linux.
// electron-builder writes this file during `npm run dist` when build.publish is set.
const FEED_URL = process.env.W4Y_UPDATE_FEED_URL || 'https://storage.googleapis.com/w4y-engine-dist/'
const LATEST_YML_URL = `${FEED_URL.replace(/\/?$/, '/')}latest.yml`

let autoUpdater = null
let updaterReady = false
let semverGt = null

try {
  // electron-updater is in dependencies (not devDependencies) so it ships in
  // the packaged asar. In a raw git dev run it may be missing from node_modules
  // if the user never ran npm install with this dep — fail-open.
  try {
    ;({ autoUpdater } = require('electron-updater'))
  } catch {
    const rp = process.resourcesPath
    if (!rp) throw new Error('electron-updater: not found and no resourcesPath fallback')
    ;({ autoUpdater } = require(path.join(rp, 'native-deps', 'vendor', 'node_modules', 'electron-updater')))
  }

  try {
    ;({ gt: semverGt } = require('semver'))
  } catch {
    try {
      const rp = process.resourcesPath
      ;({ gt: semverGt } = require(path.join(rp, 'native-deps', 'vendor', 'node_modules', 'semver')))
    } catch {
      semverGt = null
    }
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  // Keep electron-updater quiet in the main process log; we emit our own
  // structured progress events via emitFn / hermes:updates:progress.
  autoUpdater.logger = null

  // Generic provider is configured via build.publish in package.json, but we
  // also set it programmatically so the module works even when electron-builder's
  // build metadata isn't embedded (e.g. a plain `electron .` dev run).
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: FEED_URL,
    // Channel tracks the 1.x train for com.work4you.app, the only Electron app
    // publishing here. Never point a second app with a different appId at this
    // feed: they would share one latest.yml and the "update" would install a
    // second Work4You beside the first instead of replacing it.
    channel: 'latest'
  })

  updaterReady = true
} catch (err) {
  console.warn('[w4y-updater] electron-updater not available (dev checkout?); update chip will use git path.', err && err.message)
}

/**
 * True when remote is a newer semver than current.
 * Falls back to string inequality only when semver is unavailable.
 */
function isRemoteNewer(remoteVersion, currentVersion) {
  if (!remoteVersion || !currentVersion) return false
  const remote = String(remoteVersion).trim().replace(/^v/i, '')
  const current = String(currentVersion).trim().replace(/^v/i, '')
  if (!remote || !current) return false
  if (typeof semverGt === 'function') {
    try {
      return Boolean(semverGt(remote, current))
    } catch {
      // Invalid semver — fall through to string compare.
    }
  }
  return remote !== current
}

/**
 * Direct fetch of latest.yml when electron-updater's check rejects/returns null.
 * Avoids fail-open "no update" when the feed is fine but the updater threw.
 */
function fetchRemoteCascaVersion() {
  return new Promise((resolve, reject) => {
    const url = `${LATEST_YML_URL}?noCache=${Date.now().toString(32)}`
    https
      .get(url, res => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume()
          reject(new Error(`latest.yml HTTP ${res.statusCode}`))
          return
        }
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8')
            const match = body.match(/^\s*version:\s*['"]?([^\s'"]+)/m)
            if (!match) {
              reject(new Error('latest.yml missing version'))
              return
            }
            resolve(match[1])
          } catch (err) {
            reject(err)
          }
        })
      })
      .on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// check()
// ---------------------------------------------------------------------------

/**
 * Unified update check: casca (Electron shell via electron-updater) + motor
 * (Python engine via GCS latest.json).
 *
 * Returns DesktopUpdateStatus — same shape as the git-based checkUpdates().
 * If either casca or motor has a newer version available, `updateAvailable`
 * and `behind: 1` are set so the chip in account-menu appears.
 *
 * Extra fields (not part of DesktopUpdateStatus interface but carried through
 * as opaque metadata for the apply() path):
 *   _cascAvailable: boolean
 *   _motorAvailable: boolean
 *   _motorRemote: object | null   — remote manifest from latest.json
 */
async function check() {
  if (!updaterReady) {
    return {
      supported: false,
      reason: 'updater-unavailable',
      message: 'electron-updater não disponível (build de desenvolvimento).',
      fetchedAt: Date.now()
    }
  }

  const currentVersion = app.getVersion()
  // Motor + marker live at the platform root (shared across accounts). Never use
  // resolveWayneHome() here — after login that is accounts/<tenantId>, which has
  // no engine and made checkEngineUpdate report notInstalled (no chip).
  let platformRoot
  try { platformRoot = resolvePlatformRoot() } catch { platformRoot = null }

  // Run both checks concurrently so the combined latency is max(t_casca, t_motor).
  const [cascSettled, motorSettled] = await Promise.allSettled([
    autoUpdater.checkForUpdates(),
    platformRoot ? w4yWayne.checkEngineUpdate(platformRoot) : Promise.resolve({ available: false })
  ])

  // --- Casca ---
  // Always decide with our own semver. electron-updater's `isUpdateAvailable`
  // is often a false negative on unsigned Windows builds (publisherName /
  // signature mismatch) even when latest.yml is clearly newer — and when it
  // returns updateInfo.version the old code skipped the latest.yml fallback,
  // so the chip never appeared (incident 14/08).
  let cascAvailable = false
  let cascTargetVersion = null
  let cascError = null

  if (cascSettled.status === 'fulfilled') {
    const result = cascSettled.value
    if (result && result.updateInfo) {
      cascTargetVersion = result.updateInfo.version || null
      cascAvailable = isRemoteNewer(cascTargetVersion, currentVersion)
    }
  } else {
    cascError = cascSettled.reason && cascSettled.reason.message
      ? cascSettled.reason.message
      : String(cascSettled.reason || 'casca-check-failed')
    console.warn('[w4y-updater] electron-updater check failed; trying latest.yml fallback:', cascError)
  }

  // Fallback: direct latest.yml whenever casca still looks current. Covers
  // rejected checks, null updateInfo, and false negatives above.
  if (!cascAvailable) {
    try {
      const remoteVersion = await fetchRemoteCascaVersion()
      if (remoteVersion) {
        cascTargetVersion = cascTargetVersion || remoteVersion
        if (isRemoteNewer(remoteVersion, currentVersion)) {
          cascAvailable = true
          cascError = null
        }
      }
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      cascError = cascError || message
      console.warn('[w4y-updater] latest.yml fallback failed:', message)
    }
  }

  // --- Motor ---
  let motorAvailable = false
  let motorRemote = null
  if (motorSettled.status === 'fulfilled') {
    const res = motorSettled.value
    motorAvailable = Boolean(res.available)
    motorRemote = res.remote || null
  }

  const updateAvailable = cascAvailable || motorAvailable

  // Human-readable version label shown in the update overlay.
  let targetSha
  if (cascAvailable && motorAvailable) {
    targetSha = `casca v${cascTargetVersion} + motor v${motorRemote?.version || '?'}`
  } else if (cascAvailable) {
    targetSha = `v${cascTargetVersion}`
  } else if (motorAvailable) {
    targetSha = `motor v${motorRemote?.version || '?'}`
  }

  return {
    supported: true,
    updateAvailable,
    behind: updateAvailable ? 1 : 0,
    currentSha: `v${currentVersion}`,
    targetSha,
    commits: [],
    fetchedAt: Date.now(),
    // Surface check failures so About / overlay can show "can't reach" instead
    // of silently claiming the app is up to date.
    ...(cascError && !updateAvailable ? { error: 'check-failed', message: cascError } : {}),
    // Opaque metadata consumed by apply() — not part of DesktopUpdateStatus.
    _cascAvailable: cascAvailable,
    _motorAvailable: motorAvailable,
    _motorRemote: motorRemote
  }
}

// ---------------------------------------------------------------------------
// apply()
// ---------------------------------------------------------------------------

/**
 * Apply the available update(s): motor (Python engine) and/or casca (Electron shell).
 *
 * Order of operations:
 *   1. Re-check what needs updating (fresh check, avoids stale chip state).
 *   2. If motor update is pending: stop backend → download ZIP → extract →
 *      uv sync → write engine-version.json.
 *   3. If casca update is also pending: quitAndInstall (NSIS). The app
 *      relaunches automatically and picks up the new engine.
 *   4. If ONLY motor was updated: app.relaunch() + app.exit(0) so the new
 *      engine process starts fresh without Windows file-lock conflicts.
 *
 * @param {(payload: object) => void} emitProgress — called with DesktopUpdateProgress
 *   shape objects; forwarded to hermes:updates:progress via BrowserWindow.webContents.
 * @param {{
 *   stopBackend?: () => Promise<void>,   — kills the Python backend; caller provides
 *   engineRoot?: string,                 — absolute path to wayne-agent dir
 *   wayneHome?: string                   — absolute path to wayne home (%LOCALAPPDATA%\wayne)
 * }} opts
 * @returns {Promise<DesktopUpdateApplyResult>}
 */
async function apply(emitProgress, opts = {}) {
  if (!updaterReady) {
    return {
      ok: false,
      error: 'updater-unavailable',
      message: 'electron-updater não disponível (build de desenvolvimento).',
      manual: true,
      command: 'Baixe o instalador mais recente em work4you.ai/baixar'
    }
  }

  const emit = (stage, message, percent = null, error = null) => {
    try {
      emitProgress({ stage, message, percent, error, at: Date.now() })
    } catch {
      void 0
    }
  }

  emit('prepare', 'Verificando atualizações…')

  // Fresh check so apply() is always acting on current remote state, not a
  // potentially stale chip result.
  let status
  try {
    status = await check()
  } catch (err) {
    const message = err && err.message ? err.message : String(err)
    emit('error', `Falha ao verificar atualização: ${message}`, null, 'check-failed')
    return { ok: false, error: 'check-failed', message }
  }

  const cascAvailable = Boolean(status._cascAvailable)
  const motorAvailable = Boolean(status._motorAvailable)
  const motorRemote = status._motorRemote || null

  // Nothing to do.
  if (!cascAvailable && !motorAvailable) {
    emit('idle', 'Work4You já está atualizado.', 100)
    return { ok: true, message: 'Já está na versão mais recente.' }
  }

  // ------------------------------------------------------------------
  // Step 1: Motor (Python engine) update — must come before casca so the
  // new engine is in place when quitAndInstall relaunches.
  // ------------------------------------------------------------------
  if (motorAvailable && motorRemote) {
    emit('prepare', 'Parando motor Work4You para atualização…')

    // Stop the backend so Windows file locks on .pyd / python.exe are released.
    if (typeof opts.stopBackend === 'function') {
      try {
        await opts.stopBackend()
      } catch {
        // Non-fatal: extraction may still succeed if the process died.
      }
    }

    const platformHome = opts.wayneHome || (() => {
      try { return resolvePlatformRoot() } catch { return null }
    })()
    const engineRoot = opts.engineRoot || (platformHome ? resolveSharedEngineRoot(platformHome) : null)

    if (!engineRoot || !platformHome) {
      const message = 'Não foi possível determinar o diretório do motor Work4You.'
      emit('error', message, null, 'engine-path-error')
      return { ok: false, error: 'engine-path-error', message }
    }

    emit('fetch', `Baixando motor v${motorRemote.version || 'latest'}…`, 0)
    try {
      await w4yWayne.applyEngineUpdate(engineRoot, platformHome, {
        remote: motorRemote,
        onProgress: (msg, pct) => {
          let stage = 'fetch'
          if (pct === null) {
            if (/uv sync|dependências Python/i.test(msg)) stage = 'pydeps'
            else if (/Motor pronto|runtime pré-instalado/i.test(msg)) stage = 'update'
            else if (/Extraindo|Aplicando ficheiros|extraí/i.test(msg)) stage = 'update'
          }
          emit(stage, msg, pct)
        }
      })
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      emit('error', `Falha ao atualizar o motor: ${message}`, null, 'motor-apply-failed')
      return { ok: false, error: 'motor-apply-failed', message }
    }

    // Motor updated successfully.
    if (!cascAvailable) {
      // Motor-only update: relaunch the entire app so the new engine starts fresh.
      // Flush cookies first — a hard process exit skips Chromium teardown, and
      // without a flush the tenant jar can vanish across relaunch. That left
      // users on "A verificar sessão…" after a chip update (cookies gone, heal slow).
      emit('restart', 'Motor atualizado! Reiniciando Work4You…', 100)
      setImmediate(() => {
        void (async () => {
          try {
            await session.defaultSession.cookies.flushStore()
          } catch {
            /* best effort — still relaunch */
          }
          try {
            app.relaunch()
            app.exit(0)
          } catch {
            // If relaunch fails (unusual), the user will need to restart manually.
          }
        })()
      })
      // Resolve with handedOff so the renderer keeps the "Restarting…" view.
      return { ok: true, handedOff: true }
    }

    // Both motor and casca need updating — continue to casca below.
    emit('prepare', 'Motor atualizado. Iniciando atualização da casca…')
  }

  // ------------------------------------------------------------------
  // Step 2: Casca (Electron shell) update via electron-updater.
  // ------------------------------------------------------------------
  return new Promise(resolve => {
    let downloadStarted = false

    const onProgress = progressObj => {
      const pct = typeof progressObj.percent === 'number' ? Math.round(progressObj.percent) : null
      emit('fetch', `Baixando atualização da casca… ${pct !== null ? pct + '%' : ''}`, pct)
    }

    const onDownloaded = () => {
      cleanup()
      emit('restart', 'Instalando Work4You… uma janela de progresso vai abrir.', 100)
      // isSilent=false. The installer writes ~700 MB across 13k files because the
      // engine ships inside it, which takes minutes on a normal disk. Silent (/S)
      // means the app closes and NOTHING is on screen for that whole time, so the
      // user concludes it died and kills the installer mid-write (17/08). The
      // oneClick progress window needs no interaction and closes itself.
      //
      // It also buys the relaunch: silent + --force-run reaches the app only
      // through ExecShellAsUser from a windowless installer, which is what failed
      // on 17/08; visible takes the ${ifNot} ${Silent} branch instead.
      setImmediate(() => {
        try {
          autoUpdater.quitAndInstall(false, true)
        } catch (err) {
          resolve({ ok: false, error: 'install-failed', message: err && err.message })
        }
      })
      // The app will quit — resolve with handedOff so the renderer holds the
      // "Restarting…" view rather than trying to close the overlay itself.
      resolve({ ok: true, handedOff: true })
    }

    const onError = err => {
      cleanup()
      const message = err && err.message ? err.message : String(err)
      emit('error', `Falha na atualização da casca: ${message}`, null, 'apply-failed')
      resolve({ ok: false, error: 'apply-failed', message })
    }

    function cleanup() {
      autoUpdater.removeListener('download-progress', onProgress)
      autoUpdater.removeListener('update-downloaded', onDownloaded)
      autoUpdater.removeListener('error', onError)
    }

    autoUpdater.on('download-progress', onProgress)
    autoUpdater.once('update-downloaded', onDownloaded)
    autoUpdater.once('error', onError)

    emit('fetch', 'Iniciando download da casca…', 0)
    downloadStarted = true

    autoUpdater.downloadUpdate().catch(err => {
      if (downloadStarted) {
        cleanup()
        const message = err && err.message ? err.message : String(err)
        emit('error', `Falha no download da casca: ${message}`, null, 'apply-failed')
        resolve({ ok: false, error: 'apply-failed', message })
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  isAvailable: () => updaterReady,
  check,
  apply
}
