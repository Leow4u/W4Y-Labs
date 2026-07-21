/**
 * Every decision the renderer makes about updates, in one testable place.
 *
 * This project's vitest runs with `environment: node` — no jsdom, no
 * @testing-library — so a component cannot be rendered in a test. Keeping the
 * decisions here is what makes them provable at all. Nothing below touches the
 * DOM, Electron or the network; the components only wire it up.
 */

import type { UpdateApplyResult, UpdateCheckResult } from "./desktopChrome";

export type { UpdateApplyResult, UpdateCheckResult };

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
  const next = nextChipState(chip, fresh);
  if (isApplicable(fresh) && sameIntention(previousPlan, fresh)) {
    return { action: "reapply", plan: fresh! };
  }
  return { action: "show", chip: next, changed: isApplicable(fresh) };
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
