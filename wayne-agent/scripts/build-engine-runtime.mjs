#!/usr/bin/env node
// ===========================================================================
// Work4You engine runtime builder (cross-platform)
// ===========================================================================
// Stages the engine source and, unless --source-only is given, materializes a
// ready-to-run Python runtime beside it (standalone CPython + a fully synced
// .venv). The desktop then ships that tree and starts with ZERO dependency
// resolution on the user's machine.
//
// This replaces the `-IncludeRuntime` branch of
// platform/wayne-fly/build-engine-zip.ps1, which hard-refused to run anywhere
// but Windows ("-IncludeRuntime requires Windows"). That refusal is why macOS
// shipped without a runtime and every Mac first-run fell back to `uv sync`
// against a Windows-only feed — a ~30 minute install.
//
// Outputs (at least one is required):
//   --out-dir <dir>   the engine root itself (pyproject.toml at its top). This
//                     is what electron-builder ships via extraResources, laid
//                     down natively by NSIS/DMG at install time.
//   --out-zip <file>  distribution archive for the update feed. The archive
//                     wraps everything in a single `wayne-agent/` directory —
//                     THE WRAPPER NAME IS A PUBLISHED CONTRACT, see the header
//                     of build-engine-zip.ps1 before ever changing it.
//
// Usage:
//   node scripts/build-engine-runtime.mjs --out-dir apps/work4you/build/engine-runtime
//   node scripts/build-engine-runtime.mjs --out-zip /tmp/wayne-engine-20260814.zip
//   node scripts/build-engine-runtime.mjs --source-only --out-zip /tmp/src.zip
// ===========================================================================

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Wrapper directory name inside the feed ZIP. Published contract. */
const ZIP_WRAPPER = "wayne-agent";

/** Python feature version baked into the shipped runtime. */
const DEFAULT_PYTHON = "3.11";

/** Optional-dependency group synced into the venv. */
const DEFAULT_EXTRA = "all";

// --- CLI ------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    repoRoot: "",
    outDir: "",
    outZip: "",
    sourceOnly: false,
    python: DEFAULT_PYTHON,
    extra: DEFAULT_EXTRA,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      i += 1;
      return value;
    };
    switch (arg) {
      case "--repo-root": opts.repoRoot = next(); break;
      case "--out-dir": opts.outDir = next(); break;
      case "--out-zip": opts.outZip = next(); break;
      case "--python": opts.python = next(); break;
      case "--extra": opts.extra = next(); break;
      case "--source-only": opts.sourceOnly = true; break;
      case "--help":
      case "-h":
        console.log(
          "Usage: build-engine-runtime.mjs [--repo-root <dir>] " +
            "(--out-dir <dir> | --out-zip <file>) [--source-only] " +
            "[--python <ver>] [--extra <name>]"
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.outDir && !opts.outZip) {
    throw new Error("Nothing to emit: pass --out-dir and/or --out-zip.");
  }
  return opts;
}

// --- helpers --------------------------------------------------------------

const IS_WIN = process.platform === "win32";

function log(msg) {
  console.log(`[engine-runtime] ${msg}`);
}

function exists(p) {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
}

/** Run a command, streaming output, and throw with context when it fails. */
function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    windowsHide: true,
    ...opts,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`${path.basename(cmd)} ${args.join(" ")} failed (exit ${res.status})`);
  }
}

/** Run a command and capture trimmed stdout, or null when it fails. */
function capture(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
      ...opts,
    }).trim();
  } catch {
    return null;
  }
}

// --- staging --------------------------------------------------------------

/**
 * Directories excluded only when they sit at the checkout root. A nested
 * directory that happens to be called `tests` (inside a skill or plugin) is
 * real runtime content and must ship.
 *
 * `apps/` and `ui-tui/` carry UI SOURCES. Shipping them makes the engine's
 * serve startup see a stale-mtime tree and kick off an npm rebuild that cannot
 * succeed on a user machine (no dev deps) — that is what made the first 0.3.0
 * install hang on boot.
 */
const TOP_LEVEL_EXCLUDED = new Set(["apps", "tests", "release", "ui-tui"]);

/** Build/cache directories that must never ship, at any depth. */
const ANY_DEPTH_EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  // The checkout's own virtualenvs. The shipped .venv is created later, into
  // the staged tree, so it is never a copy of the builder's environment.
  ".venv",
  "venv",
  // Both spellings exist in the wild.
  ".pytest_cache",
  ".pytest-cache",
  ".ruff_cache",
  ".mypy_cache",
  // The distribution name is migrating; a checkout may carry either.
  "wayne_agent.egg-info",
  "work4you_agent.egg-info",
]);

