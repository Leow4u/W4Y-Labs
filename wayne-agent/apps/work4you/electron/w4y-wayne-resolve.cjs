/**
 * Resolve a Wayne (Work4You) Python backend for the Hermes desktop shell.
 * Prefer existing ZIP install or monorepo checkout over Hermes git bootstrap.
 *
 * Also owns the first-run engine bootstrap for packaged builds:
 *   ensureWayneEngineForPackaged(destRoot, opts) — extract bundled ready
 *   engine (CPython + .venv) or download the ready ZIP. uv sync is only a
 *   fallback for source-only ZIPs still in the field.
 */
"use strict";

const { execFileSync, spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { resolveWayneHome, resolvePlatformRoot, resolveSharedEngineRoot } = require("./w4y-home.cjs");
let yauzl = null;
try {
  yauzl = require("yauzl");
} catch {
  yauzl = null;
}

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

// Engine package rename (brand migration): the CLI package is becoming
// work4you_cli. Desktop and engine update on separate channels, so the
// resolver must accept BOTH spellings — new first — indefinitely.
function engineEntryModule(root) {
  if (!root) return null;
  if (exists(path.join(root, "work4you_cli", "main.py"))) return "work4you_cli";
  if (exists(path.join(root, "wayne_cli", "main.py"))) return "wayne_cli";
  return null;
}

function isWayneSourceRoot(root) {
  return Boolean(engineEntryModule(root));
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

function runtimeReadyPath(root) {
  return path.join(root, "runtime-ready.json");
}

function readRuntimeReady(root) {
  const p = runtimeReadyPath(root);
  if (!exists(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function runtimePlatformMatches(marker) {
  if (!marker || typeof marker !== "object") return false;
  const platform = String(marker.platform || "");
  const arch = String(marker.arch || "");
  if (platform && platform !== process.platform) return false;
  if (arch && arch !== process.arch) return false;
  return true;
}

function bundledPythonHome(engineRoot) {
  return path.join(engineRoot, "runtime", "python");
}

/**
 * Interpreter inside the bundled standalone CPython, per platform.
 *
 * The layouts genuinely differ and assuming the Windows one is what made a
 * macOS runtime impossible to recognise:
 *   win32 : runtime/python/python.exe
 *   posix : runtime/python/bin/python3.11  (python3 / python are symlinks)
 */
function bundledPythonExe(engineRoot, platform = process.platform) {
  const home = bundledPythonHome(engineRoot);
  if (platform === "win32") {
    const exe = path.join(home, "python.exe");
    return exists(exe) ? exe : null;
  }
  for (const name of ["python3.11", "python3", "python"]) {
    const candidate = path.join(home, "bin", name);
    if (exists(candidate)) return candidate;
  }
  return null;
}

/**
 * Rewrite pyvenv.cfg `home` to the bundled CPython next to the engine.
 * The runtime is built on a CI/dev machine; without this the venv's launcher
 * is a trampoline pointing at the builder's uv-managed interpreter.
 */
function repairReadyRuntime(engineRoot) {
  const pythonExe = bundledPythonExe(engineRoot);
  if (!pythonExe) return false;

  const resolved = resolveExistingVenv(engineRoot);
  if (!resolved) return false;

  const cfgPath = path.join(resolved.venvRoot, "pyvenv.cfg");
  if (!exists(cfgPath)) return false;

  // `home` names the directory CONTAINING the base interpreter — the runtime
  // root on Windows, its bin/ on POSIX. Deriving it from the resolved
  // interpreter keeps both correct without branching again.
  const pythonHome = path.dirname(pythonExe);

  let cfg = fs.readFileSync(cfgPath, "utf8");
  if (/^home\s*=/m.test(cfg)) {
    cfg = cfg.replace(/^home\s*=\s*.*$/m, `home = ${pythonHome}`);
  } else {
    cfg = `home = ${pythonHome}\n${cfg}`;
  }
  fs.writeFileSync(cfgPath, cfg, "utf8");
  return true;
}

function venvCanImportEngine(engineRoot) {
  const resolved = resolveExistingVenv(engineRoot);
  if (!resolved) return false;
  try {
    execFileSync(resolved.python, ["-c", "import work4you_cli"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 20_000,
      cwd: engineRoot,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * True when this tree ships a prebuilt Windows runtime and it can be activated.
 */
function prepareReadyRuntime(engineRoot) {
  const marker = readRuntimeReady(engineRoot);
  if (!marker || !runtimePlatformMatches(marker)) return false;
  if (!repairReadyRuntime(engineRoot)) return false;
  const resolved = resolveExistingVenv(engineRoot);
  return Boolean(resolved && exists(resolved.python));
}

function isReadyRuntime(engineRoot) {
  return prepareReadyRuntime(engineRoot);
}

/**
 * The ready engine tree the installer laid down, or null for source builds.
 *
 * Shipped as a DIRECTORY, not an archive: NSIS/DMG already write every file
 * natively at install time, so first run has nothing to decompress. The older
 * layout shipped a 100MB ZIP inside the installer and unpacked its ~12.7k
 * entries with a single-threaded JS unzip on first launch — the installer paid
 * for the files once and the user paid for them again, slowly.
 */
function resolveBundledEngineDir() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, "engine") : null,
    path.join(__dirname, "..", "build", "engine-runtime"),
  ].filter(Boolean);
  return candidates.find((dir) => exists(path.join(dir, "pyproject.toml"))) || null;
}

/**
 * Copy a directory tree with the platform's own copier.
 *
 * robocopy/ditto/cp are multi-threaded native code that the OS (and real-time
 * antivirus) are tuned for; a per-file JS walk over a CPython tree is orders of
 * magnitude slower. Falls back to fs.cpSync only when the tool is absent, so a
 * genuine copy failure still surfaces instead of being silently retried.
 */
function copyTreeNative(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });

  let res;
  if (process.platform === "win32") {
    res = spawnSync(
      "robocopy",
      [srcDir, destDir, "/E", "/MT:16", "/R:2", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"],
      { windowsHide: true, stdio: "ignore" }
    );
    // robocopy signals success with exit codes 0-7; 8 and above are failures.
    if (!res.error && typeof res.status === "number" && res.status < 8) return;
  } else if (process.platform === "darwin") {
    // ditto preserves symlinks, permissions and extended attributes, which the
    // POSIX CPython tree depends on.
    res = spawnSync("ditto", [srcDir, destDir], { stdio: "ignore" });
    if (!res.error && res.status === 0) return;
  } else {
    res = spawnSync("cp", ["-a", `${srcDir}/.`, destDir], { stdio: "ignore" });
    if (!res.error && res.status === 0) return;
  }

  const missingTool = Boolean(res && res.error && res.error.code === "ENOENT");
  if (!missingTool) {
    const code = res && typeof res.status === "number" ? res.status : "unknown";
    throw new Error(`native copy failed (exit ${code}) copying ${srcDir}`);
  }
  fs.cpSync(srcDir, destDir, { recursive: true, verbatimSymlinks: true });
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
  // Public env interface is WORK4YOU_*. Electron main is Node, so it cannot
  // use the Python-side WORK4YOU_*→WAYNE_* bridge — accept both spellings
  // here, new name first.
  const desktopRoot =
    process.env.WORK4YOU_DESKTOP_ROOT || process.env.WAYNE_DESKTOP_ROOT;
  if (desktopRoot) {
    list.push(path.resolve(desktopRoot));
  }
  // Monorepo: apps/work4you/electron → ../../.. = wayne-agent
  list.push(path.resolve(__dirname, "../../.."));
  // Shared ready engine at the platform root (NSIS / first-run), independent
  // of which Work4You account is active.
  try {
    list.push(resolveSharedEngineRoot(resolvePlatformRoot()));
  } catch {
    void 0;
  }
  const home = resolveWayneHome();
  list.push(path.join(home, "work4you-agent"));
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
    if (c === "uv" || c === "uv.exe") {
      try {
        execFileSync(c, ["--version"], { stdio: "ignore", windowsHide: true, timeout: 10_000 });
        return c;
      } catch {
        continue;
      }
    }
    if (exists(c)) return c;
  }
  return null;
}

/** Install managed uv into %LOCALAPPDATA%\\wayne\\bin (same contract as install.ps1). */
async function ensureManagedUv(onLog) {
  const binDir = path.join(resolveWayneHome(), "bin");
  const uvPath =
    process.platform === "win32" ? path.join(binDir, "uv.exe") : path.join(binDir, "uv");
  const existing = findUvBinary();
  if (existing && (existing === "uv" || existing === "uv.exe" || exists(existing))) {
    onLog && onLog(`uv disponível (${existing === "uv" || existing === "uv.exe" ? existing : uvPath})`);
    return exists(uvPath) ? uvPath : existing;
  }
  if (exists(uvPath)) return uvPath;

  onLog && onLog("Instalando uv (gestor de pacotes Python)…");
  fs.mkdirSync(binDir, { recursive: true });

  if (process.platform !== "win32") {
    throw new Error(
      "uv não encontrado. Instale com: curl -LsSf https://astral.sh/uv/install.sh | sh",
    );
  }

  await new Promise((resolve, reject) => {
    const env = { ...process.env, UV_INSTALL_DIR: binDir };
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "irm https://astral.sh/uv/install.ps1 | iex",
      ],
      { env, stdio: "pipe", windowsHide: true },
    );
    let errOut = "";
    if (child.stderr) {
      child.stderr.on("data", (c) => {
        errOut += c.toString();
      });
    }
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0 && exists(uvPath)) return resolve();
      reject(
        new Error(
          `Falha ao instalar uv (código ${code ?? "?"}). ${errOut.slice(-300)}`.trim(),
        ),
      );
    });
  });

  if (!exists(uvPath)) {
    throw new Error(
      "uv não ficou disponível após a instalação. Verifique firewall/antivírus e ligação à internet.",
    );
  }
  onLog && onLog(`uv instalado em ${uvPath}`);
  return uvPath;
}

