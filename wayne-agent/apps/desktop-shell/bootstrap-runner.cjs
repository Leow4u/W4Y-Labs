'use strict'

/**
 * bootstrap-runner.cjs
 *
 * Drives the Work4You desktop's first-launch install of the Wayne agent by
 * spawning scripts/install.ps1 stage-by-stage and streaming progress events
 * back to the renderer.
 *
 * Wired from main.cjs:
 *   const { runBootstrap } = require('./bootstrap-runner.cjs')
 *   const result = await runBootstrap({
 *     installStamp,        // build-time stamp (may be null in dev); any of
 *                          // {commit, tag, version, branch} pins the checkout
 *     activeRoot,          // active agent checkout root
 *     sourceRepoRoot,      // dev checkout root (for scripts/install.ps1 lookup)
 *     packagedScriptDir,   // dir with the packaged install script, e.g.
 *                          // path.join(process.resourcesPath, 'scripts')
 *     installScriptUrl,    // optional remote URL override (else env
 *                          // W4Y_INSTALL_PS1_URL); empty = no remote fallback
 *     wayneHome,           // WAYNE_HOME
 *     logRoot,             // WAYNE_HOME/logs
 *     onEvent: ev => {...} // event sink (sender.send or similar)
 *   })
 *
 * Emits events with shape:
 *   { type: 'manifest',  stages: [{name, title, category, needs_user_input}, ...] }
 *   { type: 'stage',     name, state: 'running'|'succeeded'|'skipped'|'failed',
 *                        json?, durationMs?, error? }
 *   { type: 'log',       stage?, line, stream: 'stdout'|'stderr' } // raw line from install.ps1
 *   { type: 'complete',  marker: <written marker payload> }
 *   { type: 'failed',    stage?, error }     // bootstrap aborted
 *
 * Resolves with the same shape as the final 'complete' or 'failed' event so
 * callers can await either way.
 *
 * Install-script resolution ladder (see resolveInstallScript):
 *   1. dev checkout        <sourceRepoRoot>/scripts/install.ps1
 *   2. packaged copy       <packagedScriptDir>/install.ps1
 *   3. bootstrap cache     <wayneHome>/bootstrap-cache/install-<label>.ps1
 *   4. remote download     installScriptUrl || $W4Y_INSTALL_PS1_URL (no
 *                          hardcoded URL; unset = this rung is skipped)
 *   5. installed agent     <wayneHome>/wayne-agent/scripts/install.ps1
 *   6. clear error (never a third-party default URL)
 */

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const https = require('node:https')
const { spawn } = require('node:child_process')

const IS_WINDOWS = process.platform === 'win32'

function hiddenWindowsChildOptions(options = {}) {
  if (!IS_WINDOWS || Object.prototype.hasOwnProperty.call(options, 'windowsHide')) {
    return options
  }
  return { ...options, windowsHide: true }
}

// A stamp may pin a commit SHA, a release tag, a ZIP version label, or a
// branch. Whichever is present becomes the cache label; it must be safe to
// embed in a filename.
const STAMP_LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/**
 * Best identifying label of an install stamp, for cache filenames and logs.
 * Order matches install.ps1's own pin precedence (Commit > Tag > Branch),
 * with `version` accepted as a tag-like ZIP label.
 * Returns null when the stamp is absent or the label is not filename-safe.
 */
function stampLabel(installStamp) {
  if (!installStamp) return null
  const raw = installStamp.commit || installStamp.tag || installStamp.version || installStamp.branch || null
  if (!raw || !STAMP_LABEL_RE.test(String(raw))) return null
  return String(raw)
}

// Stages flagged needs_user_input=true in the manifest are skipped by the
// runner (passed -NonInteractive to install.ps1, which the install script
// itself handles by emitting skipped=true frames). The renderer / onboarding
// overlay takes over for those concerns (API keys, model, persona, gateway).
// We let install.ps1's own -NonInteractive logic drive this rather than
// filtering client-side -- single source of truth.

// ---------------------------------------------------------------------------
// install.ps1 source resolution
// ---------------------------------------------------------------------------

function installScriptName() {
  return process.platform === 'win32' ? 'install.ps1' : 'install.sh'
}

function installScriptKind() {
  return process.platform === 'win32' ? 'powershell' : 'posix'
}

function resolveLocalInstallScript(sourceRepoRoot) {
  if (!sourceRepoRoot) return null
  const candidate = path.join(sourceRepoRoot, 'scripts', installScriptName())
  try {
    fs.accessSync(candidate, fs.constants.R_OK)
    return candidate
  } catch {
    return null
  }
}