/** `.env` holds real secrets in the checkout root and must never ship. */
const ANY_DEPTH_EXCLUDED_FILES = new Set([".env", ".DS_Store"]);

function makeStageFilter(repoRoot) {
  const root = path.resolve(repoRoot);
  return (src) => {
    const rel = path.relative(root, src);
    if (!rel) return true;
    const parts = rel.split(path.sep);
    const base = parts[parts.length - 1];
    if (parts.length === 1 && TOP_LEVEL_EXCLUDED.has(base)) return false;
    if (ANY_DEPTH_EXCLUDED_DIRS.has(base)) return false;
    if (ANY_DEPTH_EXCLUDED_FILES.has(base)) return false;
    if (base.endsWith(".pyc") || base.endsWith(".pyo")) return false;
    return true;
  };
}

function stageSource(repoRoot, stageDir) {
  log(`staging engine source from ${repoRoot}`);
  fs.mkdirSync(stageDir, { recursive: true });
  fs.cpSync(repoRoot, stageDir, {
    recursive: true,
    filter: makeStageFilter(repoRoot),
    // Preserve symlinks rather than materializing their targets.
    verbatimSymlinks: true,
  });

  // pyproject.toml declares `readme = "README.md"`; uv/setuptools stat that
  // file during resolution, so ship a placeholder when the fork has none
  // (mirrors the cloud Dockerfile's `touch ./README.md`).
  const readme = path.join(stageDir, "README.md");
  if (!exists(readme)) {
    fs.writeFileSync(readme, "", "utf8");
    log("created README.md placeholder (required by pyproject readme=)");
  }
}

/**
 * Source pin for ZIP-managed installs, which carry no .git metadata.
 *
 * THE FILE NAME STAYS `.wayne-engine-version`: every install.ps1 already
 * published in the field reads only that name. The reader prefers
 * `.work4you-engine-version` when present, so the rename is unblocked on the
 * install side — but not until those old installers are gone.
 */
function writeVersionPin(repoRoot, stageDir) {
  const commit = capture("git", ["-C", repoRoot, "rev-parse", "HEAD"]) || "";
  const branch = capture("git", ["-C", repoRoot, "rev-parse", "--abbrev-ref", "HEAD"]) || "";
  if (!commit) {
    console.warn("[engine-runtime] WARNING: no git commit resolved; version pin will be empty.");
  }
  const built = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const body = [`commit=${commit}`, `branch=${branch}`, `built=${built}`].join("\n") + "\n";
  fs.writeFileSync(path.join(stageDir, ".wayne-engine-version"), body, "utf8");
  return { commit, branch, built };
}

// --- runtime --------------------------------------------------------------

function findUv() {
  const onPath = capture(IS_WIN ? "where" : "which", ["uv"]);
  if (onPath) {
    const first = onPath.split(/\r?\n/)[0].trim();
    if (first && exists(first)) return first;
  }
  const home = os.homedir();
  const candidates = IS_WIN
    ? [
        path.join(process.env.LOCALAPPDATA || "", "work4you", "bin", "uv.exe"),
        path.join(process.env.LOCALAPPDATA || "", "wayne", "bin", "uv.exe"),
        path.join(home, ".local", "bin", "uv.exe"),
      ]
    : [
        path.join(home, ".local", "bin", "uv"),
        "/usr/local/bin/uv",
        "/opt/homebrew/bin/uv",
      ];
  const hit = candidates.find((p) => p && exists(p));
  if (hit) return hit;
  throw new Error(
    "uv not found. Install it from https://astral.sh/uv (CI: astral-sh/setup-uv)."
  );
}

/**
 * Resolve the ROOT of a uv-managed standalone CPython from the interpreter
 * path uv reports.
 *
 * Layouts differ by platform and this is exactly where a Windows-shaped
 * assumption breaks macOS:
 *   win32 : <root>/python.exe        (python311.dll sits beside it)
 *   posix : <root>/bin/python3.11    (lib/, include/ under <root>)
 */
function pythonRootFromExe(exe) {
  const parent = path.dirname(exe);
  if (IS_WIN) return parent;
  return path.basename(parent) === "bin" ? path.dirname(parent) : parent;
}

