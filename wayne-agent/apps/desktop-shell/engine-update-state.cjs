/**
 * What the background engine update is doing, as a file.
 *
 * Lives at <WAYNE_HOME>/engine-update-state.json and exists so that a failure
 * is never silent: the renderer reads this to decide between the quiet "ready"
 * pill and the louder "stalled" one, and the dialog quotes `lastError` /
 * `lastErrorStage` verbatim instead of a generic "something went wrong".
 *
 * Written tmp+rename so a crash mid-write can never leave truncated JSON that
 * would make the next boot think there is no update at all.
 */
const fs = require("fs");
const path = require("path");

/** Consecutive failures before we stop being quiet about it. */
const STALLED_AFTER = 3;

const EMPTY = {
  zipUrl: null,
  version: null,
  phase: "idle", // idle | installing | staged | failed | rolled-back
  attempts: 0,
  lastError: null,
  lastErrorStage: null,
  lastAttemptAt: null,
  lastCheckAt: null,
};

function stateFile(wayneHome) {
  return path.join(wayneHome, "engine-update-state.json");
}

function readState(wayneHome) {
  try {
    const j = JSON.parse(fs.readFileSync(stateFile(wayneHome), "utf8"));
    return j && typeof j === "object" ? { ...EMPTY, ...j } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function writeState(wayneHome, patch) {
  const next = { ...readState(wayneHome), ...patch };
  const target = stateFile(wayneHome);
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(wayneHome, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, target);
  } catch {
    /* best-effort: a lost state file only costs one extra attempt */
  }
  return next;
}

/** True once the user deserves to be told the update is not going through. */
function isStalled(state) {
  return state.phase === "failed" && (state.attempts || 0) >= STALLED_AFTER;
}

module.exports = { EMPTY, STALLED_AFTER, isStalled, readState, stateFile, writeState };