// The install script shipped inside the packaged app (electron-builder
// extraResources copies scripts/install.ps1 to <resources>/scripts/). This is
// the preferred packaged-build source: no network, always version-matched to
// the .exe that shipped it.
function resolvePackagedInstallScript(packagedScriptDir) {
  if (!packagedScriptDir) return null
  const candidate = path.join(packagedScriptDir, installScriptName())
  try {
    fs.accessSync(candidate, fs.constants.R_OK)
    return candidate
  } catch {
    return null
  }
}

function bootstrapCacheDir(wayneHome) {
  return path.join(wayneHome, 'bootstrap-cache')
}

// The install.sh / install.ps1 that ships inside the already-installed agent
// checkout under $WAYNE_HOME/wayne-agent. Used as a last-resort fallback when
// neither a packaged copy nor a configured remote URL is available.
function installedAgentInstallScript(wayneHome) {
  if (!wayneHome) return null
  const candidate = path.join(wayneHome, 'wayne-agent', 'scripts', installScriptName())
  try {
    fs.accessSync(candidate, fs.constants.R_OK)
    return candidate
  } catch {
    return null
  }
}

function cachedScriptPath(wayneHome, label) {
  return path.join(bootstrapCacheDir(wayneHome), `install-${label}.${process.platform === 'win32' ? 'ps1' : 'sh'}`)
}

/**
 * Resolve the remote install-script URL. No hardcoded default: an explicit
 * option wins, then the W4Y_INSTALL_PS1_URL environment variable. Returns
 * null when neither is configured (the remote rung is then skipped and the
 * resolver falls through to the installed-agent copy / clear error).
 */
function resolveInstallScriptUrl({ installScriptUrl, env = process.env } = {}) {
  const url = installScriptUrl || env.W4Y_INSTALL_PS1_URL || ''
  return url.trim() ? url.trim() : null
}

function downloadInstallScript(url, destPath) {
  const scriptName = installScriptName()
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    const tmpPath = destPath + '.tmp'
    const out = fs.createWriteStream(tmpPath)
    https
      .get(url, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // Follow a single redirect defensively.
          out.close()
          fs.unlinkSync(tmpPath)
          https
            .get(res.headers.location, res2 => {
              if (res2.statusCode !== 200) {
                reject(
                  new Error(
                    `Failed to download ${scriptName}: HTTP ${res2.statusCode} from redirect ${res.headers.location}`
                  )
                )
                return
              }
              const out2 = fs.createWriteStream(tmpPath)
              res2.pipe(out2)
              out2.on('finish', () => {
                out2.close()
                fs.renameSync(tmpPath, destPath)
                resolve(destPath)
              })
              out2.on('error', reject)
            })
            .on('error', reject)
          return
        }
        if (res.statusCode !== 200) {
          out.close()
          try {
            fs.unlinkSync(tmpPath)
          } catch {
            void 0
          }
          reject(new Error(`Failed to download ${scriptName}: HTTP ${res.statusCode} from ${url}`))
          return
        }
        res.pipe(out)
        out.on('finish', () => {
          out.close()
          fs.renameSync(tmpPath, destPath)
          resolve(destPath)
        })
        out.on('error', err => {
          try {
            fs.unlinkSync(tmpPath)
          } catch {
            void 0
          }
          reject(err)
        })
      })
      .on('error', err => {
        try {
          fs.unlinkSync(tmpPath)
        } catch {
          void 0
        }
        reject(err)
      })
  })
}

