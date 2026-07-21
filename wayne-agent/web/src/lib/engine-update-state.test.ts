/**
 * Coherence between the attempt counter and the "the update is stuck" warning.
 *
 * Module lives in apps/desktop-shell (no Electron dependency); the shell has
 * no runner of its own, so it is exercised from here — same reason as
 * single-flight.test.ts.
 */
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const state = require("../../../apps/desktop-shell/engine-update-state.cjs");

const { EMPTY, STALLED_AFTER, isStalled, shouldWarnUser } = state;

const failedWith = (attempts: number, extra: Record<string, unknown> = {}) => ({
  ...EMPTY,
  phase: "failed",
  attempts,
  ...extra,
});

describe("isStalled — the automatic-retry budget", () => {
  it("declares the documented threshold", () => {
    expect(STALLED_AFTER).toBe(3);
  });

  it("stays quiet below the threshold", () => {
    expect(isStalled(failedWith(0))).toBe(false);
    expect(isStalled(failedWith(1))).toBe(false);
    expect(isStalled(failedWith(STALLED_AFTER - 1))).toBe(false);
  });

  it("fires at the threshold and beyond", () => {
    expect(isStalled(failedWith(STALLED_AFTER))).toBe(true);
    expect(isStalled(failedWith(STALLED_AFTER + 5))).toBe(true);
  });

  it("needs the failed phase, not just a count", () => {
    expect(isStalled({ ...EMPTY, phase: "installing", attempts: 9 })).toBe(false);
    expect(isStalled({ ...EMPTY, phase: "staged", attempts: 9 })).toBe(false);
  });
});

describe("shouldWarnUser — why the counter alone is not enough", () => {
  it("agrees with isStalled when no manual retry happened", () => {
    expect(shouldWarnUser(failedWith(2))).toBe(false);
    expect(shouldWarnUser(failedWith(3))).toBe(true);
  });

  it("warns after a FAILED manual retry even though attempts was reset to 0", () => {
    // This is the regression: retryEngineUpdate() zeroes `attempts` so the
    // retry is meaningful. Judging by the counter alone, the pill would vanish
    // right after the user's own attempt failed.
    const afterManualFailure = failedWith(1, { manualRetryFailed: true });
    expect(isStalled(afterManualFailure)).toBe(false); // counter says "quiet"
    expect(shouldWarnUser(afterManualFailure)).toBe(true); // user still told
  });

  it("goes quiet again once a retry starts clean", () => {
    expect(
      shouldWarnUser({ ...EMPTY, phase: "idle", attempts: 0, manualRetryFailed: false }),
    ).toBe(false);
  });

  it("does not warn on a healthy state", () => {
    expect(shouldWarnUser(EMPTY)).toBe(false);
    expect(shouldWarnUser({ ...EMPTY, phase: "staged", attempts: 0 })).toBe(false);
  });
});
