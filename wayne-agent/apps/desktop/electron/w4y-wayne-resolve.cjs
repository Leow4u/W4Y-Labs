/**
 * Resolve a Wayne (Work4You) Python backend for the Hermes desktop shell.
 * Prefer existing ZIP install or monorepo checkout over Hermes git bootstrap.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { resolveWayneHome } = require("./w4y-login.cjs");

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
  // Monorepo: apps/desktop/electron → ../../ = wayne-agent
  list.push(path.resolve(__dirname, "../.."));
  const home = resolveWayneHome();
  list.push(path.join(home, "wayne-agent"));
  return [...new Set(list.map((p) => path.resolve(p)))];
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
    const venvRoot = path.join(root, "venv");
    const venvPython = getVenvPython(venvRoot);
    let command = exists(venvPython) ? venvPython : null;
    if (!command && typeof findPythonForRoot === "function") {
      command = findPythonForRoot(root);
    }
    if (!command || !exists(command)) continue;

    const wayneHome = resolveWayneHome();
    const envExtra =
      typeof buildDesktopBackendEnv === "function"
        ? buildDesktopBackendEnv({
            hermesHome: wayneHome,
            pythonPathEntries: [root],
            venvRoot: exists(venvRoot) ? venvRoot : undefined,
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

module.exports = {
  fetchEngineZipUrl,
  isWayneSourceRoot,
  tryResolveWayneBackend,
  wayneRootCandidates,
};