function resolvePythonFallback() {
  if (process.platform === "win32") {
    for (const spec of [{ cmd: "py", args: ["-3"] }, { cmd: "python", args: [] }, { cmd: "python3", args: [] }]) {
      try {
        execFileSync(spec.cmd, [...spec.args, "--version"], {
          stdio: "ignore",
          windowsHide: true,
          timeout: 10_000,
        });
        return spec;
      } catch {
        continue;
      }
    }
    return null;
  }
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore", timeout: 10_000 });
    return { cmd: "python3", args: [] };
  } catch {
    return null;
  }
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
    if (helpers.requireReadyRuntime) {
      if (prepareReadyRuntime(root)) {
        // bundled CPython + .venv — paths repaired, ready to spawn
      } else if (!venvCanImportEngine(root)) {
        continue;
      }
    } else if (readRuntimeReady(root)) {
      prepareReadyRuntime(root);
    }
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
      label: `Work4You engine at ${root}`,
      command,
      args: ["-m", `${engineEntryModule(root) || "wayne_cli"}.main`, ...backendArgs],
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
 * Parse a manifest body, tolerating a leading UTF-8 BOM.
 *
 * latest.json is written by hand at publish time, and PowerShell's Set-Content
 * / Out-File emit a BOM by default. JSON.parse throws on U+FEFF, so a manifest
 * published that way makes every engine update check fail with a parse error
 * while the file looks perfectly fine to a human. That happened to the
 * 20260728b manifest; the publish side now writes BOM-less, and this keeps a
 * repeat from silently breaking updates again.
 */
