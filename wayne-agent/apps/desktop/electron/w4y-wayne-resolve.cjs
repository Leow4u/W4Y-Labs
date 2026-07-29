/**
 * Resolve a Wayne (Work4You) Python backend for the Hermes desktop shell.
 * Prefer existing ZIP install or monorepo checkout over Hermes git bootstrap.
 *
 * Also owns the first-run engine bootstrap for packaged builds:
 *   ensureWayneEngineForPackaged(destRoot, opts) — download engine ZIP → uv sync.
 */
"use strict";

const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { resolveWayneHome } = require("./w4y-login.cjs");

/** Pins must stay aligned with pyproject.toml `[project.optional-dependencies] mcp`. */
const MCP_EXTRA_PACKAGES = ["mcp==1.26.0", "starlette==1.0.1"];

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function isWayneSourceRoot(root) {
  return Boolean(root && exists(path.join(root, "wayne_cli", "main.py")));
}

function getVenvPython(venvRoot) {
  if (process.platform === "win32") {
    return path.join(venvRoot, "Scripts", "python.exe");
  }
  return path.join(venvRoot, "bin", "python");
}

/** Prefer `.venv` (uv/dev) then `venv` (install.ps1). */
function resolveExistingVenv(root) {
  for (const name of [".venv", "venv"]) {
    const venvRoot = path.join(root, name);
    const python = getVenvPython(venvRoot);
    if (exists(python)) return { venvRoot, python };
  }
  return null;
}

/**
 * @returns {string[]} candidate engine roots, highest priority first
 */
function wayneRootCandidates(opts = {}) {
  const list = [];
  if (opts.devSourceRoot) list.push(path.resolve(opts.devSourceRoot));
  if (process.env.W4Y_DEV_SOURCE_ROOT) {
    list.push(path.resolve(process.env.W4Y_DEV_SOURCE_ROOT));
  }
  if (process.env.WAYNE_DESKTOP_ROOT) {
    list.push(path.resolve(process.env.WAYNE_DESKTOP_ROOT));
  }
  // Monorepo: apps/desktop/electron → ../../.. = wayne-agent
  list.push(path.resolve(__dirname, "../../.."));
  const home = resolveWayneHome();
  list.push(path.join(home, "wayne-agent"));
  return [...new Set(list.map((p) => path.resolve(p)))];
}