async function resolveInstallScript({
  installStamp,
  sourceRepoRoot,
  packagedScriptDir,
  installScriptUrl,
  wayneHome,
  emit,
  env = process.env,
  _download = downloadInstallScript
}) {
  // 1. Dev shortcut: prefer a local checkout's installer so we can iterate
  //    without repackaging. sourceRepoRoot comes from main.cjs.
  const localScript = resolveLocalInstallScript(sourceRepoRoot)
  if (localScript) {
    emit({ type: 'log', line: `[bootstrap] using local ${installScriptName()} at ${localScript}` })
    return { path: localScript, source: 'local', kind: installScriptKind() }
  }

  // 2. Packaged copy: the script shipped with the app itself.
  const packagedScript = resolvePackagedInstallScript(packagedScriptDir)
  if (packagedScript) {
    emit({ type: 'log', line: `[bootstrap] using packaged ${installScriptName()} at ${packagedScript}` })
    return { path: packagedScript, source: 'packaged', kind: installScriptKind() }
  }

  const label = stampLabel(installStamp)

  // 3. Cache from a previous remote fetch (keyed by the stamp label).
  if (label) {
    const cached = cachedScriptPath(wayneHome, label)
    try {
      await fsp.access(cached, fs.constants.R_OK)
      emit({
        type: 'log',
        line: `[bootstrap] using cached ${installScriptName()} for ${label.slice(0, 12)}`
      })
      return { path: cached, source: 'cache', label, kind: installScriptKind() }
    } catch {
      // not cached; keep going
    }
  }

  // 4. Remote download -- only when a URL was explicitly configured. There is
  //    deliberately NO hardcoded default URL.
  const url = resolveInstallScriptUrl({ installScriptUrl, env })
  if (url) {
    const dest = cachedScriptPath(wayneHome, label || 'remote')
    emit({ type: 'log', line: `[bootstrap] fetching ${installScriptName()} from ${url}` })
    try {
      await _download(url, dest)
      emit({ type: 'log', line: `[bootstrap] saved to ${dest}` })
      return { path: dest, source: 'download', label: label || null, kind: installScriptKind() }
    } catch (err) {
      emit({
        type: 'log',
        line: `[bootstrap] remote fetch failed (${err.message}); trying installed agent copy`
      })
      // fall through to the installed-agent rung
    }
  }

  // 5. Last resort: the installer that ships inside an already-installed
  //    agent checkout (repair / partial-install scenarios).
  const installed = installedAgentInstallScript(wayneHome)
  if (installed) {
    emit({
      type: 'log',
      line: `[bootstrap] using installed agent ${installScriptName()} at ${installed}`
    })
    return { path: installed, source: 'installed-agent', label: label || null, kind: installScriptKind() }
  }

  // 6. Nothing worked -- fail with an actionable message.
  throw new Error(
    `Cannot resolve ${installScriptName()}: not found in a dev checkout, not shipped in the app package, ` +
      'no W4Y_INSTALL_PS1_URL configured, and no installed agent copy under WAYNE_HOME. ' +
      `Repackage the app with scripts/${installScriptName()} or set W4Y_INSTALL_PS1_URL.`
  )
}

// ---------------------------------------------------------------------------
// powershell wrapper
// ---------------------------------------------------------------------------

// Canonical PowerShell 5.1 location under a Windows root (%SystemRoot%).
function powershellUnderRoot(root) {
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

// Resolve the PowerShell interpreter to spawn.
//
// Spawning bare 'powershell.exe' trusts PATH to contain
// %SystemRoot%\System32\WindowsPowerShell\v1.0. On machines whose PATH was
// trimmed, truncated, or stored as a non-expanding REG_SZ (so %SystemRoot%
// never expands), that lookup fails and the spawn dies with ENOENT before
// install.ps1 ever runs — the installer stalls at "0 of 0 steps". Resolve by
// absolute path first, then fall back to PATH (powershell 5.1, then pwsh 7),
// then a bare name as a last resort.
function resolveWindowsPowerShell() {
  for (const v of ['SystemRoot', 'windir']) {
    const root = process.env[v]
    if (root) {
      const candidate = powershellUnderRoot(root)
      try {
        if (fs.statSync(candidate).isFile()) return candidate
      } catch {
        void 0
      }
    }
  }
  const pathDirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean)
  for (const exe of ['powershell.exe', 'pwsh.exe']) {
    for (const dir of pathDirs) {
      const candidate = path.join(dir, exe)
      try {
        if (fs.statSync(candidate).isFile()) return candidate
      } catch {
        void 0
      }
    }
  }
  return 'powershell.exe'
}