function parseManifestJson(buf) {
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

/**
 * Packaged builds embed SPKI via build/engine-trust.json → resources/engine-trust.json.
 */
function loadEngineTrustPublicKeyB64() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, "engine-trust.json") : null,
    path.join(__dirname, "..", "build", "engine-trust.json"),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
      const key = parsed?.engineUpdatePublicKeyB64;
      if (typeof key === "string" && key.length > 0) return key;
    } catch {
      // missing or invalid
    }
  }
  return "";
}

/**
 * Verify signed engine update when manifest includes sha256 + signature.
 * Set W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64 (SPKI, base64) in the packaged app.
 * Legacy manifests without fields pass through unchanged.
 */
function verifyEngineManifest(manifest, zipPath) {
  if (process.env.W4Y_SKIP_ENGINE_VERIFY === "1") return;
  if (!manifest || !manifest.sha256 || !manifest.signature) return;

  const digest = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
  if (digest !== manifest.sha256) {
    throw new Error("Engine ZIP integrity check failed (sha256 mismatch)");
  }

  const pubB64 =
    process.env.W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64 ||
    loadEngineTrustPublicKeyB64() ||
    "";
  if (!pubB64) {
    throw new Error(
      "Engine update is signed but W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64 is not configured in the desktop build",
    );
  }

  const message = Buffer.from(`${manifest.version}|${manifest.builtAt}|${manifest.sha256}`, "utf8");
  const key = crypto.createPublicKey({
    key: Buffer.from(pubB64, "base64"),
    format: "der",
    type: "spki",
  });
  const ok = crypto.verify(null, message, key, Buffer.from(manifest.signature, "base64"));
  if (!ok) {
    throw new Error("Engine update signature verification failed");
  }
}

const ENGINE_DIST_BASE = "https://storage.googleapis.com/w4y-engine-dist";

/** Identifies which build of the engine this host can actually run. */
function enginePlatformKey() {
  return `${process.platform}-${process.arch}`;
}

/**
 * Manifest URLs to try, most specific first.
 *
 * The engine carries native binaries, so there is one feed per platform+arch.
 * A single global latest.json cannot serve everyone: the legacy one publishes
 * win32-x64, and every macOS install used to download those Windows binaries,
 * fail the runtime check, and fall through to a ~30 minute uv sync.
 */
function engineManifestUrls() {
  const override =
    process.env.WAYNE_SOURCE_ZIP_URL || process.env.W4Y_ENGINE_LATEST_URL;
  if (override) return [override];
  return [
    `${ENGINE_DIST_BASE}/latest-${enginePlatformKey()}.json`,
    // Legacy single-platform feed, kept for hosts it genuinely serves.
    `${ENGINE_DIST_BASE}/latest.json`,
  ];
}

/**
 * A manifest that declares a platform must match this host. Manifests without
 * the field predate per-platform feeds and are accepted as-is.
 */
function manifestMatchesHost(manifest) {
  const declared = String((manifest && manifest.platform) || "").trim();
  if (!declared) return true;
  return declared === enginePlatformKey();
}

function fetchManifestJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(parseManifestJson(Buffer.concat(chunks)));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

/**
 * Resolve the engine manifest for THIS host, trying the platform-specific feed
 * before the legacy one. A manifest built for another platform is rejected
 * rather than used: no update is strictly better than an engine that cannot
 * run here.
 */
