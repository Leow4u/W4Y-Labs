/**
 * Every decision the renderer makes about updates, in one testable place.
 *
 * This project's vitest runs with `environment: node` — no jsdom, no
 * @testing-library — so a component cannot be rendered in a test. Keeping the
 * decisions here is what makes them provable at all. Nothing below touches the
 * DOM, Electron or the network; the components only wire it up.
 */

import type { UpdateApplyResult, UpdateCheckResult, UpdateOutcome } from "./desktopChrome";

export type { UpdateApplyResult, UpdateCheckResult, UpdateOutcome };

/** Which `t.desktop.*` string the Help menu shows for a CHECK. */
export type UpdateMessageKey =
  | "updateUpToDate"
  | "updateCheckFailed"
  | "updateInProgress"
  | "updatePreparing";

/**
 * Exhaustive and FAIL-CLOSED: only an explicit `up-to-date` earns
 * "updateUpToDate". A status this build does not recognise is reported as
 * "could not check", never as current.
 */
export function updateMessageKey(result: UpdateCheckResult | null): UpdateMessageKey {
  if (!result) return "updateCheckFailed";
  switch (result.status) {
    case "up-to-date":
      return "updateUpToDate";
    case "in-progress":
      return "updateInProgress";
    case "preparing":
      return "updatePreparing";
    default:
      return "updateCheckFailed";
  }
}

/**
 * ONE normalization of an apply reply, used by BOTH surfaces.
 *
 * They disagreed: `{ok:true, status:"staged"}` became `applied` in the chip and
 * a failure in the Help menu; `{ok:false, error:"stale-plan"}` never entered
 * the controlled recovery. Same reply, three readings.
 *
 * Understands the modern vocabulary and the legacy shapes, and fails CLOSED on
 * null, `{}`, a rejected call or an outcome this build does not know.
 */
export type NormalizedApply = { outcome: UpdateOutcome; ok: boolean; error: string | null };

const KNOWN_OUTCOMES = new Set<UpdateOutcome>([
  "applied",
  "staged",
  "no-update",
  "recovered",
  "failed",
  "stale-plan",
]);
/** Outcomes where the requested update reached a correct, non-failed state. */
const OK_OUTCOMES = new Set<UpdateOutcome>(["applied", "staged", "no-update"]);

export function normalizeApply(res: UpdateApplyResult | null | undefined): NormalizedApply {
  if (!res || typeof res !== "object") {
    return { outcome: "failed", ok: false, error: "apply returned nothing" };
  }
  const error = typeof res.error === "string" ? res.error : null;
  if (res.outcome) {
    // Unknown outcome + ok:true still means we cannot tell — fail closed.
    if (!KNOWN_OUTCOMES.has(res.outcome)) {
      return { outcome: "failed", ok: false, error: error ?? `unknown outcome: ${res.outcome}` };
    }
    return { outcome: res.outcome, ok: OK_OUTCOMES.has(res.outcome), error };
  }
  if (res.error === "stale-plan") return { outcome: "stale-plan", ok: false, error };
  if (res.ok === false) return { outcome: "failed", ok: false, error };
  switch (res.status) {
    case "staged":
    case "already-staged":
      return { outcome: "staged", ok: true, error };
    case "no-update":
      return { outcome: "no-update", ok: true, error };
    case "check-failed":
    case "install-failed":
      return { outcome: "failed", ok: false, error };
    default:
      break;
  }
  // Truly legacy: a bare {ok:true} from a shell that predates the vocabulary.
  if (res.ok === true) return { outcome: "applied", ok: true, error };
  return { outcome: "failed", ok: false, error: error ?? "apply reported nothing usable" };
}

/** Which `t.desktop.*` string the Help menu shows for an APPLY. */
export type ApplyMessageKey =
  | "updateApplied"
  | "updateStagedRestart"
  | "updateUpToDate"
  | "updateRecovered"
  | "updateApplyFailed"
  | "updatePlanChanged";

/** Exhaustive; an unrecognised outcome reports failure, never success. */
export function applyMessageKey(outcome: string | null | undefined): ApplyMessageKey {
  switch (outcome) {
    case "applied":
      return "updateApplied";
    case "staged":
      return "updateStagedRestart";
    case "no-update":
      return "updateUpToDate";
    case "recovered":
      return "updateRecovered";
    case "stale-plan":
      return "updatePlanChanged";
    default:
      return "updateApplyFailed";
  }
}