function spawnPowerShell(scriptPath, args, { emit, stageName, abortSignal, wayneHome } = {}) {
  return new Promise((resolve, reject) => {
    const ps = process.platform === 'win32' ? resolveWindowsPowerShell() : 'pwsh'
    const fullArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args]

    const child = spawn(
      ps,
      fullArgs,
      hiddenWindowsChildOptions({
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Pass WAYNE_HOME through so install.ps1 respects the caller's
          // choice rather than re-computing the default.
          WAYNE_HOME: wayneHome || process.env.WAYNE_HOME || ''
        }
      })
    )

    let stdout = ''
    let stderr = ''
    let killed = false

    const onAbort = () => {
      killed = true
      try {
        child.kill('SIGTERM')
      } catch {
        void 0
      }
    }
    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort()
      } else {
        abortSignal.addEventListener('abort', onAbort, { once: true })
      }
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    // Stream stdout line-by-line so the renderer sees progress in real time.
    let stdoutBuf = ''
    child.stdout.on('data', chunk => {
      stdout += chunk
      stdoutBuf += chunk
      let nl
      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nl).replace(/\r$/, '')
        stdoutBuf = stdoutBuf.slice(nl + 1)
        if (line) emit && emit({ type: 'log', stage: stageName, line, stream: 'stdout' })
      }
    })

    let stderrBuf = ''
    child.stderr.on('data', chunk => {
      stderr += chunk
      stderrBuf += chunk
      let nl
      while ((nl = stderrBuf.indexOf('\n')) !== -1) {
        const line = stderrBuf.slice(0, nl).replace(/\r$/, '')
        stderrBuf = stderrBuf.slice(nl + 1)
        if (line) emit && emit({ type: 'log', stage: stageName, line, stream: 'stderr' })
      }
    })

    child.on('error', err => {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      reject(err)
    })

    child.on('close', (code, signal) => {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      // Flush any trailing bytes
      if (stdoutBuf) emit && emit({ type: 'log', stage: stageName, line: stdoutBuf, stream: 'stdout' })
      if (stderrBuf) emit && emit({ type: 'log', stage: stageName, line: stderrBuf, stream: 'stderr' })
      resolve({ stdout, stderr, code, signal, killed })
    })
  })
}

function spawnBash(scriptPath, args, { emit, stageName, abortSignal, wayneHome } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        WAYNE_HOME: wayneHome || process.env.WAYNE_HOME || ''
      }
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    const onAbort = () => {
      killed = true
      try {
        child.kill('SIGTERM')
      } catch {
        void 0
      }
    }
    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort()
      } else {
        abortSignal.addEventListener('abort', onAbort, { once: true })
      }
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    let stdoutBuf = ''
    child.stdout.on('data', chunk => {
      stdout += chunk
      stdoutBuf += chunk
      let nl
      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nl).replace(/\r$/, '')
        stdoutBuf = stdoutBuf.slice(nl + 1)
        if (line) emit && emit({ type: 'log', stage: stageName, line, stream: 'stdout' })
      }
    })

    let stderrBuf = ''
    child.stderr.on('data', chunk => {
      stderr += chunk
      stderrBuf += chunk
      let nl
      while ((nl = stderrBuf.indexOf('\n')) !== -1) {
        const line = stderrBuf.slice(0, nl).replace(/\r$/, '')
        stderrBuf = stderrBuf.slice(nl + 1)
        if (line) emit && emit({ type: 'log', stage: stageName, line, stream: 'stderr' })
      }
    })

    child.on('error', err => {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      reject(err)
    })

    child.on('close', (code, signal) => {
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      if (stdoutBuf) emit && emit({ type: 'log', stage: stageName, line: stdoutBuf, stream: 'stdout' })
      if (stderrBuf) emit && emit({ type: 'log', stage: stageName, line: stderrBuf, stream: 'stderr' })
      resolve({ stdout, stderr, code, signal, killed })
    })
  })
}

// ---------------------------------------------------------------------------
// Manifest + stage dispatch
// ---------------------------------------------------------------------------

// Build the install.ps1 pin args (-Commit / -Tag / -Branch) from the
// install-stamp so the repository stage lands on the exact ref the app was
// shipped with instead of falling back to install.ps1's default
// ($Branch = "main"). install.ps1's own precedence is Commit > Tag > Branch;
// a ZIP-distributed build pins its version label via -Tag (the ZIP fallback
// in install.ps1 downloads refs/tags/<Tag>.zip).
function buildPinArgs(installStamp) {
  const args = []
  if (installStamp && installStamp.commit) {
    args.push('-Commit', installStamp.commit)
  }
  const tag = installStamp && (installStamp.tag || installStamp.version)
  if (tag) {
    args.push('-Tag', tag)
  }
  if (installStamp && installStamp.branch) {
    args.push('-Branch', installStamp.branch)
  }
  return args
}

function buildPosixPinArgs({ installStamp, activeRoot, wayneHome }) {
  const args = ['--dir', activeRoot, '--wayne-home', wayneHome]
  if (installStamp && installStamp.branch) {
    args.push('--branch', installStamp.branch)
  }
  const tag = installStamp && (installStamp.tag || installStamp.version)
  if (tag) {
    args.push('--tag', tag)
  }
  if (installStamp && installStamp.commit) {
    args.push('--commit', installStamp.commit)
  }
  return args
}