/** Interpreter path inside a staged runtime root, per platform. */
function stagedInterpreter(runtimeRoot) {
  if (IS_WIN) return path.join(runtimeRoot, "python.exe");
  for (const name of ["python3.11", "python3", "python"]) {
    const candidate = path.join(runtimeRoot, "bin", name);
    if (exists(candidate)) return candidate;
  }
  return path.join(runtimeRoot, "bin", "python3");
}

/** Interpreter path inside a virtualenv, per platform. */
function venvInterpreter(venvRoot) {
  return IS_WIN
    ? path.join(venvRoot, "Scripts", "python.exe")
    : path.join(venvRoot, "bin", "python");
}

/**
 * `home` in pyvenv.cfg names the directory CONTAINING the base interpreter,
 * which is the runtime root on Windows but its bin/ subdirectory on POSIX.
 * The value written here is a build-machine path; the desktop rewrites it to
 * the real install location on first run (repairReadyRuntime).
 */
function pyvenvHomeFor(runtimeRoot) {
  return IS_WIN ? runtimeRoot : path.join(runtimeRoot, "bin");
}

/**
 * A system Python is not shippable: we need uv's standalone build, which
 * carries its own stdlib and shared library next to the interpreter.
 */
function isStandaloneRuntime(pythonRoot) {
  if (IS_WIN) return exists(path.join(pythonRoot, "python311.dll"));
  return exists(path.join(pythonRoot, "lib"));
}

/**
 * Locate a shippable CPython, installing it only when one is not already
 * present. Probing before installing keeps CI fast and side-steps unrelated
 * breakage in a developer's uv state (a dangling minor-version link for some
 * other Python version makes `uv python install` fail even though the version
 * we need is installed and healthy).
 */
function resolveManagedPython(uv, version, env) {
  // Managed interpreters are global, but `uv python find` is CWD-SENSITIVE:
  // run inside a uv project (the engine checkout is one) it reports that
  // project's .venv interpreter instead of the standalone build. Probing from
  // a neutral directory is what makes the answer mean what we need it to mean.
  const neutral = { env, cwd: os.tmpdir() };

  const probe = () => {
    const exe = capture(uv, ["python", "find", version], neutral);
    if (!exe || !exists(exe)) return null;
    // uv keeps a minor-version alias directory (cpython-3.11 -> cpython-3.11.15)
    // as a real symlink. Resolve it so we copy the actual tree: recreating a
    // directory symlink needs elevated privileges on Windows (EPERM).
    let root = pythonRootFromExe(exe);
    try {
      root = fs.realpathSync(root);
    } catch {
      /* keep the unresolved path; the standalone check below still guards us */
    }
    return isStandaloneRuntime(root) ? { exe, root } : null;
  };

  const present = probe();
  if (present) {
    log(`reusing managed CPython ${version} at ${present.root}`);
    return present;
  }

  log(`uv python install ${version}`);
  run(uv, ["python", "install", version], neutral);

  const installed = probe();
  if (!installed) {
    throw new Error(
      `No standalone CPython ${version} available after \`uv python install\`. ` +
        `A system interpreter cannot be shipped — it has no relocatable stdlib.`
    );
  }
  return installed;
}

function buildRuntime(stageDir, opts, pin) {
  const uv = findUv();
  log(`using uv at ${uv}`);

  // UV_PYTHON would pin the interpreter uv picks; clear it so `python find`
  // reports the managed standalone build we just installed.
  const env = { ...process.env };
  delete env.UV_PYTHON;

  const { root: pythonRoot } = resolveManagedPython(uv, opts.python, env);

  const runtimeRoot = path.join(stageDir, "runtime", "python");
  rmrf(runtimeRoot);
  fs.mkdirSync(path.dirname(runtimeRoot), { recursive: true });
  log(`copying standalone CPython from ${pythonRoot}`);
  fs.cpSync(pythonRoot, runtimeRoot, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => path.basename(src) !== "__pycache__",
  });

  const stagePython = stagedInterpreter(runtimeRoot);
  if (!exists(stagePython)) {
    throw new Error(`staged interpreter missing: ${stagePython}`);
  }

  const venvRoot = path.join(stageDir, ".venv");
  rmrf(venvRoot);
  log("uv venv --relocatable");
  run(uv, ["venv", "--relocatable", "--python", stagePython, venvRoot], { env });

  log(`uv sync --extra ${opts.extra} --locked  (the slow step — runs HERE, never on a user machine)`);
  run(uv, ["sync", "--extra", opts.extra, "--locked"], {
    cwd: stageDir,
    env: { ...env, UV_PROJECT_ENVIRONMENT: venvRoot },
  });

  const venvPython = venvInterpreter(venvRoot);
  if (!exists(venvPython)) {
    throw new Error(`synced venv is missing its interpreter: ${venvPython}`);
  }

  const cfgPath = path.join(venvRoot, "pyvenv.cfg");
  if (exists(cfgPath)) {
    const home = pyvenvHomeFor(runtimeRoot);
    let cfg = fs.readFileSync(cfgPath, "utf8");
    cfg = /^home\s*=/m.test(cfg)
      ? cfg.replace(/^home\s*=\s*.*$/m, `home = ${home}`)
      : `home = ${home}\n${cfg}`;
    fs.writeFileSync(cfgPath, cfg, "utf8");
  }

  // The desktop refuses a runtime whose marker does not match the running
  // platform/arch — that check is the only thing standing between a Mac and a
  // silently unusable Windows engine tree.
  const marker = {
    schema: 1,
    platform: process.platform,
    arch: process.arch,
    python: opts.python,
    extra: opts.extra,
    builtAt: pin.built,
    commit: pin.commit,
  };
  fs.writeFileSync(
    path.join(stageDir, "runtime-ready.json"),
    JSON.stringify(marker) + "\n",
    "utf8"
  );
  log(`runtime-ready.json written (${marker.platform}-${marker.arch}, extra=${marker.extra})`);
}

