/**
 * Translating an update check into what the user is told, and into what the
 * chip does next.
 *
 * Both decisions were being made by truthiness, and both lied:
 *
 *  - The Help menu did `r ? updateUpToDate : updateCheckFailed`, so ANY
 *    non-null answer — including `{available:false, status:"unknown"}`, which
 *    means "we could not check" — printed "you are on the latest version".
 *  - The chip read `r.available` alone, so a transient failed check replaced a
 *    plan the user could have acted on with nothing.
 *
 * Pure on purpose: this project's vitest runs with `environment: node`, no
 * jsdom and no @testing-library, so a component cannot be rendered in a test.
 * Keeping the decisions here is what makes them testable at all.
 */

/** What the shell's `update.check()` can answer. */
export interface UpdateCheckResult {
  available?: boolean;
  version?: string | null;
  kind?: string;
  token?: string;
  status?: string;
  unverified?: string[];
}

/** Which `t.desktop.*` string the Help menu should show. */
export type UpdateMessageKey =
  | "updateUpToDate"
  | "updateCheckFailed"
  | "updateInProgress"
  | "updatePreparing";

/**
 * Exhaustive and FAIL-CLOSED: only an explicit `up-to-date` earns
 * "updateUpToDate". A missing status (an older shell) or one this build does
 * not recognise is reported as "could not check", never as current.
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
    case "unknown":
      return "updateCheckFailed";
    default:
      return "updateCheckFailed";
  }
}

/** True when this answer names a plan the user can apply right now. */
export function isApplicable(result: UpdateCheckResult | null): boolean {
  return !!result && result.status === "available" && result.available === true;
}

/**
 * What the chip should hold after a check.
 *
 * `previous` is what it holds today. The rule: only a VERIFIED answer may take
 * an actionable plan away. An inconclusive check keeps whatever was there —
 * the bytes of a staged update are already on disk and a stalled one still
 * needs the user, so dropping it on a network blip stranded them.
 */
export function nextChipPlan(
  previous: UpdateCheckResult | null,
  result: UpdateCheckResult | null,
): UpdateCheckResult | null {
  if (isApplicable(result)) return result; // a new plan always wins
  if (result && result.status === "up-to-date") return null; // verified: clear it
  // unknown / in-progress / preparing / unrecognised / null: inconclusive.
  // Keep an actionable plan if we had one; otherwise stay empty.
  return isApplicable(previous) ? previous : null;
}