async function fetchManifest({ scriptPath, installerKind, emit, wayneHome, activeRoot, installStamp }) {
  const isPosix = installerKind === 'posix'
  const args = isPosix
    ? ['--manifest', ...buildPosixPinArgs({ installStamp, activeRoot, wayneHome })]
    : ['-Manifest', ...buildPinArgs(installStamp)]
  const result = await (isPosix ? spawnBash : spawnPowerShell)(scriptPath, args, {
    emit,
    stageName: '__manifest__',
    wayneHome
  })
  if (result.code !== 0) {
    throw new Error(
      `${isPosix ? 'install.sh --manifest' : 'install.ps1 -Manifest'} failed: exit ${result.code}\n${result.stderr || result.stdout}`
    )
  }
  // The manifest is the LAST JSON line on stdout (install.ps1 may print
  // banner / info lines first depending on Console.OutputEncoding effects).
  // Find the last line that parses as JSON with a `stages` field.
  const lines = result.stdout.split(/\r?\n/).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i])
      if (parsed && Array.isArray(parsed.stages)) {
        return parsed
      }
    } catch {
      void 0
    }
  }
  throw new Error(
    `${isPosix ? 'install.sh --manifest' : 'install.ps1 -Manifest'} produced no parseable JSON payload\n${result.stdout}`
  )
}

// Parse the JSON result frame from a stage run. The protocol guarantees
// exactly one JSON line per stage in -Json or -Stage mode.
function parseStageResult(stdout) {
  const lines = stdout.split(/\r?\n/).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i])
      if (parsed && typeof parsed.ok === 'boolean' && typeof parsed.stage === 'string') {
        return parsed
      }
    } catch {
      void 0
    }
  }
  return null
}

// `installDir` (0.3.9) targets a tree OTHER than the canonical one, which is
// how the background update installs a new engine while the current one is
// still serving: install.ps1 only kills processes when the target already has
// a `venv\`, so a virgin slot never touches the running engine.
async function runStage({ scriptPath, installerKind, stage, emit, wayneHome, activeRoot, abortSignal, installStamp, installDir }) {
  const startedAt = Date.now()
  emit({ type: 'stage', name: stage.name, state: 'running' })

  const isPosix = installerKind === 'posix'
  const args = isPosix
    ? [
        '--stage',
        stage.name,
        '--non-interactive',
        '--json',
        ...buildPosixPinArgs({ installStamp, activeRoot, wayneHome })
      ]
    : [
        '-Stage',
        stage.name,
        '-NonInteractive',
        '-Json',
        ...(installDir ? ['-InstallDir', installDir] : []),
        ...buildPinArgs(installStamp)
      ]
  const result = await (isPosix ? spawnBash : spawnPowerShell)(scriptPath, args, {
    emit,
    stageName: stage.name,
    abortSignal,
    wayneHome
  })

  const durationMs = Date.now() - startedAt

  if (result.killed) {
    const ev = { type: 'stage', name: stage.name, state: 'failed', durationMs, error: 'cancelled by user' }
    emit(ev)
    return ev
  }

  const json = parseStageResult(result.stdout)

  if (!json) {
    const ev = {
      type: 'stage',
      name: stage.name,
      state: 'failed',
      durationMs,
      error: `${isPosix ? 'install.sh --stage' : 'install.ps1 -Stage'} ${stage.name} produced no JSON result frame (exit=${result.code})`,
      json: null
    }
    emit(ev)
    return ev
  }

  if (json.ok && json.skipped) {
    const ev = { type: 'stage', name: stage.name, state: 'skipped', durationMs, json }
    emit(ev)
    return ev
  }
  if (json.ok) {
    const ev = { type: 'stage', name: stage.name, state: 'succeeded', durationMs, json }
    emit(ev)
    return ev
  }
  const ev = {
    type: 'stage',
    name: stage.name,
    state: 'failed',
    durationMs,
    json,
    error: json.reason || `exit code ${result.code}`
  }
  emit(ev)
  return ev
}

// ---------------------------------------------------------------------------
// Per-run log file
// ---------------------------------------------------------------------------