async function fetchEngineManifest() {
  const urls = engineManifestUrls();

  // A direct .zip override bypasses manifests entirely.
  if (urls.length === 1 && /\.zip(\?|$)/i.test(urls[0])) {
    return { version: "override", builtAt: new Date().toISOString(), zipUrl: urls[0] };
  }

  let lastErr = null;
  for (const url of urls) {
    let manifest;
    try {
      manifest = await fetchManifestJson(url);
    } catch (err) {
      lastErr = err;
      continue;
    }
    if (!manifest || typeof manifest.zipUrl !== "string") {
      lastErr = new Error(`${url} is missing zipUrl`);
      continue;
    }
    if (!manifestMatchesHost(manifest)) {
      lastErr = new Error(
        `${url} publishes ${manifest.platform}, but this host needs ${enginePlatformKey()}`
      );
      continue;
    }
    return manifest;
  }
  throw lastErr || new Error(`No engine manifest available for ${enginePlatformKey()}`);
}

/**
 * Fetch the engine manifest and return just its zipUrl.
 * @param {*} [_https] — kept for call-site compatibility; unused.
 */
async function fetchEngineZipUrl(_https) {
  const manifest = await fetchEngineManifest();
  return manifest.zipUrl;
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
  return fetchEngineManifest();
}

/**
 * Check whether a motor (engine) update is available.
 *
 * Compares the remote latest.json against the local engine-version.json marker
 * at the **platform root** (shared engine), never under `accounts/<tenantId>`.
 * Callers often pass `resolveWayneHome()` which becomes the account home after
 * login — that path has no engine and used to return `notInstalled`, hiding the
 * update chip for every signed-in user (incident 14/08 — Rafael).
 *
 * @param {string} [_wayneHome]  — ignored for location; kept for call-site compat
 * @returns {Promise<{
 *   available: boolean,
 *   local: object|null,
 *   remote: object|null,
 *   notInstalled?: boolean,
 *   error?: string
 * }>}
 */
