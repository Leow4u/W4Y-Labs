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
function normalizeApplyResult(res, { legacy = true } = {}) {
  if (!res || typeof res !== "object") {
    return { outcome: FAILED, ok: false, error: "apply returned nothing" };
  }
  const error = typeof res.error === "string" ? res.error : null;

  // An explicit outcome the vocabulary knows.
  if (res.outcome && ALL.includes(res.outcome)) {
    return { outcome: res.outcome, ok: SETTLED.has(res.outcome), error };
  }
  // An explicit outcome it does NOT know. `ok:true` alongside it means nothing:
  // this build cannot tell what happened, so it must not claim an install.
  // (Previously this fell through to the bare-ok:true branch and answered
  // `applied` — with a test that asserted exactly that, named as if it proved
  // the opposite.)
  if (res.outcome) {
    return { outcome: FAILED, ok: false, error: error || `unknown outcome: ${res.outcome}` };
  }

  if (res.error === "stale-plan") {
    return { outcome: STALE_PLAN, ok: false, error: error || "stale-plan" };
  }
  if (res.ok === false) return { outcome: FAILED, ok: false, error };
  if (res.status) {
    const outcome = fromEngineStatus(res.status);
    return { outcome, ok: SETTLED.has(outcome), error };
  }
  // A bare `{ok:true}` with no outcome and no status. Only a shell old enough
  // to predate the vocabulary answers this, and only the relaunch paths do —
  // the process normally dies inside them. Reading it as `applied` is a LEGACY
  // adapter, not the general fallback, and callers that know they are talking
  // to a modern shell pass `legacy:false` to refuse it.
  if (res.ok === true && legacy) return { outcome: APPLIED, ok: true, error };
  return { outcome: FAILED, ok: false, error: error || "apply reported nothing usable" };
}

/**
 * What a TOKENLESS apply should do with the fresh check it just ran.
 *
 * `if (!fresh || !fresh.available) return no-update` collapsed four different
 * answers into "you are on the latest version": `unknown` (nothing was
 * verified), `in-progress` (an install is running), `preparing` (a newer build
 * exists but is not ready) and a genuine `up-to-date`. Only the last one is
 * that sentence.
 *
 * @returns {{action:"apply", token:string} | {action:"answer", result:object}}
 */
function judgeTokenlessApply(fresh) {
  if (!fresh || typeof fresh !== "object") {
    return { action: "answer", result: { ok: false, outcome: FAILED, error: "check-failed" } };
  }
  switch (fresh.status) {
    case "available":
      return fresh.token
        ? { action: "apply", token: fresh.token }
        : {
            action: "answer",
            result: { ok: false, outcome: STALE_PLAN, error: "no-token" },
          };
    case "up-to-date":
      return { action: "answer", result: { ok: true, outcome: NO_UPDATE } };
    case "unknown":
      return {
        action: "answer",
        result: { ok: false, outcome: FAILED, error: "check-failed", unverified: fresh.unverified || [] },
      };
    case "in-progress":
      return { action: "answer", result: { ok: false, outcome: FAILED, error: "update-in-progress" } };
    case "preparing":
      return { action: "answer", result: { ok: false, outcome: FAILED, error: "update-not-ready" } };
    default:
      // Legacy shells answer only `available`; anything else fails closed.
      if (fresh.status === undefined && fresh.available === true && fresh.token) {
        return { action: "apply", token: fresh.token };
      }
      return { action: "answer", result: { ok: false, outcome: FAILED, error: "check-failed" } };
  }
}

module.exports = {
  judgeTokenlessApply,
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