function pythonHasMcp(pythonPath) {
  try {
    execFileSync(pythonPath, ["-c", "import mcp"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

function findUvBinary(root) {
  const homeBin =
    process.platform === "win32"
      ? path.join(resolveWayneHome(), "bin", "uv.exe")
      : path.join(resolveWayneHome(), "bin", "uv");
  const candidates = [
    process.env.UV_BIN,
    homeBin,
    process.platform === "win32" ? "uv.exe" : "uv",
  ].filter(Boolean);
  for (const c of candidates) {
    if (c === "uv" || c === "uv.exe") return c;
    if (exists(c)) return c;
  }
  return null;
}

/**
 * Dev `.venv` often lacks the optional `[mcp]` extra — without the SDK,
 * Composio tools never register and the agent falls back to skills/pip.
 * Best-effort install into the backend interpreter before spawn.
 */
function ensureWayneMcpSdk(backend, log = () => {}) {
  if (!backend || !backend.w4yWayne || !backend.command) return backend;
  if (pythonHasMcp(backend.command)) return backend;

  log(`[wayne] mcp SDK missing in ${backend.command}; installing ${MCP_EXTRA_PACKAGES.join(" ")}`);
  const uv = findUvBinary(backend.root);
  try {
    if (uv) {
      execFileSync(uv, ["pip", "install", "--python", backend.command, ...MCP_EXTRA_PACKAGES], {
        cwd: backend.root || undefined,
        stdio: "pipe",
        windowsHide: true,
        timeout: 180_000,
      });
    } else {
      execFileSync(backend.command, ["-m", "pip", "install", ...MCP_EXTRA_PACKAGES], {
        cwd: backend.root || undefined,
        stdio: "pipe",
        windowsHide: true,
        timeout: 180_000,
      });
    }
  } catch (err) {
    log(
      `[wayne] failed to install mcp SDK (${err && err.message ? err.message : err}). ` +
        `Connectors/Composio will stay unavailable until: uv pip install --python <venv> 'wayne-agent[mcp]'`
    );
    return backend;
  }

  if (!pythonHasMcp(backend.command)) {
    log("[wayne] mcp SDK still missing after install attempt");
  } else {
    log("[wayne] mcp SDK ready");
  }
  return backend;
}

/**
 * Build a backend descriptor compatible with startHermes spawn.
 * @returns {object|null}
 */
function tryResolveWayneBackend(backendArgs, helpers = {}) {
  const findPythonForRoot = helpers.findPythonForRoot;
  const buildDesktopBackendEnv = helpers.buildDesktopBackendEnv;
  const candidates = wayneRootCandidates({
    devSourceRoot: helpers.devSourceRoot,
  });

  for (const root of candidates) {
    if (!isWayneSourceRoot(root)) continue;
    const resolvedVenv = resolveExistingVenv(root);
    let command = resolvedVenv ? resolvedVenv.python : null;
    if (!command && typeof findPythonForRoot === "function") {
      command = findPythonForRoot(root);
    }
    if (!command || !exists(command)) continue;

    const wayneHome = resolveWayneHome();
    const venvRoot = resolvedVenv ? resolvedVenv.venvRoot : undefined;
    const envExtra =
      typeof buildDesktopBackendEnv === "function"
        ? buildDesktopBackendEnv({
            hermesHome: wayneHome,
            pythonPathEntries: [root],
            venvRoot,
          })
        : {};

    return {
      kind: "python",
      label: `Wayne (Work4You) at ${root}`,
      command,
      args: ["-m", "wayne_cli.main", ...backendArgs],
      env: {
        ...envExtra,
        WAYNE_HOME: wayneHome,
        WAYNE_DESKTOP: "1",
      },
      root,
      bootstrap: false,
      shell: false,
      w4yWayne: true,
    };
  }
  return null;
}

/**
 * Fetch latest.json and return zipUrl (for future install.ps1 bootstrap).
 */
async function fetchEngineZipUrl(https) {
  const manifestUrl =
    process.env.WAYNE_SOURCE_ZIP_URL ||
    process.env.W4Y_ENGINE_LATEST_URL ||
    "https://storage.googleapis.com/w4y-engine-dist/latest.json";
  // If env already points at a .zip, use it directly.
  if (/\.zip(\?|$)/i.test(manifestUrl)) return manifestUrl;
  return new Promise((resolve, reject) => {
    https
      .get(manifestUrl, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (j && typeof j.zipUrl === "string") resolve(j.zipUrl);
            else reject(new Error("latest.json missing zipUrl"));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Engine version marker — tracks the installed engine version so we can
// compare against the remote latest.json and decide if an update is available.
// Location: %LOCALAPPDATA%\wayne\engine-version.json (same dir as wayne-agent/)
// ---------------------------------------------------------------------------

const ENGINE_VERSION_FILE = "engine-version.json";

/**
 * Read the locally installed engine version marker.
 * Returns null if the file doesn't exist or can't be parsed.
 * @param {string} wayneHome  — e.g. %LOCALAPPDATA%\wayne
 * @returns {{ version?: string, builtAt?: string, zipUrl?: string, installedAt?: number } | null}
 */
function readEngineVersionMarker(wayneHome) {
  try {
    const p = path.join(wayneHome, ENGINE_VERSION_FILE);
    if (!exists(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Write the engine version marker after a successful install or update.
 * Non-fatal: a write failure is logged but does not abort the install.
 * @param {string} wayneHome
 * @param {{ version?: string, builtAt?: string, zipUrl?: string }} info
 */
function writeEngineVersionMarker(wayneHome, info) {
  try {
    fs.mkdirSync(wayneHome, { recursive: true });
    fs.writeFileSync(
      path.join(wayneHome, ENGINE_VERSION_FILE),
      JSON.stringify({ ...info, installedAt: Date.now() }, null, 2),
      "utf8"
    );
  } catch (err) {
    console.warn(
      "[w4y-engine] could not write engine-version.json:",
      err && err.message
    );
  }
}

/**
 * Fetch latest.json and return the full engine manifest object.
 * Differs from fetchEngineZipUrl in that it returns the full manifest
 * (version, builtAt, zipUrl) instead of just the URL, enabling version
 * comparison for update checks.
 * @returns {Promise<{ version: string, builtAt: string, zipUrl: string }>}
 */
async function fetchEngineLatestManifest() {
  const manifestUrl =
    process.env.WAYNE_SOURCE_ZIP_URL ||
    process.env.W4Y_ENGINE_LATEST_URL ||
    "https://storage.googleapis.com/w4y-engine-dist/latest.json";
  // Direct ZIP URL override — construct a synthetic manifest so callers can
  // treat override and normal paths uniformly.
  if (/\.zip(\?|$)/i.test(manifestUrl)) {
    return { version: "override", builtAt: new Date().toISOString(), zipUrl: manifestUrl };
  }
  return new Promise((resolve, reject) => {
    https
      .get(manifestUrl, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (j && typeof j.zipUrl === "string") resolve(j);
            else reject(new Error("latest.json missing zipUrl"));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

/**
 * Check whether a motor (engine) update is available.
 *
 * Compares the remote latest.json against the local engine-version.json marker.
 * An update is considered available when the remote `version` or `builtAt`
 * differs from the locally recorded value. If there is no marker file but the
 * engine root exists, we conservatively flag an update so the marker gets
 * written on the next apply.
 *
 * @param {string} wayneHome
 * @returns {Promise<{
 *   available: boolean,
 *   local: object|null,
 *   remote: object|null,
 *   notInstalled?: boolean,
 *   error?: string
 * }>}
 */
async function checkEngineUpdate(wayneHome) {
  let remote;
  try {
    remote = await fetchEngineLatestManifest();
  } catch (err) {
    return { available: false, local: null, remote: null, error: err && err.message };
  }

  const local = readEngineVersionMarker(wayneHome);

  if (!local) {
    const engineRoot = path.join(wayneHome, "wayne-agent");
    if (!isWayneSourceRoot(engineRoot)) {
      // Engine not on disk at all — first-run territory, not an update scenario.
      return { available: false, local: null, remote, notInstalled: true };
    }
    // Engine installed but no marker yet: this happens on a fresh NSIS install
    // where the bundled engine was copied in without calling
    // ensureWayneEngineForPackaged (which writes the marker at the end).
    // Treat the currently-installed engine as matching the remote version and
    // write the marker now so subsequent checks can do a real version compare.
    // Without this, every check loop returns available=true and the update chip
    // appears immediately after a clean install.
    writeEngineVersionMarker(wayneHome, remote);
    return { available: false, local: remote, remote };
  }

  const versionChanged = remote.version && local.version !== remote.version;
  const builtAtChanged = remote.builtAt && local.builtAt !== remote.builtAt;
  const available = Boolean(versionChanged || builtAtChanged);

  return { available, local, remote };
}

/**
 * Apply an engine (motor) update in-place:
 *   1. Download the new engine ZIP from remote.zipUrl
 *   2. Extract over the existing engine root (Expand-Archive -Force)
 *   3. Promote wrapper directory if needed
 *   4. Run uv sync to refresh the venv
 *   5. Write engine-version.json marker
 *
 * Callers should stop the Python backend BEFORE calling this to avoid
 * Windows file-lock conflicts on .pyd / Python executables.
 *
 * @param {string} engineRoot   — e.g. %LOCALAPPDATA%\wayne\wayne-agent
 * @param {string} wayneHome    — e.g. %LOCALAPPDATA%\wayne
 * @param {{
 *   remote: { version?: string, builtAt?: string, zipUrl: string },
 *   onProgress?: (msg: string, pct: number|null) => void
 * }} opts
 */
async function applyEngineUpdate(engineRoot, wayneHome, opts = {}) {
  const { remote, onProgress } = opts;
  const log = (msg, pct = null) => {
    try { onProgress && onProgress(msg, pct); } catch { void 0; }
  };

  if (!remote || !remote.zipUrl) {
    throw new Error("applyEngineUpdate: remote manifest com zipUrl é obrigatório");
  }

  const tmpZip = path.join(os.tmpdir(), `w4y-engine-update-${Date.now()}.zip`);
  const versionLabel = remote.version || "latest";

  log(`Baixando motor v${versionLabel}…`, 0);
  try {
    await downloadFileToPath(remote.zipUrl, tmpZip, (pct) => {
      log(`Baixando motor… ${pct}%`, pct);
    });
  } catch (err) {
    throw new Error(`Falha ao baixar o motor: ${err && err.message}`);
  }

  log("Extraindo arquivos do motor…", null);
  try {
    await extractZipTo(tmpZip, engineRoot, (line) => log(line, null));
  } catch (err) {
    try { fs.unlinkSync(tmpZip); } catch { void 0; }
    throw new Error(`Falha ao extrair o motor: ${err && err.message}`);
  }
  try { fs.unlinkSync(tmpZip); } catch { void 0; }

  try { promoteIfNeeded(engineRoot); } catch { void 0; }

  if (!isWayneSourceRoot(engineRoot)) {
    throw new Error(
      `Motor extraído em '${engineRoot}' não parece válido (wayne_cli/main.py não encontrado). ` +
      `Verifique a estrutura do ZIP publicado no GCS.`
    );
  }

  log("Atualizando dependências Python (uv sync)…", null);
  try {
    await runUvSync(engineRoot, (line) => log(line, null));
  } catch (err) {
    throw new Error(
      `uv sync falhou após extração do motor. Detalhes: ${err && err.message}`
    );
  }

  writeEngineVersionMarker(wayneHome, remote);
  log(`Motor v${versionLabel} atualizado com sucesso!`, 100);
}

// ---------------------------------------------------------------------------
// First-run engine bootstrap (Phase B — packaged build, no monorepo)
// ---------------------------------------------------------------------------

/**
 * Download a file via HTTPS (follows redirects up to 5 hops).
 * @param {string} url
 * @param {string} destPath  — absolute path to write
 * @param {(pct: number) => void} onProgress
 */
function downloadFileToPath(url, destPath, onProgress, hops = 0) {
  if (hops > 5) return Promise.reject(new Error(`Too many redirects for ${url}`));
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https://") ? https : http;
    mod
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          res.resume();
          return downloadFileToPath(location, destPath, onProgress, hops + 1)
            .then(resolve)
            .catch(reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let received = 0;
        const file = fs.createWriteStream(destPath);
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total > 0 && onProgress) {
            onProgress(Math.round((received / total) * 100));
          }
        });
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
        file.on("error", reject);
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

/**
 * Extract a ZIP archive.
 * Windows: PowerShell Expand-Archive.
 * macOS/Linux: system unzip.
 *
 * NOTE: ZIP structure expectation — the archive should contain the wayne-agent
 * source files at the top level OR in a single top-level directory.
 * After extraction we probe for wayne_cli/main.py and promote the inner dir
 * if needed.
 *
 * TODO(infra): Confirm ZIP structure when publishing engine ZIPs to GCS.
 */
function extractZipTo(zipPath, destDir, onLog) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    const IS_WIN = process.platform === "win32";
    let child;
    if (IS_WIN) {
      // Expand-Archive overwrites existing files (-Force).
      const psCmd = `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
      child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCmd], {
        stdio: "pipe",
        windowsHide: true,
      });
    } else {
      child = spawn("unzip", ["-o", zipPath, "-d", destDir], { stdio: "pipe" });
    }
    let stderr = "";
    if (child.stderr) child.stderr.on("data", (c) => { stderr += c.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ZIP extraction failed (code ${code}): ${stderr.slice(0, 300)}`));
    });
  });
}

/**
 * After extraction, the ZIP may have a single wrapper directory (GitHub archive
 * style: `wayne-agent-main/`). If so, promote its contents to destDir.
 */
function promoteIfNeeded(destDir) {
  if (isWayneSourceRoot(destDir)) return; // already correct
  const entries = fs.readdirSync(destDir);
  if (entries.length !== 1) return;
  const inner = path.join(destDir, entries[0]);
  const stat = fs.statSync(inner);
  if (!stat.isDirectory()) return;
  if (!isWayneSourceRoot(inner)) return;
  // Move contents of inner/ up to destDir.
  for (const name of fs.readdirSync(inner)) {
    const src = path.join(inner, name);
    const dst = path.join(destDir, name);
    fs.renameSync(src, dst);
  }
  try { fs.rmdirSync(inner); } catch { void 0; }
}

/**
 * Run `uv sync` (or fall back to `pip install`) in the Wayne engine root.
 * Creates the venv under `.venv/`.
 */
function runUvSync(engineRoot, onLog) {
  const uv = findUvBinary(engineRoot);
  return new Promise((resolve, reject) => {
    const args = uv
      ? ["sync", "--frozen"]
      : ["-m", "pip", "install", "-e", "."];
    const cmd = uv || "python3";
    const cwd = engineRoot;
    onLog && onLog(`[w4y-engine] ${cmd} ${args.join(" ")} in ${cwd}`);
    const child = spawn(cmd, args, {
      cwd,
      stdio: "pipe",
      windowsHide: true,
      env: { ...process.env, VIRTUAL_ENV: path.join(engineRoot, ".venv") },
    });
    let out = "";
    if (child.stdout) child.stdout.on("data", (c) => { out += c.toString(); onLog && onLog(c.toString().trim()); });
    if (child.stderr) child.stderr.on("data", (c) => { out += c.toString(); onLog && onLog(c.toString().trim()); });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`uv sync failed (code ${code}): ${out.slice(-400)}`));
    });
  });
}

/**
 * Full first-run engine install for packaged builds:
 *   1. Fetch engine ZIP URL from latest.json
 *   2. Download ZIP to temp
 *   3. Extract to destRoot
 *   4. Promote single inner dir if needed
 *   5. uv sync
 *
 * @param {string} destRoot  — %LOCALAPPDATA%\wayne\wayne-agent (must not exist or be empty)
 * @param {{ onProgress?: (msg: string, pct: number|null) => void }} opts
 */
async function ensureWayneEngineForPackaged(destRoot, opts = {}) {
  const log = (msg, pct = null) => {
    try { opts.onProgress && opts.onProgress(msg, pct); } catch { void 0; }
  };

  log("Buscando URL do motor Work4You…", null);
  let zipUrl;
  try {
    zipUrl = await fetchEngineZipUrl(https);
  } catch (err) {
    throw new Error(
      `Não foi possível obter a URL do motor (latest.json): ${err && err.message}. ` +
      `Verifique sua conexão com a internet.`
    );
  }

  const tmpZip = path.join(os.tmpdir(), `w4y-engine-${Date.now()}.zip`);
  log(`Baixando motor de ${zipUrl}…`, 0);
  try {
    await downloadFileToPath(zipUrl, tmpZip, (pct) => {
      log(`Baixando motor… ${pct}%`, pct);
    });
  } catch (err) {
    throw new Error(`Falha ao baixar o motor Work4You: ${err && err.message}`);
  }

  log("Extraindo arquivos do motor…", null);
  try {
    await extractZipTo(tmpZip, destRoot, (line) => log(line, null));
  } catch (err) {
    try { fs.unlinkSync(tmpZip); } catch { void 0; }
    throw new Error(`Falha ao extrair o motor Work4You: ${err && err.message}`);
  }

  try { fs.unlinkSync(tmpZip); } catch { void 0; }

  // Handle GitHub-style archive with wrapper directory.
  try { promoteIfNeeded(destRoot); } catch { void 0; }

  if (!isWayneSourceRoot(destRoot)) {
    throw new Error(
      `Motor extraído em '${destRoot}' não parece ser um checkout válido do wayne-agent ` +
      `(wayne_cli/main.py não encontrado). Verifique a estrutura do ZIP publicado em GCS.`
    );
  }

  log("Instalando dependências Python (uv sync)…", null);
  try {
    await runUvSync(destRoot, (line) => log(line, null));
  } catch (err) {
    throw new Error(
      `uv sync falhou. Certifique-se de que 'uv' está instalado ou que Python está disponível. ` +
      `Detalhes: ${err && err.message}`
    );
  }

  // Record the installed version so future update checks can compare.
  // The marker lives in wayneHome (the parent of wayne-agent/), not inside
  // the engine root itself — so it survives engine directory replacements.
  try {
    const manifest = await fetchEngineLatestManifest().catch(() => null);
    if (manifest) writeEngineVersionMarker(path.dirname(destRoot), manifest);
  } catch { void 0; }

  log("Motor Work4You pronto!", 100);
}

module.exports = {
  ensureWayneMcpSdk,
  ensureWayneEngineForPackaged,
  fetchEngineZipUrl,
  isWayneSourceRoot,
  tryResolveWayneBackend,
  wayneRootCandidates,
  // Engine version tracking and update primitives
  readEngineVersionMarker,
  writeEngineVersionMarker,
  fetchEngineLatestManifest,
  checkEngineUpdate,
  applyEngineUpdate,
};