async function checkEngineUpdate(_wayneHome) {
  let remote;
  try {
    remote = await fetchEngineLatestManifest();
  } catch (err) {
    return { available: false, local: null, remote: null, error: err && err.message };
  }

  let platformRoot;
  try {
    platformRoot = resolvePlatformRoot();
  } catch (err) {
    return {
      available: false,
      local: null,
      remote,
      error: err && err.message ? err.message : "no-platform-root",
    };
  }

  const local = readEngineVersionMarker(platformRoot);

  if (!local) {
    const engineRoot = resolveSharedEngineRoot(platformRoot);
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
    writeEngineVersionMarker(platformRoot, remote);
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
 *   4. Activate bundled runtime (or uv sync fallback for source-only ZIPs)
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

  verifyEngineManifest(remote, tmpZip);

  // Extract to a fresh temp dir, then merge into engineRoot. Extracting
  // straight into an existing install nests as engineRoot/wayne-agent/ when
  // the ZIP wraps a top-level folder — promoteIfNeeded used to bail early
  // because engineRoot was already a source root, leaving the old code live
  // while engine-version.json claimed the new version (incident 29/07).
  const tmpExtract = path.join(os.tmpdir(), `w4y-engine-extract-${Date.now()}`);
  log("Extraindo arquivos do motor…", null);
  try {
    await extractZipTo(tmpZip, tmpExtract, (line, pct) => log(line, pct));
  } catch (err) {
    try { fs.unlinkSync(tmpZip); } catch { void 0; }
    try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch { void 0; }
    throw new Error(`Falha ao extrair o motor: ${err && err.message}`);
  }
  try { fs.unlinkSync(tmpZip); } catch { void 0; }

  const sourceRoot = resolveExtractedSourceRoot(tmpExtract);
  if (!sourceRoot) {
    try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch { void 0; }
    throw new Error(
      `ZIP do motor Work4You não contém work4you_cli/main.py (nem wayne_cli/main.py) (extraído em '${tmpExtract}'). ` +
      `Verifique a estrutura do ZIP publicado no GCS.`
    );
  }

  log("Aplicando ficheiros do motor…", null);
  try {
    mergeEngineTree(sourceRoot, engineRoot);
  } catch (err) {
    try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch { void 0; }
    throw new Error(`Falha ao aplicar o motor: ${err && err.message}`);
  }
  try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch { void 0; }

  // Safety net for any leftover nested wrapper from older broken updates.
  try { promoteIfNeeded(engineRoot); } catch { void 0; }

  if (!isWayneSourceRoot(engineRoot)) {
    throw new Error(
      `Motor Work4You em '${engineRoot}' não parece válido (work4you_cli/main.py ou wayne_cli/main.py não encontrado). ` +
      `Verifique a estrutura do ZIP publicado no GCS.`
    );
  }

  if (isReadyRuntime(engineRoot)) {
    log("Motor pronto — runtime pré-instalado, sem uv sync.", null);
  } else {
    log("Atualizando dependências Python (uv sync)…", null);
    try {
      await runUvSync(engineRoot, (line) => log(line, null));
    } catch (err) {
      throw new Error(
        `uv sync falhou após extração do motor. Detalhes: ${err && err.message}`
      );
    }
  }

  writeEngineVersionMarker(wayneHome, remote);
  try {
    ensureCliShims(engineRoot, wayneHome);
  } catch {
    void 0;
  }
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
 * Extract a ZIP with real per-file progress when yauzl is available.
 * Falls back to Expand-Archive / unzip (no percent) if yauzl is missing.
 *
 * @param {string} zipPath
 * @param {string} destDir
 * @param {(line: string, pct: number|null) => void} [onProgress]
 */
function extractZipTo(zipPath, destDir, onProgress) {
  clearDanglingLink(destDir);
  fs.mkdirSync(destDir, { recursive: true });
  if (yauzl) {
    return extractZipWithYauzl(zipPath, destDir, onProgress);
  }
  return extractZipWithShell(zipPath, destDir, onProgress);
}

function extractZipWithShell(zipPath, destDir, onProgress) {
  return new Promise((resolve, reject) => {
    const IS_WIN = process.platform === "win32";
    let child;
    if (IS_WIN) {
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
      if (code === 0) {
        try { onProgress && onProgress("Extract complete", 100); } catch { void 0; }
        return resolve();
      }
      reject(new Error(`ZIP extraction failed (code ${code}): ${stderr.slice(0, 300)}`));
    });
  });
}

function safeZipEntryPath(destDir, entryName) {
  const normalized = String(entryName || "").replace(/\\/g, "/");
  if (!normalized || normalized.includes("\0")) return null;
  if (normalized.split("/").some((p) => p === "..")) return null;
  const abs = path.resolve(destDir, ...normalized.split("/"));
  const root = path.resolve(destDir) + path.sep;
  if (abs !== path.resolve(destDir) && !abs.startsWith(root)) return null;
  return abs;
}

function extractZipWithYauzl(zipPath, destDir, onProgress) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
      if (openErr) return reject(openErr);
      const total = Math.max(1, zipfile.entryCount || 1);
      let done = 0;
      let lastPct = -1;
      const tick = (force = false) => {
        const pct = Math.min(99, Math.round((done / total) * 100));
        if (force || pct !== lastPct) {
          lastPct = pct;
          try {
            onProgress && onProgress(`A extrair o motor… ${pct}% (${done}/${total})`, pct);
          } catch {
            void 0;
          }
        }
      };
      tick(true);
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        const target = safeZipEntryPath(destDir, entry.fileName);
        if (!target) {
          done += 1;
          tick();
          zipfile.readEntry();
          return;
        }
        if (/\/$/.test(entry.fileName)) {
          try {
            fs.mkdirSync(target, { recursive: true });
          } catch (err) {
            zipfile.close();
            return reject(err);
          }
          done += 1;
          tick();
          zipfile.readEntry();
          return;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) {
            zipfile.close();
            return reject(streamErr);
          }
          const out = fs.createWriteStream(target);
          readStream.on("error", (err) => {
            zipfile.close();
            reject(err);
          });
          out.on("error", (err) => {
            zipfile.close();
            reject(err);
          });
          out.on("finish", () => {
            done += 1;
            tick();
            zipfile.readEntry();
          });
          readStream.pipe(out);
        });
      });
      zipfile.on("end", () => {
        try {
          onProgress && onProgress("Extract complete", 100);
        } catch {
          void 0;
        }
        resolve();
      });
      zipfile.on("error", reject);
    });
  });
}

/**
 * Locate the Wayne source root inside an extracted ZIP directory.
 * Handles both flat layouts and a single top-level wrapper folder.
 */
function resolveExtractedSourceRoot(extractDir) {
  if (isWayneSourceRoot(extractDir)) return extractDir;
  let entries;
  try {
    entries = fs.readdirSync(extractDir);
  } catch {
    return null;
  }
  for (const name of entries) {
    const inner = path.join(extractDir, name);
    try {
      if (fs.statSync(inner).isDirectory() && isWayneSourceRoot(inner)) {
        return inner;
      }
    } catch {
      // skip
    }
  }
  return null;
}

/**
 * Copy engine source files from srcRoot onto destRoot.
 * Source-only ZIPs keep the local venv so updates do not wipe packages.
 * Ready ZIPs replace `.venv`, `venv`, and `runtime/` so the user never
 * rebuilds Python deps.
 */
/**
 * Remove a dangling junction/symlink sitting where a directory should be.
 *
 * The engine dir is swapped via a junction. If an update repoints it and the
 * new target is then lost (a failed promote deletes the staged dir), the link
 * survives with a target that no longer exists — `mkdir -p` on that path fails
 * with ENOENT forever and the app can never start again, because the very
 * code that would repair the engine is the code that cannot create the dir.
 * Seen in the field on 02/08/2026. lstat sees the link itself; existsSync
 * follows it, so "link exists but does not resolve" is exactly a dangling
 * reparse point. Removing it is safe: the data lives at the target, and the
 * target is gone.
 */
