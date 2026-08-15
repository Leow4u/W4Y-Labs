#!/usr/bin/env node
// ===========================================================================
// Prove a PACKAGED app can actually start its engine.
// ===========================================================================
// Packaging successfully says nothing about whether the shipped engine runs.
// Two real failures got this far undetected:
//   - the venv interpreter was linked by absolute path and dangled the moment
//     the tree moved (macOS);
//   - the NSIS macro silently stopped materializing the engine when the ZIP it
//     looked for became a directory (Windows).
//
// This walks the app's REAL first-run path using the app's own resolver rather
// than a reimplementation, so it cannot drift from what ships:
//   packaged resources/engine --copyTreeNative--> engine root
//   --isReadyRuntime (repairs pyvenv.cfg)--> venv python --> import work4you_cli
//
// Why the copy matters on Windows: the packaged .venv\Scripts\python.exe is a
// trampoline that resolves through pyvenv.cfg, which still points at the build
// machine's staging directory. Running it in place fails; the app never does
// that, because install (NSIS) or first launch materializes the tree first.
//
// Usage: node scripts/verify-packaged-engine.mjs [--release <dir>]
// ===========================================================================

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(SCRIPT_DIR, "..");

const resolver = await import(
  new URL("../electron/w4y-wayne-resolve.cjs", import.meta.url).href
);
const { copyTreeNative, isReadyRuntime, readRuntimeReady } = resolver.default ?? resolver;

function fail(msg) {
  console.error(`[verify-engine] FAIL ${msg}`);
  process.exit(1);
}

function exists(p) {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Locate resources/engine inside whatever electron-builder produced. */
function findPackagedEngine(releaseDir) {
  const candidates = [];

  // Windows / Linux: release/<plat>-unpacked/resources/engine
  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (/-unpacked$/.test(entry.name)) {
      candidates.push(path.join(releaseDir, entry.name, "resources", "engine"));
    }
    // macOS: release/mac-arm64/Work4You.app/Contents/Resources/engine
    const appDir = path.join(releaseDir, entry.name);
    for (const inner of fs.readdirSync(appDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      if (inner.name.endsWith(".app")) {
        candidates.push(path.join(appDir, inner.name, "Contents", "Resources", "engine"));
      }
    }
  }

  return candidates.find((p) => exists(path.join(p, "pyproject.toml"))) || null;
}

function main() {
  const argv = process.argv.slice(2);
  const relIdx = argv.indexOf("--release");
  const releaseDir = path.resolve(
    relIdx >= 0 ? argv[relIdx + 1] : path.join(APP_ROOT, "release")
  );

  if (!exists(releaseDir)) fail(`no release directory at ${releaseDir}`);

  const engine = findPackagedEngine(releaseDir);
  if (!engine) fail(`no packaged engine under ${releaseDir}`);
  console.log(`[verify-engine] packaged engine: ${engine}`);

  const marker = readRuntimeReady(engine);
  if (!marker) fail("packaged engine has no runtime-ready.json — it is source-only");
  const want = `${process.platform}-${process.arch}`;
  const got = `${marker.platform}-${marker.arch}`;
  if (got !== want) fail(`packaged runtime is ${got}, this host needs ${want}`);
  console.log(`[verify-engine] marker: ${got} (extra=${marker.extra})`);

  // Materialize exactly as install / first launch does.
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "w4y-verify-"));
  const engineRoot = path.join(dest, "wayne-agent");
  try {
    const t0 = Date.now();
    copyTreeNative(engine, engineRoot);
    console.log(`[verify-engine] materialized in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // Performs the pyvenv.cfg repair the app relies on.
    if (!isReadyRuntime(engineRoot)) {
      fail("engine reports NOT ready after materialization");
    }

    const py =
      process.platform === "win32"
        ? path.join(engineRoot, ".venv", "Scripts", "python.exe")
        : path.join(engineRoot, ".venv", "bin", "python");
    if (!exists(py)) fail(`venv interpreter missing or dangling: ${py}`);

    // cwd is load-bearing: `uv sync` installs the project EDITABLE and the .pth
    // finder still points at the build-time staging directory. main.cjs spawns
    // the backend with cwd set to the engine root, so mirror that here.
    const version = execFileSync(
      py,
      ["-c", "import work4you_cli, sys; print(sys.version.split()[0])"],
      { cwd: engineRoot, encoding: "utf8", timeout: 180_000, windowsHide: true }
    ).trim();

    console.log(`[verify-engine] PASS — engine starts on CPython ${version}`);
  } finally {
    fs.rmSync(dest, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
}

main();
