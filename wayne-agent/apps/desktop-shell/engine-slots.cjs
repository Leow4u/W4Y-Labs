/**
 * Engine slots — where a NEW engine is installed while the OLD one is running.
 *
 * The problem this solves: until 0.3.9 the shell downloaded and installed the
 * engine DURING boot, before the window could load anything, so the user stared
 * at a black "Atualizando o motor…" screen. Nothing else on the desktop behaves
 * like that (Chrome, VS Code and our own shell updater all install behind the
 * running app and offer a restart).
 *
 * Installing behind the running engine is only possible because of two facts,
 * both verified on Windows before this module was written:
 *
 *  1. install.ps1 only kills processes when the target has a `venv\` (the whole
 *     taskkill/schtasks block sits inside `if (Test-Path "venv")`). A VIRGIN
 *     target therefore never touches the engine that is currently serving.
 *  2. A directory JUNCTION does not require elevation on Windows (a symlink
 *     does), removing the link never follows through to the target, and
 *     repointing is a metadata operation — milliseconds.
 *
 * So: install into `<WAYNE_HOME>/e/<hash8>`, and "switching version" is just
 * repointing the junction at `<WAYNE_HOME>/wayne-agent`. The canonical path
 * never changes, which is what keeps PATH, the gateway's scheduled task,
 * backups and every `wayne` shell alias working without knowing any of this.
 *
 * This module holds ONLY filesystem primitives — no policy, no networking.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/** Marker install.ps1 writes when a tree finished bootstrapping. */
const COMPLETE_MARKER = ".wayne-bootstrap-complete";

/**
 * Slot identity is the sha1 of the zipUrl, NOT the manifest's `version`.
 * `version` is a hand-edited label in latest.json and would flow straight into
 * a filesystem path — `/`, `..`, `:` and trailing dots are all reachable there.
 */
function slotId(zipUrl) {
  return crypto.createHash("sha1").update(String(zipUrl)).digest("hex").slice(0, 8);
}

function slotsRoot(wayneHome) {
  return path.join(wayneHome, "e");
}

function slotDir(wayneHome, zipUrl) {
  return path.join(slotsRoot(wayneHome), slotId(zipUrl));
}

/** True when the path is a junction/symlink rather than a real directory. */
function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function exists(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** A tree that finished installing (the installer's own completion marker). */
function isComplete(dir) {
  return exists(path.join(dir, COMPLETE_MARKER));
}

/**
 * Can this filesystem host a junction at all? Answered by DOING it in a temp
 * spot, because the failure modes (group policy, ReFS, a network home) only
 * show up at creation time. Called before anything is mutated, so a machine
 * that cannot do this simply keeps the old in-place behaviour.
 */
function junctionsSupported(wayneHome) {
  const probeTarget = path.join(slotsRoot(wayneHome), ".probe-target");
  const probeLink = path.join(slotsRoot(wayneHome), ".probe-link");
  try {
    fs.mkdirSync(probeTarget, { recursive: true });
    try {
      fs.rmSync(probeLink, { recursive: true, force: true });
    } catch {
      /* nothing there yet */
    }
    fs.symlinkSync(probeTarget, probeLink, "junction");
    const ok = isLink(probeLink);
    fs.rmSync(probeLink, { recursive: true, force: true });
    fs.rmSync(probeTarget, { recursive: true, force: true });
    return ok;
  } catch {
    try {
      fs.rmSync(probeLink, { recursive: true, force: true });
      fs.rmSync(probeTarget, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
    return false;
  }
}

/**
 * Point `linkPath` at `target`, replacing whatever link is there.
 *
 * `fs.rmSync` on a junction removes the LINK only — Node does not follow
 * reparse points — so the previous slot survives and rollback stays possible.
 * Refuses to run when `linkPath` is a real directory: that case goes through
 * adoptRealTree() first, on purpose, so we never delete a real engine tree.
 */
function pointJunction(linkPath, target) {
  if (exists(linkPath) && !isLink(linkPath)) {
    throw new Error(`refusing to replace a real directory at ${linkPath}`);
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  if (exists(linkPath)) fs.rmSync(linkPath, { recursive: true, force: true });
  fs.symlinkSync(target, linkPath, "junction");
}

/**
 * First migration: today's installs have a REAL directory at wayne-agent.
 * Move it into a slot so the canonical path can become a junction.
 *
 * A same-volume directory rename is a metadata operation and succeeds even
 * with mapped .pyd files — the same idiom install.ps1 already relies on for
 * `venv.stale.<ts>`. Deleting in place would NOT work; renaming does.
 * Returns the slot it now lives in.
 */
function adoptRealTree(wayneHome, enginePath, label = "legacy") {
  const dest = path.join(slotsRoot(wayneHome), label);
  fs.mkdirSync(slotsRoot(wayneHome), { recursive: true });
  if (exists(dest)) {
    // A previous adoption left this behind; keep it, take a fresh name.
    let n = 1;
    let alt = `${dest}.${n}`;
    while (exists(alt)) alt = `${dest}.${++n}`;
    fs.renameSync(enginePath, alt);
    return alt;
  }
  fs.renameSync(enginePath, dest);
  return dest;
}

/**
 * A slot guaranteed safe to install into.
 *
 * install.ps1 throws "Target directory exists but is not a Wayne install" when
 * it finds a half-built tree, which would poison that slot FOREVER — and an
 * interrupted background install (app closed, machine slept) leaves exactly
 * that. So an incomplete leftover is moved aside as `<id>.badN` and the caller
 * gets a clean path.
 */
function freshSlot(wayneHome, zipUrl) {
  const dir = slotDir(wayneHome, zipUrl);
  fs.mkdirSync(slotsRoot(wayneHome), { recursive: true });
  if (exists(dir) && !isComplete(dir)) {
    let n = 1;
    while (exists(`${dir}.bad${n}`)) n += 1;
    try {
      fs.renameSync(dir, `${dir}.bad${n}`);
    } catch {
      // Renaming failed (something still holds it) — install next to it
      // instead of failing the whole update.
      let m = 1;
      while (exists(`${dir}.${m}`)) m += 1;
      return `${dir}.${m}`;
    }
  }
  return dir;
}

/**
 * Delete slots nobody references. Best-effort by design: a slot still held by
 * a dying process just survives to the next boot.
 */
function gcSlots(wayneHome, keep = []) {
  const root = slotsRoot(wayneHome);
  const keepSet = new Set(keep.filter(Boolean).map((p) => path.resolve(p).toLowerCase()));
  let removed = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return 0;
  }
  for (const name of entries) {
    const full = path.join(root, name);
    if (keepSet.has(path.resolve(full).toLowerCase())) continue;
    try {
      fs.rmSync(full, { recursive: true, force: true });
      removed += 1;
    } catch {
      /* still locked — next boot */
    }
  }
  return removed;
}

module.exports = {
  COMPLETE_MARKER,
  adoptRealTree,
  exists,
  freshSlot,
  gcSlots,
  isComplete,
  isLink,
  junctionsSupported,
  pointJunction,
  slotDir,
  slotId,
  slotsRoot,
};