function clearDanglingLink(p) {
  let st;
  try {
    st = fs.lstatSync(p);
  } catch {
    return; // nothing there at all
  }
  if (!st.isSymbolicLink() && !st.isDirectory()) return;
  if (fs.existsSync(p)) return; // resolves fine — leave it alone
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    try {
      fs.unlinkSync(p);
    } catch {
      /* best effort — the mkdir below will surface the real error */
    }
  }
}

function mergeEngineTree(srcRoot, destRoot) {
  clearDanglingLink(destRoot);
  fs.mkdirSync(destRoot, { recursive: true });
  const skip = new Set(["__pycache__", ".pytest_cache"]);
  if (!readRuntimeReady(srcRoot)) {
    skip.add(".venv");
    skip.add("venv");
    skip.add("runtime");
  }
  for (const name of fs.readdirSync(srcRoot)) {
    if (skip.has(name)) continue;
    const src = path.join(srcRoot, name);
    const dst = path.join(destRoot, name);
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(src, dst, { recursive: true, force: true });
  }
}

/**
 * After extraction, the ZIP may have a single wrapper directory (GitHub archive
 * style: `wayne-agent-main/`). If so, promote its contents to destDir.
 *
 * Also repairs the in-place-update nest (`destDir/wayne-agent/`) left by older
 * builds that extracted a wrapped ZIP into an already-valid engine root.
 */
function promoteIfNeeded(destDir) {
  if (!isWayneSourceRoot(destDir)) {
    const entries = fs.readdirSync(destDir);
    if (entries.length !== 1) return;
    const inner = path.join(destDir, entries[0]);
    const stat = fs.statSync(inner);
    if (!stat.isDirectory()) return;
    if (!isWayneSourceRoot(inner)) return;
    for (const name of fs.readdirSync(inner)) {
      const src = path.join(inner, name);
      const dst = path.join(destDir, name);
      fs.renameSync(src, dst);
    }
    try { fs.rmdirSync(inner); } catch { void 0; }
    return;
  }

  // destDir is already a source root — look for a nested wrapper left by a
  // broken in-place extract and merge it over the live tree.
  for (const name of [
    "work4you-agent",
    "work4you-agent-main",
    "wayne-agent",
    "wayne-agent-main",
  ]) {
    const inner = path.join(destDir, name);
    if (!exists(inner)) continue;
    try {
      if (!fs.statSync(inner).isDirectory() || !isWayneSourceRoot(inner)) continue;
    } catch {
      continue;
    }
    mergeEngineTree(inner, destDir);
    try { fs.rmSync(inner, { recursive: true, force: true }); } catch { void 0; }
    return;
  }
}

function resolveVenvScriptsDir(engineRoot) {
  const names = process.platform === "win32" ? [".venv", "venv"] : [".venv", "venv"];
  for (const name of names) {
    const scripts =
      process.platform === "win32"
        ? path.join(engineRoot, name, "Scripts")
        : path.join(engineRoot, name, "bin");
    const exe = process.platform === "win32" ? "work4you.exe" : "work4you";
    const legacy = process.platform === "win32" ? "wayne.exe" : "wayne";
    if (exists(path.join(scripts, exe)) || exists(path.join(scripts, legacy))) {
      return scripts;
    }
  }
  return null;
}

/**
 * Desktop uv sync uses `.venv/`; older install.ps1 put `venv\Scripts` on PATH.
 * Write stable shims into %LOCALAPPDATA%\wayne\bin (already on PATH) and
 * repair a stale venv\Scripts entry when present.
 */
function ensureCliShims(engineRoot, wayneHome) {
  const scriptsDir = resolveVenvScriptsDir(engineRoot);
  if (!scriptsDir || !wayneHome) return;

  const binDir = path.join(wayneHome, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  if (process.platform === "win32") {
    const work4youExe = path.join(scriptsDir, "work4you.exe");
    const wayneExe = path.join(scriptsDir, "wayne.exe");
    if (exists(work4youExe)) {
      fs.writeFileSync(
        path.join(binDir, "work4you.cmd"),
        `@echo off\r\n"${work4youExe}" %*\r\n`,
        "utf8"
      );
    }
    if (exists(wayneExe)) {
      fs.writeFileSync(
        path.join(binDir, "wayne.cmd"),
        `@echo off\r\n"${wayneExe}" %*\r\n`,
        "utf8"
      );
    }

    try {
      const userPath = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "[Environment]::GetEnvironmentVariable('Path','User')",
        ],
        { encoding: "utf8", windowsHide: true, timeout: 15_000 }
      ).trim();
      const stale = path.join(engineRoot, "venv", "Scripts");
      const parts = userPath.split(";").filter(Boolean);
      const withoutStale = parts.filter(
        (p) => path.resolve(p).toLowerCase() !== path.resolve(stale).toLowerCase()
      );
      const norm = (p) => path.resolve(p).toLowerCase();
      const hasBin = withoutStale.some((p) => norm(p) === norm(binDir));
      const hasScripts = withoutStale.some((p) => norm(p) === norm(scriptsDir));
      const nextParts = [...withoutStale];
      if (!hasBin) nextParts.unshift(binDir);
      if (!hasScripts) nextParts.unshift(scriptsDir);
      const nextPath = nextParts.join(";");
      if (nextPath !== userPath) {
        execFileSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `[Environment]::SetEnvironmentVariable('Path', ${JSON.stringify(nextPath)}, 'User')`,
          ],
          { windowsHide: true, timeout: 15_000 }
        );
      }
    } catch {
      void 0;
    }
    return;
  }

  for (const name of ["work4you", "wayne"]) {
    const target = path.join(scriptsDir, name);
    const link = path.join(binDir, name);
    if (!exists(target)) continue;
    try {
      fs.rmSync(link, { force: true });
      fs.symlinkSync(target, link);
    } catch {
      void 0;
    }
  }
}

