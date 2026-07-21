/**
 * apply-outcome.cjs — the ONE vocabulary for "what did apply() actually do".
 *
 * Reproduced before this existed: the tray computed
 *
 *   const outcome = res.outcome || (res.status === "staged" ? "staged" : "applied");
 *
 * so `{ok:true, status:"no-update"}` and `{ok:true, status:"already-staged"}`
 * both announced "Atualização aplicada". Nothing had been installed in either
 * case — one meant the machine was already current, the other that the bytes
 * had been waiting since a previous run. "Any {ok:true} is applied" is exactly
 * the fallback that produced it.
 *
 * Electron-free so every mapping is testable without a shell.
 */

/** The install/relaunch was actually fired. */
const APPLIED = "applied";
/** Bytes are ready; the update lands on the NEXT restart. */
const STAGED = "staged";
/** Nothing needed installing. A true no-op. */
const NO_UPDATE = "no-update";
/** The install failed and the CURRENT build was reopened. */
const RECOVERED = "recovered";
/** A real failure. */
const FAILED = "failed";
/** The plan could no longer be honoured, so nothing was attempted. */
const STALE_PLAN = "stale-plan";

const ALL = [APPLIED, STAGED, NO_UPDATE, RECOVERED, FAILED, STALE_PLAN];

/** Outcomes where the user has nothing more to do right now. */
const SETTLED = new Set([APPLIED, STAGED, NO_UPDATE]);

/**
 * Map an engine-run status onto an apply outcome.
 *
 * Deliberately exhaustive and fail-closed: a status this build does not know
 * becomes `failed`, never `applied`. Inventing success from an unrecognised
 * answer is the whole class of bug this module exists to end.
 *
 * @param {string|null|undefined} status from engine-update-outcome.cjs
 */
function fromEngineStatus(status) {
  switch (status) {
    case "staged":
    case "already-staged":
      // Both mean the same thing to the user: ready, pending a restart.
      return STAGED;
    case "no-update":
      return NO_UPDATE;
    case "install-failed":
    case "check-failed":
      return FAILED;
    default:
      return FAILED; // unknown status — fail closed
  }
}

/**
 * Normalize whatever `applyUnifiedUpdate()` returned into one outcome.
 *
 * @param {{ok?: boolean, outcome?: string, status?: string, error?: string}|null} res
 * @returns {{outcome: string, ok: boolean, error: string|null}}
 */
function normalizeApplyResult(res) {
  if (!res || typeof res !== "object") {
    return { outcome: FAILED, ok: false, error: "apply returned nothing" };
  }
  const error = typeof res.error === "string" ? res.error : null;
  // An explicit outcome wins — but only if we recognise it.
  if (res.outcome && ALL.includes(res.outcome)) {
    // `ok` means "settled — the user has nothing left to do". `recovered` is
    // NOT that: the update did not happen and a retry is still owed, even
    // though the app came back up.
    return { outcome: res.outcome, ok: SETTLED.has(res.outcome), error };
  }
  if (res.error === "stale-plan" || res.outcome === "stale-plan") {
    return { outcome: STALE_PLAN, ok: false, error: error || "stale-plan" };
  }
  if (res.ok === false) return { outcome: FAILED, ok: false, error };
  // ok:true with a status we must translate — never a blanket "applied".
  if (res.status) {
    const outcome = fromEngineStatus(res.status);
    return { outcome, ok: SETTLED.has(outcome), error };
  }
  // ok:true and nothing else. The shell/relaunch paths answer exactly this, and
  // the process normally dies inside them, so `applied` is the honest reading.
  return { outcome: APPLIED, ok: true, error };
}

module.exports = {
  APPLIED,
  STAGED,
  NO_UPDATE,
  RECOVERED,
  FAILED,
  STALE_PLAN,
  ALL,
  SETTLED,
  fromEngineStatus,
  normalizeApplyResult,
};
