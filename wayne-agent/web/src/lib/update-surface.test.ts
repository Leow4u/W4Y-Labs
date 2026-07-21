/**
 * Every renderer decision about updates, driven through the SAME functions the
 * components call. Pure by necessity: this project's vitest runs with
 * `environment: node`, no jsdom, so nothing here renders a component. These
 * prove decision logic — not Electron, not React, not a real install.
 *
 * Reproduced before the fixes:
 *  - `isApplicable` demanded `status === "available"`, which silently removed
 *    the update path for every shell older than the tri-state contract (those
 *    answer `{available:true, token}` with no status at all).
 *  - `nextChipPlan` kept a previous engine `ready` token alive through
 *    `preparing` — a status that means precisely "there is no staged build".
 *  - A `stale-plan` click only re-checked: no message, and a silent second
 *    click required.
 */
import { describe, expect, it } from "vitest";

import {
  applyMessageKey,
  emptyChip,
  isApplicable,
  isBusy,
  nextChipState,
  recoverFromStalePlan,
  sameIntention,
  updateMessageKey,
  type UpdateCheckResult,
} from "./update-surface";

const plan = (over: Partial<UpdateCheckResult> = {}): UpdateCheckResult => ({
  available: true,
  status: "available",
  version: "0.4.1",
  kind: "ready",
  token: "tok-1",
  ...over,
});

describe("check → Help menu message (exhaustive, fail-closed)", () => {
  it("only an explicit up-to-date says you are current", () => {
    expect(updateMessageKey({ available: false, status: "up-to-date" })).toBe(
      "updateUpToDate",
    );
  });

  it("unknown, missing and unrecognised all report a failed check", () => {
    expect(updateMessageKey({ available: false, status: "unknown" })).toBe(
      "updateCheckFailed",
    );
    expect(updateMessageKey({ available: false })).toBe("updateCheckFailed");
    expect(updateMessageKey(null)).toBe("updateCheckFailed");
  });

  it("in-progress and preparing get their own message", () => {
    expect(updateMessageKey({ status: "in-progress" })).toBe("updateInProgress");
    expect(updateMessageKey({ status: "preparing" })).toBe("updatePreparing");
  });
});

describe("apply → message (exhaustive, fail-closed)", () => {
  it.each([
    ["applied", "updateApplied"],
    ["staged", "updateStagedRestart"],
    ["no-update", "updateUpToDate"],
    ["recovered", "updateRecovered"],
    ["stale-plan", "updatePlanChanged"],
    ["failed", "updateApplyFailed"],
  ])("%s → %s", (outcome, key) => {
    expect(applyMessageKey(outcome)).toBe(key);
  });

  it("an unknown or missing outcome reports failure, never success", () => {
    expect(applyMessageKey("brand-new")).toBe("updateApplyFailed");
    expect(applyMessageKey(undefined)).toBe("updateApplyFailed");
    expect(applyMessageKey(null)).toBe("updateApplyFailed");
  });
});

describe("isApplicable — modern needs a token, legacy still works", () => {
  it("a modern available WITHOUT a token is not applicable", () => {
    // The main refuses a tokenless apply rather than borrowing another plan,
    // so offering it would be a guaranteed dead click.
    expect(isApplicable(plan({ token: undefined }))).toBe(false);
    expect(isApplicable(plan())).toBe(true);
  });

  it("a LEGACY shell (no status at all) keeps its update path", () => {
    // Regression: requiring status === "available" removed updates entirely for
    // every install running a shell older than the tri-state contract.
    expect(isApplicable({ available: true, version: "1", token: "t" })).toBe(true);
    expect(isApplicable({ available: true })).toBe(true);
    expect(isApplicable({ available: false })).toBe(false);
  });

  it("a non-available modern status is never applicable", () => {
    for (const status of ["preparing", "in-progress", "unknown", "up-to-date"] as const) {
      expect(isApplicable({ available: true, status, token: "t" })).toBe(false);
    }
  });

  it("in-progress is reported as busy", () => {
    expect(isBusy({ status: "in-progress" })).toBe(true);
    expect(isBusy(plan())).toBe(false);
  });
});

describe("chip state transitions", () => {
  const actionable = { plan: plan(), notice: null, error: null };

  it("available replaces whatever was there", () => {
    const fresh = plan({ token: "tok-2", version: "0.4.2" });
    expect(nextChipState(actionable, fresh)).toEqual({
      plan: fresh,
      notice: null,
      error: null,
    });
  });

  it("a VERIFIED up-to-date is the only clear", () => {
    expect(nextChipState(actionable, { status: "up-to-date" })).toEqual(emptyChip);
  });

  it("preparing DROPS an old ready token — it means no staged build exists", () => {
    const next = nextChipState(actionable, { status: "preparing", version: "9" });
    expect(next.plan).toBeNull();
    expect(next.notice).toBe("preparing");
  });

  it("in-progress leaves nothing clickable", () => {
    const next = nextChipState(actionable, { status: "in-progress" });
    expect(next.plan).toBeNull();
    expect(next.notice).toBe("in-progress");
  });

  it("unknown changes nothing — a blip must not strand the user", () => {
    expect(nextChipState(actionable, { status: "unknown" })).toBe(actionable);
    expect(nextChipState(actionable, null)).toBe(actionable);
  });

  it("an unrecognised status is inconclusive, not a clear", () => {
    expect(
      nextChipState(actionable, { status: "brand-new" } as unknown as UpdateCheckResult),
    ).toBe(actionable);
  });

  it("with nothing held, an inconclusive check stays empty", () => {
    expect(nextChipState(emptyChip, { status: "unknown" })).toBe(emptyChip);
  });
});

describe("stale-plan recovery — one controlled attempt, never a loop", () => {
  const before = plan({ token: "old" });
  const chip = { plan: before, notice: null, error: null };

  it("re-applies when the fresh plan is the SAME intention", () => {
    const fresh = plan({ token: "new" }); // same kind + version
    const d = recoverFromStalePlan(before, fresh, chip);
    expect(d.action).toBe("reapply");
    expect(d.action === "reapply" && d.plan.token).toBe("new");
  });

  it("does NOT auto-apply a different version", () => {
    const d = recoverFromStalePlan(before, plan({ token: "new", version: "9.9" }), chip);
    expect(d.action).toBe("show");
    expect(d.action === "show" && d.changed).toBe(true);
  });

  it("does NOT auto-apply a different kind", () => {
    const d = recoverFromStalePlan(before, plan({ token: "new", kind: "stalled" }), chip);
    expect(d.action).toBe("show");
  });

  it("shows the truth when the recheck is inconclusive", () => {
    const d = recoverFromStalePlan(before, { status: "unknown" }, chip);
    expect(d.action).toBe("show");
    expect(d.action === "show" && d.changed).toBe(false);
    // The plan survives an inconclusive recheck.
    expect(d.action === "show" && d.chip.plan).toBe(before);
  });

  it("drops the plan when the recheck says preparing", () => {
    const d = recoverFromStalePlan(before, { status: "preparing" }, chip);
    expect(d.action === "show" && d.chip.plan).toBeNull();
  });

  it("never re-applies on a null recheck", () => {
    expect(recoverFromStalePlan(before, null, chip).action).toBe("show");
  });

  it("sameIntention needs kind AND version to match", () => {
    expect(sameIntention(before, plan({ token: "x" }))).toBe(true);
    expect(sameIntention(before, plan({ version: "9" }))).toBe(false);
    expect(sameIntention(before, plan({ kind: "stalled" }))).toBe(false);
    expect(sameIntention(before, null)).toBe(false);
  });
});