/**
 * Run `uv sync` (or fall back to pip) in the Wayne engine root.
 * Creates the venv under `.venv/`.
 */
function runUvSync(engineRoot, onLog, uvOverride = null) {
  const uv = uvOverride || findUvBinary(engineRoot);
  const UV_SYNC_TIMEOUT_MS = 45 * 60 * 1000;
  return new Promise((resolve, reject) => {
    let args;
    let cmd;
    let cmdArgs;
    if (uv) {
      cmd = uv;
      cmdArgs = ["sync", "--frozen"];
    } else {
      const py = resolvePythonFallback();
      if (!py) {
        reject(
          new Error(
            "Python não encontrado no Windows. Instale Python 3.11+ de python.org ou deixe a app instalar o uv.",
          ),
        );
        return;
      }
      cmd = py.cmd;
      cmdArgs = [...py.args, "-m", "pip", "install", "-e", "."];
    }
    const cwd = engineRoot;
    onLog && onLog(`[w4y-engine] ${cmd} ${cmdArgs.join(" ")} in ${cwd}`);
    const child = spawn(cmd, cmdArgs, {
      cwd,
      stdio: "pipe",
      windowsHide: true,
      env: { ...process.env, VIRTUAL_ENV: path.join(engineRoot, ".venv") },
    });
    let out = "";
    let lastOutputAt = Date.now();
    const heartbeat = setInterval(() => {
      if (Date.now() - lastOutputAt > 45_000) {
        onLog &&
          onLog(
            "Ainda a instalar dependências Python… na primeira vez pode demorar 5–15 minutos.",
          );
        lastOutputAt = Date.now();
      }
    }, 30_000);
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        void 0;
      }
      reject(new Error("uv sync excedeu o tempo limite (45 min). Verifique rede e antivírus."));
    }, UV_SYNC_TIMEOUT_MS);
    const finish = (fn) => {
      clearInterval(heartbeat);
      clearTimeout(timer);
      fn();
    };
    if (child.stdout) {
      child.stdout.on("data", (c) => {
        lastOutputAt = Date.now();
        out += c.toString();
        onLog && onLog(c.toString().trim());
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (c) => {
        lastOutputAt = Date.now();
        out += c.toString();
        onLog && onLog(c.toString().trim());
      });
    }
    child.once("error", (err) => finish(() => reject(err)));
    child.once("exit", (code) => {
      finish(() => {
        if (code === 0) resolve(out);
        else reject(new Error(`uv sync failed (code ${code}): ${out.slice(-400)}`));
      });
    });
  });
}

/**
 * Full first-run engine install for packaged builds:
 *   1. Prefer the ready engine tree bundled in the installer (Cursor-like)
 *   2. Else download the ready ZIP from latest.json
 *   3. Extract to destRoot and promote wrapper dir
 *   4. Activate bundled CPython + .venv (uv sync only if the ZIP is source-only)
 *
 * When the ZIP is bundled, stages collapse to a single `engine-prepare` step
 * with real extract percent. Incomplete installs are replaced silently.
 *
 * @param {string} destRoot  — platformRoot/wayne-agent
 * @param {{ onProgress?: (msg: string, pct: number|null) => void, onStage?: Function }} opts
 */
