/**
 * Translating an update check into a message and into the chip's next state.
 *
 * Reproduced before the fix:
 *  - WindowChrome did `r ? t.desktop.updateUpToDate : t.desktop.updateCheckFailed`,
 *    so `{available:false, status:"unknown"}` — "we could not check" — printed
 *    "you are on the latest version" purely because the object was not null.
 *  - The chip read `r.available` alone, so a transient failed check replaced an
 *    actionable plan with nothing.
 *
 * These drive the same functions the components call. They render nothing and
 * prove nothing about Electron, a feed or an install.
 */
import { describe, expect, it } from "vitest";

import { isApplicable, nextChipPlan, updateMessageKey } from "./update-surface";

const plan = (over: Record<string, unknown> = {}) => ({
  available: true,
  status: "available",
  version: "0.4.1",
  token: "tok-1",
  ...over,
});

describe("Help menu: only an explicit up-to-date says you are current", () => {
  it("unknown does NOT become updateUpToDate", () => {
    expect(updateMessageKey({ available: false, status: "unknown" })).toBe(
      "updateCheckFailed",
    );
  });

  it("in-progress gets its own message", () => {
    expect(updateMessageKey({ available: false, status: "in-progress" })).toBe(
      "updateInProgress",
    );
  });

  it("preparing gets its own message", () => {
    expect(updateMessageKey({ available: false, status: "preparing" })).toBe(
      "updatePreparing",
    );
  });

  it("only an explicit up-to-date earns updateUpToDate", () => {
    expect(updateMessageKey({ available: false, status: "up-to-date" })).toBe(
      "updateUpToDate",
    );
  });

  it("a null answer is a check failure", () => {
    expect(updateMessageKey(null)).toBe("updateCheckFailed");
  });

  it("fails CLOSED: no status, or one this build does not know", () => {
    // An older shell sends no status at all; a newer one could send something
    // this build has never heard of. Neither is evidence of being current.
    expect(updateMessageKey({ available: false })).toBe("updateCheckFailed");
    expect(updateMessageKey({ available: false, status: "brand-new" })).toBe(
      "updateCheckFailed",
    );
  });
});

describe("isApplicable — what may be handed to apply()", () => {
  it("requires BOTH the status and the flag", () => {
    expect(isApplicable(plan())).toBe(true);
    expect(isApplicable({ available: true, status: "preparing" })).toBe(false);
    expect(isApplicable({ available: false, status: "available" })).toBe(false);
    expect(isApplicable(null)).toBe(false);
  });

  it("a discovered-but-not-staged build is NOT applicable", () => {
    // The product rule: nothing is clickable until the bytes are staged.
    expect(isApplicable({ available: false, status: "preparing", version: "9" })).toBe(
      false,
    );
  });
});

describe("chip: an inconclusive check must not erase an actionable plan", () => {
  const previous = plan({ token: "old" });

  it("unknown preserves the previous plan", () => {
    expect(nextChipPlan(previous, { available: false, status: "unknown" })).toBe(previous);
  });

  it("in-progress and preparing preserve it too", () => {
    expect(nextChipPlan(previous, { available: false, status: "in-progress" })).toBe(
      previous,
    );
    expect(nextChipPlan(previous, { available: false, status: "preparing" })).toBe(
      previous,
    );
  });

  it("a VERIFIED up-to-date clears it", () => {
    expect(nextChipPlan(previous, { available: false, status: "up-to-date" })).toBeNull();
  });

  it("a new available plan replaces the old token", () => {
    const fresh = plan({ token: "new", version: "0.4.2" });
    expect(nextChipPlan(previous, fresh)).toBe(fresh);
  });

  it("a null check preserves the previous plan", () => {
    expect(nextChipPlan(previous, null)).toBe(previous);
  });

  it("with no previous plan, an inconclusive check leaves it empty", () => {
    // Nothing proven, nothing to offer — the chip stays hidden.
    for (const status of ["unknown", "in-progress", "preparing"]) {
      expect(nextChipPlan(null, { available: false, status })).toBeNull();
    }
    expect(nextChipPlan(null, null)).toBeNull();
  });

  it("an unrecognised status is inconclusive, not a clear", () => {
    expect(nextChipPlan(previous, { available: false, status: "brand-new" })).toBe(
      previous,
    );
  });
});
