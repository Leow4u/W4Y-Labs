/**
 * The engine run has to SAY what happened.
 *
 * Reproduced before the fix: `fetchEngineManifest()` collapses offline, DNS
 * failure, timeout, HTTP != 200, unparseable JSON and a payload with no https
 * zipUrl into a single `null`, and `runBackgroundEngineUpdateWork()` answered
 * that with a bare `return`. Because `retryEngineUpdate()` writes
 * `phase:"idle"` / `manualRetryFailed:false` BEFORE running and then judged the
 * run by `!res.ok || after.phase === "failed"`, an offline retry evaluated
 * `false || false` and returned `{ok:true}` — clearing the very warning the
 * user had clicked.
 *
 * These drive the real module main.cjs uses. They do NOT make network calls and
 * they do NOT prove a download, an installer or a relaunch happened.
 */
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const eo = require("../../../apps/desktop-shell/engine-update-outcome.cjs");

/** The six distinct ways fetchEngineManifest() ends up returning null. */
const MANIFEST_FAILURES = [
  "offline",
  "timeout",
  "http 500",
  "http 404",
  "invalid json",
  "payload without https zipUrl",
];

describe("a manual retry never turns a manifest failure into success", () => {
  it.each(MANIFEST_FAILURES)("%s → not ok, and the chip stays", (why) => {
    const verdict = eo.judgeManualRetry({
      result: eo.outcome(eo.CHECK_FAILED, { error: why }),
      stateAfter: {},
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.status).toBe(eo.CHECK_FAILED);
    expect(verdict.keepChip).toBe(true);
    expect(verdict.error).toBe(why);
  });

  it("a run that reports NOTHING is a failure, not a success", () => {
    // The old shape: the work function returned undefined and that was read as
    // "finished without throwing", i.e. as success.
    for (const result of [undefined, null, {}]) {
      const verdict = eo.judgeManualRetry({ result, stateAfter: {} });
      expect(verdict.ok).toBe(false);
      expect(verdict.keepChip).toBe(true);
    }
  });

  it("borrows lastError from disk when the run carried no message", () => {
    const verdict = eo.judgeManualRetry({
      result: eo.outcome(eo.INSTALL_FAILED),
      stateAfter: { lastError: "the installer did not finish" },
    });
    expect(verdict.error).toBe("the installer did not finish");
    expect(verdict.keepChip).toBe(true);
  });

  it("an install failure keeps the chip", () => {
    const verdict = eo.judgeManualRetry({
      result: eo.outcome(eo.INSTALL_FAILED, { error: "disk full" }),
      stateAfter: {},
    });
    expect(verdict).toMatchObject({ ok: false, keepChip: true, error: "disk full" });
  });
});

describe("a verified, clean run may clear the warning", () => {
  it.each([eo.NO_UPDATE, eo.ALREADY_STAGED, eo.STAGED])("%s → ok, chip cleared", (status) => {
    const verdict = eo.judgeManualRetry({ result: eo.outcome(status), stateAfter: {} });
    expect(verdict).toMatchObject({ ok: true, status, keepChip: false });
  });
});

describe("what counts as having verified the remote side", () => {
  it("check-failed proves nothing", () => {
    expect(eo.isVerified(eo.outcome(eo.CHECK_FAILED))).toBe(false);
  });

  it("an install failure still means the manifest WAS read", () => {
    expect(eo.isVerified(eo.outcome(eo.INSTALL_FAILED))).toBe(true);
  });

  it.each([eo.NO_UPDATE, eo.ALREADY_STAGED, eo.STAGED])("%s is verified", (s) => {
    expect(eo.isVerified(eo.outcome(s))).toBe(true);
  });

  it("an install failure is verified but NOT clean", () => {
    expect(eo.isClean(eo.outcome(eo.INSTALL_FAILED))).toBe(false);
  });

  it("refuses to mint an unknown status", () => {
    expect(() => eo.outcome("whatever")).toThrow();
  });
});

describe("a retry that joins an in-flight run", () => {
  it("is judged on the shared operation's REAL result, not on joining", async () => {
    // Mirrors main.cjs: the retry hands judgeManualRetry whatever the shared
    // flight resolved with. Joining a failing install must not read as success.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSingleFlight } = require("../../../apps/desktop-shell/single-flight.cjs");
    const flight = createSingleFlight();
    const work = () =>
      new Promise((r) =>
        setTimeout(() => r(eo.outcome(eo.CHECK_FAILED, { error: "offline" })), 5),
      );

    const first = flight.run(work);
    const second = flight.run(work); // joins
    const [a, b] = await Promise.all([first.promise, second.promise]);

    expect(second.started).toBe(false);
    expect(a).toEqual(b); // same shared result
    for (const res of [a, b]) {
      const verdict = eo.judgeManualRetry({ result: res.value, stateAfter: {} });
      expect(verdict).toMatchObject({ ok: false, keepChip: true, error: "offline" });
    }
  });

  it("a joined SUCCESSFUL run is a success for both callers", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSingleFlight } = require("../../../apps/desktop-shell/single-flight.cjs");
    const flight = createSingleFlight();
    const work = () =>
      new Promise((r) => setTimeout(() => r(eo.outcome(eo.STAGED, { version: "1.2" })), 5));
    const [a, b] = await Promise.all([flight.run(work).promise, flight.run(work).promise]);
    expect(a).toEqual(b);
    expect(eo.judgeManualRetry({ result: a.value, stateAfter: {} }).ok).toBe(true);
  });
});
