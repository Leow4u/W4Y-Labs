/**
 * slot-venv.cjs — reuse previous slot venv when staging a new engine.
 *
 * Virgin slots must stay without venv through `repository` (install.ps1 would
 * otherwise taskkill the live engine). After source lands, copy an idle
 * previous venv and skip recreate — then `dependencies` / uv sync only when
 * uv.lock changed.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function fileSha256(p) {
  try {
    const h = crypto.createHash("sha256");
    h.update(fs.readFileSync(p));
    return h.digest("hex");
  } catch {
    return null;
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
 * Resolve a previous complete engine tree that is safe to read venv from.
 * Prefer engine-source.root (prior slot); fall back to junction target of
 * engineRoot when it is a link.
 */
function resolveDonorRoot({ wayneHome, engineRoot, readEngineSource, isLink, exists: existsFn }) {
  const src = typeof readEngineSource === "function" ? readEngineSource() : null;
  if (src && src.root && existsFn(path.join(src.root, "venv"))) return src.root;
  if (engineRoot && isLink(engineRoot)) {
    try {
      const target = fs.readlinkSync(engineRoot);
      if (target && existsFn(path.join(target, "venv"))) return target;
    } catch {
      /* */
    }
  }
  // Real directory at wayne-agent (pre-junction machine): only safe if we are
  // NOT going to run Install-Venv against a path that triggers taskkill on the
  // live tree — donor copy FROM here into a virgin slot is OK (read-only).
  if (engineRoot && existsFn(path.join(engineRoot, "venv"))) return engineRoot;
  return null;
}

function lockChanged(donorRoot, targetRoot) {
  const a = fileSha256(path.join(donorRoot, "uv.lock"));
  const b = fileSha256(path.join(targetRoot, "uv.lock"));
  if (!a || !b) return true; // unknown → must sync
  return a !== b;
}

/**
 * After `repository` into target: try to reuse donor venv.
 * @returns {{ reused: boolean, skipVenv: boolean, skipDependencies: boolean, donor: string|null }}
 */
function planVenvReuse({ donorRoot, targetRoot, log = () => {} }) {
  const empty = { reused: false, skipVenv: false, skipDependencies: false, donor: null };
  if (!donorRoot || !targetRoot) return empty;
  const donorVenv = path.join(donorRoot, "venv");
  const targetVenv = path.join(targetRoot, "venv");
  if (!exists(donorVenv)) return empty;
  if (exists(targetVenv)) {
    // Should not happen on a virgin slot; refuse to fight it.
    return empty;
  }
  try {
    log(`slot: copying venv from ${donorRoot}`);
    copyDirRecursive(donorVenv, targetVenv);
    const needSync = lockChanged(donorRoot, targetRoot);
    log(`slot: venv reused; uv.lock changed=${needSync}`);
    return {
      reused: true,
      skipVenv: true,
      skipDependencies: !needSync,
      donor: donorRoot,
    };
  } catch (e) {
    log(`slot: venv copy failed: ${String((e && e.message) || e)}`);
    try {
      fs.rmSync(targetVenv, { recursive: true, force: true });
    } catch {
      /* */
    }
    return empty;
  }
}

module.exports = {
  resolveDonorRoot,
  planVenvReuse,
  lockChanged,
  fileSha256,
};
