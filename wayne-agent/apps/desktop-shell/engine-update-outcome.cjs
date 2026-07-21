/**
 * engine-update-outcome.cjs — what an engine update run actually concluded.
 *
 * The defect this exists to kill: `runBackgroundEngineUpdateWork()` signalled
 * everything by returning `undefined`. `fetchEngineManifest()` collapses six
 * distinct failures into `null` — offline, DNS dead, timeout, HTTP != 200,
 * unparseable JSON, a payload with no https zipUrl — and the work function then
 * did `if (!manifest || !manifest.zipUrl) return;`. A normal return.
 *
 * For the silent background sweep that is fine and deliberate: a machine on a
 * plane should not be nagged. For the USER'S retry it was a lie. Because
 * `retryEngineUpdate()` writes `phase:"idle"` and `manualRetryFailed:false`
 * BEFORE running, and then judges the run by `!res.ok || after.phase ===
 * "failed"`, an offline retry evaluated `false || false` and answered
 * `{ok:true}` — clearing the very warning the user clicked, with nothing left
 * to press.
 *
 * So the run has to say what happened, and "finished without throwing" is not
 * one of the answers. Electron-free (same reason as single-flight.cjs): main
 * cannot be imported by a test, so the vocabulary and the verdict live here.
 */

/** Manifest read, nothing newer than what is installed. */
const NO_UPDATE = "no-update";
/** Manifest read, and its build is already staged and waiting. */
const ALREADY_STAGED = "already-staged";
/** Manifest read, bytes fetched and staged during THIS run. */
const STAGED = "staged";
/** The manifest could not be read. Nothing was verified. */
const CHECK_FAILED = "check-failed";
/** Manifest read, but downloading/installing it failed. */
const INSTALL_FAILED = "install-failed";

const ALL = [NO_UPDATE, ALREADY_STAGED, STAGED, CHECK_FAILED, INSTALL_FAILED];

/** Statuses that prove the remote manifest was actually consulted. */
const VERIFIED = new Set([NO_UPDATE, ALREADY_STAGED, STAGED, INSTALL_FAILED]);

/** Statuses where nothing is wrong and nothing is pending. */
const CLEAN = new Set([NO_UPDATE, ALREADY_STAGED, STAGED]);

function outcome(status, extra = {}) {
  if (!ALL.includes(status)) throw new Error(`unknown engine outcome: ${status}`);
  return { status, ...extra };
}

/** Did this run establish anything about the remote side? */
function isVerified(result) {
  return !!result && VERIFIED.has(result.status);
}

/** Did this run end with nothing owed and nothing broken? */
function isClean(result) {
  return !!result && CLEAN.has(result.status);
}

/**
 * The verdict for a run the USER asked for.
 *
 * Deliberately does NOT consult `phase` from disk the way the old code did:
 * the retry resets `phase` to "idle" before starting, so reading it back could
 * only ever agree with itself. The run's own answer decides, and the state on
 * disk is consulted only to recover an error message.
 *
 * @param {object} input
 * @param {{status: string, error?: string}|null|undefined} input.result
 *        what the run returned; null/undefined means it told us nothing, which
 *        is itself a failure for a manual action.
 * @param {{lastError?: string|null}} [input.stateAfter] on-disk state, for text
 * @returns {{ok: boolean, status: string, error?: string, keepChip: boolean}}
 *          `keepChip` — the warning must stay visible and clickable.
 */
function judgeManualRetry({ result, stateAfter = {} }) {
  if (!result || !result.status) {
    return {
      ok: false,
      status: CHECK_FAILED,
      error: (stateAfter && stateAfter.lastError) || "update did not report a result",
      keepChip: true,
    };
  }
  if (isClean(result)) {
    return { ok: true, status: result.status, keepChip: false };
  }
  return {
    ok: false,
    status: result.status,
    error:
      result.error ||
      (stateAfter && stateAfter.lastError) ||
      (result.status === CHECK_FAILED
        ? "could not reach the update manifest"
        : "update failed"),
    keepChip: true,
  };
}

module.exports = {
  NO_UPDATE,
  ALREADY_STAGED,
  STAGED,
  CHECK_FAILED,
  INSTALL_FAILED,
  ALL,
  outcome,
  isVerified,
  isClean,
  judgeManualRetry,
};