/**
 * Can this answer be handed to `apply()`?
 *
 * Two shapes are accepted, and the second one matters: a shell older than the
 * tri-state contract answers `{available:true, version, token}` with NO status.
 * Requiring `status === "available"` (as the first version of this did) silently
 * removed the update path for every one of those installs — a new web bundle is
 * served to whatever shell the user happens to be running, so that pairing is
 * real, not hypothetical.
 *
 * A MODERN `available` must carry a token: the main refuses a tokenless apply
 * rather than borrowing another plan, so offering one is a guaranteed dead click.
 */
export function isApplicable(result: UpdateCheckResult | null): boolean {
  if (!result) return false;
  if (result.status === "available") return typeof result.token === "string" && !!result.token;
  // Legacy shell: no status field at all. Trust `available` as it was designed.
  if (result.status === undefined && result.available === true) return true;
  return false;
}

/** True while the shell reports work in flight — the chip must not be clickable. */
export function isBusy(result: UpdateCheckResult | null): boolean {
  return !!result && result.status === "in-progress";
}

/** What the chip holds, distinguishing actionable from merely informative. */
export interface ChipState {
  /** The plan to apply, or null. Only ever set when `isApplicable` held. */
  plan: UpdateCheckResult | null;
  /** Shown but NOT clickable: work in flight, or a build not ready yet. */
  notice: "in-progress" | "preparing" | null;
  /** Last failure worth offering a retry for. */
  error: string | null;
}

export const emptyChip: ChipState = { plan: null, notice: null, error: null };

/**
 * Fold a check result into the chip's next state.
 *
 * Rules, and why:
 *  - `available` replaces whatever was there. A newer plan always wins.
 *  - `up-to-date` is the ONLY verified clear.
 *  - `preparing` is a conclusion that there is NO staged build ready. Keeping a
 *    previous engine `ready` token clickable there would offer a restart into
 *    an artifact the check just said does not exist.
 *  - `in-progress` means work is happening now; the chip shows it but must not
 *    start a second, concurrent action.
 *  - `unknown` proves nothing, so it changes nothing — an actionable plan
 *    survives a network blip. It is NOT re-presented as fresh evidence: the
 *    plan is only ever re-validated by the main at apply time.
 */
export function nextChipState(
  previous: ChipState,
  result: UpdateCheckResult | null,
): ChipState {
  if (isApplicable(result)) return { plan: result, notice: null, error: null };
  switch (result?.status) {
    case "up-to-date":
      return emptyChip;
    case "preparing":
      // No staged build exists. Drop any actionable engine plan.
      return { plan: null, notice: "preparing", error: null };
    case "in-progress":
      return { plan: null, notice: "in-progress", error: previous.error };
    default:
      // unknown / unrecognised / null: inconclusive. Keep what we had.
      return previous;
  }
}

/**
 * What to do when a click came back `stale-plan`.
 *
 * The old behaviour asked for a fresh check and stopped: no message, and the
 * user had to guess that a SECOND click was now required. But re-applying
 * blindly is worse — the fresh plan may be a different layer, kind or version,
 * i.e. a decision the user never made.
 *
 * So: exactly one controlled recovery. Re-apply automatically only when the new
 * plan is the same intention; otherwise show it and let the user choose. Never
 * loop.
 */
export type StaleRecovery =
  | { action: "reapply"; plan: UpdateCheckResult }
  | { action: "show"; chip: ChipState; changed: boolean };

export function recoverFromStalePlan(
  previousPlan: UpdateCheckResult | null,
  fresh: UpdateCheckResult | null,
  chip: ChipState,
): StaleRecovery {
  // The token that produced this stale-plan is DEAD — consumed or expired. It
  // may never stay actionable, so recovery always starts from a chip with no
  // plan. Folding the recheck onto the old chip (what this did) let an
  // `unknown` recheck "preserve" the very token the main had just refused,
  // which is the silent second click all over again.
  const base: ChipState = { plan: null, notice: chip.notice, error: chip.error };
  if (isApplicable(fresh) && sameIntention(previousPlan, fresh)) {
    return { action: "reapply", plan: fresh! };
  }
  if (isApplicable(fresh)) {
    // A different plan: offer it, but never perform it — the user chose the
    // other one.
    return { action: "show", chip: { plan: fresh, notice: null, error: null }, changed: true };
  }
  const next = nextChipState(base, fresh);
  return {
    action: "show",
    // No usable plan came back. State the fact instead of leaving a dead button.
    chip: { ...next, plan: null, error: next.error ?? "update plan expired" },
    changed: false,
  };
}

/** Same layer, same kind, same version — anything else is another decision. */
export function sameIntention(
  before: UpdateCheckResult | null,
  after: UpdateCheckResult | null,
): boolean {
  if (!before || !after) return false;
  if ((before.kind ?? null) !== (after.kind ?? null)) return false;
  if ((before.version ?? null) !== (after.version ?? null)) return false;
  return true;
}