function openRunLog(logRoot) {
  fs.mkdirSync(logRoot, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(logRoot, `bootstrap-${ts}.log`)
  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  return { path: logPath, stream }
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

async function runBootstrap(opts) {
  const {
    installStamp,
    activeRoot,
    sourceRepoRoot,
    packagedScriptDir,
    installScriptUrl,
    wayneHome,
    logRoot,
    onEvent,
    abortSignal,
    writeMarker // callback to write the bootstrap-complete marker; main.cjs provides
  } = opts

  // Bail before spawning anything if the user already cancelled — otherwise an
  // already-aborted signal would still fetch the manifest (a spawn) before the
  // in-loop abort check fires.
  if (abortSignal && abortSignal.aborted) {
    if (typeof onEvent === 'function') {
      try {
        onEvent({ type: 'failed', error: 'bootstrap cancelled by user' })
      } catch {
        void 0
      }
    }
    return { ok: false, cancelled: true }
  }

  const runLog = openRunLog(logRoot || path.join(wayneHome, 'logs'))

  // Tee every event to the runLog AND the caller's onEvent. This gives us a
  // forensic trail per bootstrap run AND lets the renderer subscribe live.
  const emit = ev => {
    try {
      runLog.stream.write(JSON.stringify(ev) + '\n')
    } catch {
      void 0
    }
    try {
      if (typeof onEvent === 'function') onEvent(ev)
    } catch (err) {
      // Don't let a subscriber bug crash the bootstrap
      runLog.stream.write(`emit error: ${err && err.message}\n`)
    }
  }

  emit({
    type: 'log',
    line:
      `[bootstrap] starting at ${new Date().toISOString()}; ` +
      `activeRoot=${activeRoot}; ` +
      `stamp=${stampLabel(installStamp) || '<none>'}; ` +
      `runLog=${runLog.path}`
  })

  try {
    // 1. Resolve the platform installer.
    const scriptInfo = await resolveInstallScript({
      installStamp,
      sourceRepoRoot,
      packagedScriptDir,
      installScriptUrl,
      wayneHome,
      emit
    })
    const installerKind = scriptInfo.kind || 'powershell'

    // 2. Fetch manifest
    const manifest = await fetchManifest({
      scriptPath: scriptInfo.path,
      installerKind,
      emit,
      wayneHome,
      activeRoot,
      installStamp
    })
    emit({
      type: 'manifest',
      stages: manifest.stages,
      protocolVersion: manifest.protocol_version || manifest.protocolVersion || null
    })

    // 3. Iterate stages in order. Stages flagged needs_user_input are still
    //    invoked -- install.ps1's own -NonInteractive handler in those stages
    //    emits skipped=true. We trust the protocol rather than filtering
    //    client-side.
    for (const stage of manifest.stages) {
      if (abortSignal && abortSignal.aborted) {
        emit({ type: 'failed', error: 'bootstrap cancelled by user' })
        return { ok: false, cancelled: true }
      }
      const ev = await runStage({
        scriptPath: scriptInfo.path,
        installerKind,
        stage,
        emit,
        wayneHome,
        activeRoot,
        abortSignal,
        installStamp
      })
      if (ev.state === 'failed') {
        emit({ type: 'failed', stage: stage.name, error: ev.error || 'stage failed' })
        return { ok: false, failedStage: stage.name, error: ev.error }
      }
    }

    // 4. Write the bootstrap-complete marker.
    const markerPayload = {
      pinnedCommit: (installStamp && installStamp.commit) || null,
      pinnedTag: (installStamp && (installStamp.tag || installStamp.version)) || null,
      pinnedBranch: (installStamp && installStamp.branch) || null
    }
    const marker = typeof writeMarker === 'function' ? writeMarker(markerPayload) : markerPayload
    emit({ type: 'complete', marker })
    return { ok: true, marker }
  } catch (err) {
    emit({ type: 'failed', error: err.message || String(err) })
    return { ok: false, error: err.message || String(err) }
  } finally {
    try {
      runLog.stream.end()
    } catch {
      void 0
    }
  }
}

module.exports = {
  runBootstrap,
  // Single-stage entry: the shell's boot-time engine update runs ONLY the
  // `repository` stage (in-place refresh driven by WAYNE_SOURCE_ZIP_URL)
  // through the same spawn/JSON-frame protocol as the full ladder.
  runStage,
  // Exposed for testability
  parseStageResult,
  resolveLocalInstallScript,
  resolvePackagedInstallScript,
  resolveInstallScript,
  resolveInstallScriptUrl,
  installedAgentInstallScript,
  cachedScriptPath,
  stampLabel
}
