/**
 * ui-update.cjs — UI-only channel (web_dist patch).
 *
 * Separate from the engine ZIP: a small manifest + ZIP of wayne_cli/web_dist.
 * Apply = download → replace ENGINE_ROOT/wayne_cli/web_dist → reload.
 * No slots, no venv, no install.ps1. Mirror of Fly Dockerfile.ui on desktop.
 */
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_UI_MANIFEST_URL =
  "https://storage.googleapis.com/w4y-engine-dist/ui-latest.json";

function manifestUrl() {
  return (process.env.W4Y_UI_MANIFEST_URL || "").trim() || DEFAULT_UI_MANIFEST_URL;
}

function uiSourceFile(wayneHome) {
  return path.join(wayneHome, "ui-source.json");
}

function readUiSource(wayneHome) {
  try {
    const j = JSON.parse(fs.readFileSync(uiSourceFile(wayneHome), "utf8"));
    return j && typeof j.zipUrl === "string" && j.zipUrl ? j : null;
  } catch {
    return null;
  }
}

function writeUiSource(wayneHome, data) {
  fs.mkdirSync(wayneHome, { recursive: true });
  fs.writeFileSync(uiSourceFile(wayneHome), JSON.stringify(data, null, 2) + "\n", "utf8");
}

function fetchJson(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const lib = url.startsWith("http:") ? http : https;
      const req = lib.get(url, { timeout: timeoutMs }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          done(null);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            done(j && typeof j === "object" ? j : null);
          } catch {
            done(null);
          }
        });
        res.on("error", () => done(null));
      });
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {
          /* */
        }
        done(null);
      });
      req.on("error", () => done(null));
    } catch {
      done(null);
    }
  });
}

function fetchUiManifest(timeoutMs = 5000) {
  return fetchJson(manifestUrl(), timeoutMs).then((j) => {
    if (!j || typeof j.zipUrl !== "string" || !/^https:\/\//i.test(j.zipUrl)) return null;
    return j;
  });
}

function downloadToFile(url, dest, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("http:") ? http : https;
    const file = fs.createWriteStream(dest);
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try {
          fs.rmSync(dest, { force: true });
        } catch {
          /* */
        }
        downloadToFile(res.headers.location, dest, timeoutMs).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        res.resume();
        reject(new Error(`download HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(dest)));
    });
    req.on("timeout", () => {
      try {
        req.destroy();
      } catch {
        /* */
      }
      reject(new Error("download timeout"));
    });
    req.on("error", reject);
    file.on("error", reject);
  });
}

/**
 * Expand a ZIP into destDir using PowerShell Expand-Archive (Windows) or
 * `unzip` (posix). Keeps zero new npm deps in the packaged shell.
 */
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    const isWin = process.platform === "win32";
    const child = isWin
      ? spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
          ],
          { windowsHide: true },
        )
      : spawn("unzip", ["-o", zipPath, "-d", destDir]);
    let err = "";
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `extract exit ${code}`));
    });
  });
}

/** Find the folder that actually contains index.html (zip layout tolerant). */
function findWebDistRoot(extractedRoot) {
  const direct = path.join(extractedRoot, "index.html");
  if (fs.existsSync(direct)) return extractedRoot;
  const nested = path.join(extractedRoot, "web_dist", "index.html");
  if (fs.existsSync(nested)) return path.join(extractedRoot, "web_dist");
  // One top-level folder wrapping web_dist/
  try {
    const kids = fs.readdirSync(extractedRoot);
    for (const name of kids) {
      const p = path.join(extractedRoot, name);
      if (!fs.statSync(p).isDirectory()) continue;
      if (fs.existsSync(path.join(p, "index.html"))) return p;
      if (fs.existsSync(path.join(p, "web_dist", "index.html"))) return path.join(p, "web_dist");
    }
  } catch {
    /* */
  }
  return null;
}

function clearDirContents(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

/**
 * @returns {Promise<{status: string, version?: string|null, kind?: string, zipUrl?: string, reason?: string}>}
 * Layer-shaped for unified-check.cjs
 */
async function checkUiUpdate({ wayneHome, engineRoot, layer, skipped, AVAILABLE, UP_TO_DATE, UNKNOWN }) {
  try {
    if (!engineRoot || !fs.existsSync(path.join(engineRoot, "wayne_cli"))) {
      return skipped();
    }
    const manifest = await fetchUiManifest();
    if (!manifest || !manifest.zipUrl) {
      return layer(UNKNOWN, { reason: "ui manifest unreachable" });
    }
    const current = readUiSource(wayneHome);
    // First install after shipping UI channel: seed from engine web_dist mtime
    // is unnecessary — comparing zipUrl alone is enough. Missing marker ⇒ offer.
    if (current && current.zipUrl === manifest.zipUrl) {
      return layer(UP_TO_DATE, { version: manifest.version ?? null });
    }
    return layer(AVAILABLE, {
      version: manifest.version ?? null,
      kind: "ui",
      zipUrl: manifest.zipUrl,
    });
  } catch {
    return layer(UNKNOWN, { reason: "ui check threw" });
  }
}

/**
 * Replace live web_dist and record the marker. Caller reloads the window.
 * @returns {Promise<{ok: boolean, error?: string, version?: string|null}>}
 */
async function applyUiUpdate({ wayneHome, engineRoot, zipUrl, version, log = () => {} }) {
  const webDist = path.join(engineRoot, "wayne_cli", "web_dist");
  if (!fs.existsSync(path.join(engineRoot, "wayne_cli"))) {
    return { ok: false, error: "engine web_dist missing" };
  }
  const tmpRoot = path.join(wayneHome, "ui-update-tmp");
  const zipPath = path.join(tmpRoot, "web_dist.zip");
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
    log(`ui: downloading ${zipUrl}`);
    await downloadToFile(zipUrl, zipPath);
    const extractTo = path.join(tmpRoot, "extracted");
    await extractZip(zipPath, extractTo);
    const src = findWebDistRoot(extractTo);
    if (!src) return { ok: false, error: "zip has no index.html" };
    log(`ui: replacing ${webDist}`);
    clearDirContents(webDist);
    copyDirRecursive(src, webDist);
    writeUiSource(wayneHome, {
      version: version ?? null,
      zipUrl,
      updatedAt: new Date().toISOString(),
    });
    log(`ui: applied version=${version || "?"}`);
    return { ok: true, version: version ?? null };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
}

module.exports = {
  checkUiUpdate,
  applyUiUpdate,
  fetchUiManifest,
  readUiSource,
  writeUiSource,
  DEFAULT_UI_MANIFEST_URL,
};