async function ensureWayneEngineForPackaged(destRoot, opts = {}) {
  const log = (msg, pct = null) => {
    try { opts.onProgress && opts.onProgress(msg, pct); } catch { void 0; }
  };
  const stage = (name, state, extra = {}) => {
    try { opts.onStage && opts.onStage(name, state, extra); } catch { void 0; }
  };

  if (exists(destRoot) && isWayneSourceRoot(destRoot) && isReadyRuntime(destRoot)) {
    log("Motor Work4You já está pronto.", 100);
    return { bundled: Boolean(resolveBundledEngineDir()) };
  }
  if (exists(destRoot)) {
    // Silent replace — do not surface "incomplete install" to the user overlay.
    try {
      fs.rmSync(destRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
    } catch (err) {
      throw new Error(
        `Não foi possível limpar '${destRoot}' para reinstalar o motor: ${err && err.message}`
      );
    }
  }

  const bundledDir = resolveBundledEngineDir();
  const bundled = Boolean(bundledDir);
  const extractStage = bundled ? "engine-prepare" : "engine-extract";

  if (bundled) {
    // The installer already wrote every file natively. Seed the user's engine
    // root straight from it — no archive to open, no per-file JS unpacking.
    stage("engine-prepare", "running");
    log("A preparar o motor incluído no instalador…", 0);
    try {
      clearDanglingLink(destRoot);
      copyTreeNative(bundledDir, destRoot);
    } catch (err) {
      stage("engine-prepare", "failed", { error: err && err.message });
      throw new Error(
        `Falha ao preparar o motor incluído no instalador: ${err && err.message}`
      );
    }
  } else {
    stage("engine-download", "running");
    log("Buscando URL do motor Work4You…", null);
    let zipUrl;
    try {
      zipUrl = await fetchEngineZipUrl(https);
    } catch (err) {
      stage("engine-download", "failed", { error: err && err.message });
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
      stage("engine-download", "failed", { error: err && err.message });
      throw new Error(`Falha ao baixar o motor Work4You: ${err && err.message}`);
    }
    stage("engine-download", "succeeded");
    stage("engine-extract", "running");

    try {
      await extractZipTo(tmpZip, destRoot, (line, pct) => log(line, pct));
    } catch (err) {
      try { fs.unlinkSync(tmpZip); } catch { void 0; }
      stage("engine-extract", "failed", { error: err && err.message });
      throw new Error(`Falha ao extrair o motor Work4You: ${err && err.message}`);
    }
    try { fs.unlinkSync(tmpZip); } catch { void 0; }

    // Handle GitHub-style archive with wrapper directory.
    try { promoteIfNeeded(destRoot); } catch { void 0; }
  }

  if (!isWayneSourceRoot(destRoot)) {
    stage(extractStage, "failed");
    throw new Error(
      `Motor Work4You extraído em '${destRoot}' não parece ser um checkout válido do wayne-agent ` +
      `(work4you_cli/main.py ou wayne_cli/main.py não encontrado). Verifique a estrutura do ZIP publicado em GCS.`
    );
  }

  if (bundled) {
    if (!isReadyRuntime(destRoot)) {
      stage("engine-prepare", "failed");
      throw new Error(
        "O motor incluído no instalador não ficou utilizável (runtime-ready em falta). Reinstale a app."
      );
    }
    stage("engine-prepare", "succeeded");
  } else {
    stage("engine-extract", "succeeded");
    stage("engine-deps", "running");
    if (isReadyRuntime(destRoot)) {
      log("Motor pronto — runtime pré-instalado, sem uv sync.", 100);
      stage("engine-deps", "succeeded");
    } else {
      log("Preparando uv…", null);
      let managedUv;
      try {
        managedUv = await ensureManagedUv(log);
      } catch (err) {
        stage("engine-deps", "failed", { error: err && err.message });
        throw new Error(
          `Não foi possível instalar uv: ${err && err.message}. ` +
          `Verifique ligação à internet e permissões em ${resolveWayneHome()}.`
        );
      }

      log("Instalando dependências Python (uv sync)…", null);
      try {
        await runUvSync(destRoot, log, managedUv);
      } catch (err) {
        stage("engine-deps", "failed", { error: err && err.message });
        throw new Error(
          `uv sync falhou. Certifique-se de que Python 3.11+ ou uv estão disponíveis. ` +
          `Detalhes: ${err && err.message}`
        );
      }
      stage("engine-deps", "succeeded");
    }
  }

  // Marker lives beside the engine (platform root), not inside account homes.
  try {
    const manifest = await fetchEngineLatestManifest().catch(() => null);
    if (manifest) writeEngineVersionMarker(path.dirname(destRoot), manifest);
  } catch { void 0; }

  try {
    ensureCliShims(destRoot, path.dirname(destRoot));
  } catch {
    void 0;
  }

  log("Motor Work4You pronto!", 100);
  return { bundled };
}

module.exports = {
  ensureWayneMcpSdk,
  ensureWayneEngineForPackaged,
  fetchEngineZipUrl,
  parseManifestJson,
  enginePlatformKey,
  engineManifestUrls,
  manifestMatchesHost,
  clearDanglingLink,
  isWayneSourceRoot,
  tryResolveWayneBackend,
  wayneRootCandidates,
  resolveExtractedSourceRoot,
  mergeEngineTree,
  promoteIfNeeded,
  // Engine version tracking and update primitives
  readEngineVersionMarker,
  writeEngineVersionMarker,
  fetchEngineLatestManifest,
  checkEngineUpdate,
  applyEngineUpdate,
  bundledPythonExe,
  readRuntimeReady,
  repairReadyRuntime,
  prepareReadyRuntime,
  isReadyRuntime,
  resolveBundledEngineDir,
  copyTreeNative,
};