// --- emit -----------------------------------------------------------------

function emitZip(workRoot, outZip) {
  log(`compressing to ${outZip}`);
  fs.mkdirSync(path.dirname(path.resolve(outZip)), { recursive: true });
  if (exists(outZip)) fs.rmSync(outZip, { force: true });
  const absZip = path.resolve(outZip);
  if (IS_WIN) {
    // System.IO.Compression keeps parity with the PowerShell builder and does
    // not choke on the entry count the way Compress-Archive does.
    const ps = [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
        "[System.IO.Compression.ZipFile]::CreateFromDirectory(" +
        `'${path.join(workRoot, ZIP_WRAPPER).replace(/'/g, "''")}', ` +
        `'${absZip.replace(/'/g, "''")}', ` +
        "[System.IO.Compression.CompressionLevel]::Optimal, $true)",
    ];
    run("powershell.exe", ps);
  } else {
    // -y preserves symlinks (the POSIX CPython tree is full of them);
    // -X drops extra file attributes that differ between build hosts.
    run("zip", ["-r", "-q", "-y", "-X", absZip, ZIP_WRAPPER], { cwd: workRoot });
  }
  const size = fs.statSync(absZip).size;
  log(`archive: ${absZip} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

function emitDir(stageDir, outDir) {
  const abs = path.resolve(outDir);
  log(`materializing engine root at ${abs}`);
  rmrf(abs);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  try {
    fs.renameSync(stageDir, abs);
  } catch {
    // Different volume — fall back to a copy.
    fs.cpSync(stageDir, abs, { recursive: true, verbatimSymlinks: true });
    rmrf(stageDir);
  }
}

// --- main -----------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const repoRoot = path.resolve(opts.repoRoot || path.join(SCRIPT_DIR, ".."));
  if (!exists(path.join(repoRoot, "pyproject.toml"))) {
    throw new Error(`Not an engine checkout (pyproject.toml missing): ${repoRoot}`);
  }

  // Stage OUTSIDE the checkout. fs.cpSync refuses to copy a directory into its
  // own subtree, and the natural output location for the desktop bundle
  // (apps/work4you/build/...) sits inside the engine root we copy FROM.
  // emitDir renames when the volumes match and falls back to a copy otherwise.
  const workRoot = path.join(os.tmpdir(), `work4you-engine-stage-${process.pid}`);
  const stageDir = path.join(workRoot, ZIP_WRAPPER);
  rmrf(workRoot);

  try {
    stageSource(repoRoot, stageDir);
    const pin = writeVersionPin(repoRoot, stageDir);

    if (opts.sourceOnly) {
      log("source-only build (no Python runtime bundled)");
    } else {
      buildRuntime(stageDir, opts, pin);
    }

    if (opts.outZip) emitZip(workRoot, opts.outZip);
    if (opts.outDir) emitDir(stageDir, opts.outDir);

    log(`done. commit=${pin.commit || "(none)"} branch=${pin.branch || "(none)"}`);
  } finally {
    rmrf(workRoot);
  }
}

try {
  main();
} catch (err) {
  console.error(`[engine-runtime] ${err && err.message ? err.message : err}`);
  process.exit(1);
}
