/**
 * The tray's update flow — check → TOKEN → apply.
 *
 * The defect: the tray held a plan complete with its token and called apply
 * with none, which forced a second check. A blip on that second check silently
 * cancelled an update the user had just been shown, and the call was `void`-ed
 * so nothing was logged either.
 *
 * Module lives in apps/desktop-shell and is Electron-free on purpose so it can
 * be driven from here (same reason as single-flight.test.ts).
 */
import { describe, expect, it, vi } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runTrayUpdateCheck } = require("../../../apps/desktop-shell/tray-update-flow.cjs");

const plan = (over: Record<string, unknown> = {}) => ({
  available: true,
  version: "0.4.1",
  token: "tok-abc",
  ...over,
});

describe("runTrayUpdateCheck — the token actually reaches apply", () => {
  it("passes the token from THIS check, and checks exactly once", async () => {
    const check = vi.fn().mockResolvedValue(plan());
    const apply = vi.fn().mockResolvedValue({ ok: true });

    const res = await runTrayUpdateCheck({ check, apply, notify: vi.fn() });

    expect(apply).toHaveBeenCalledWith("tok-abc"); // not undefined
    expect(check).toHaveBeenCalledTimes(1); // no gratuitous second check
    expect(res).toMatchObject({ ok: true, applied: true, attempts: 1 });
  });

  it("never applies without a plan", async () => {
    const apply = vi.fn();
    const notify = vi.fn();
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(null),
      apply,
      notify,
    });
    expect(apply).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("check-failed", undefined);
    expect(res).toMatchObject({ ok: false, reason: "check-failed" });
  });

  it("says 'up to date' and applies nothing when there is no update", async () => {
    const apply = vi.fn();
    const notify = vi.fn();
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue({ available: false, version: "0.4.0" }),
      apply,
      notify,
    });
    expect(apply).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("up-to-date", { version: "0.4.0" });
    expect(res).toMatchObject({ ok: true, applied: false });
  });
});

describe("runTrayUpdateCheck — failures are reported, not swallowed", () => {
  it("reports and logs a plain apply failure", async () => {
    // The old code `void`-ed the apply, so this produced total silence.
    const notify = vi.fn();
    const log = vi.fn();
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(plan()),
      apply: vi.fn().mockResolvedValue({ ok: false, error: "installer died" }),
      notify,
      log,
    });
    expect(notify).toHaveBeenCalledWith("apply-failed", { reason: "installer died" });
    expect(log).toHaveBeenCalled();
    expect(res).toMatchObject({ ok: false, applied: false, reason: "installer died" });
  });

  it("survives an apply that throws", async () => {
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(plan()),
      apply: vi.fn().mockRejectedValue(new Error("ipc gone")),
      notify: vi.fn(),
    });
    expect(res).toMatchObject({ ok: false, reason: "ipc gone" });
  });

  it("survives a check that throws", async () => {
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockRejectedValue(new Error("feed unreachable")),
      apply: vi.fn(),
      notify: vi.fn(),
    });
    expect(res).toMatchObject({ ok: false, reason: "check-failed" });
  });

  it("does not let a failing dialog become an unhandled rejection", async () => {
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(plan()),
      apply: vi.fn().mockResolvedValue({ ok: false, error: "nope" }),
      notify: vi.fn().mockRejectedValue(new Error("no display")),
    });
    expect(res.ok).toBe(false);
  });
});

describe("runTrayUpdateCheck — a stale plan gets a real second chance", () => {
  it("re-checks and applies the FRESH token when the user accepts", async () => {
    const check = vi
      .fn()
      .mockResolvedValueOnce(plan({ token: "old" }))
      .mockResolvedValueOnce(plan({ token: "new", version: "0.4.2" }));
    const apply = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "stale-plan", reason: "stale-plan" })
      .mockResolvedValueOnce({ ok: true });
    const notify = vi.fn().mockResolvedValue(true); // "Tentar de novo"

    const res = await runTrayUpdateCheck({ check, apply, notify });

    expect(apply.mock.calls.map((c) => c[0])).toEqual(["old", "new"]);
    expect(res).toMatchObject({ ok: true, applied: true, attempts: 2 });
  });

  it("stops when the user declines the retry", async () => {
    const check = vi.fn().mockResolvedValue(plan());
    const apply = vi.fn().mockResolvedValue({ ok: false, error: "stale-plan" });
    const notify = vi.fn().mockResolvedValue(false); // "Agora não"

    const res = await runTrayUpdateCheck({ check, apply, notify });

    expect(check).toHaveBeenCalledTimes(1); // declined → no second check
    expect(apply).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
  });

  it("does not loop forever on a permanently stale plan", async () => {
    const check = vi.fn().mockResolvedValue(plan());
    const apply = vi.fn().mockResolvedValue({ ok: false, error: "stale-plan" });
    const notify = vi.fn().mockResolvedValue(true); // always retry

    const res = await runTrayUpdateCheck({ check, apply, notify, maxRetries: 1 });

    expect(apply).toHaveBeenCalledTimes(2); // original + one retry, then stop
    expect(res.ok).toBe(false);
  });

  it("treats 'someone else already applied it' as success, not failure", async () => {
    const check = vi
      .fn()
      .mockResolvedValueOnce(plan())
      .mockResolvedValueOnce({ available: false, version: "0.4.1" });
    const res = await runTrayUpdateCheck({
      check,
      apply: vi.fn().mockResolvedValue({ ok: false, error: "stale-plan" }),
      notify: vi.fn().mockResolvedValue(true),
    });
    expect(res).toMatchObject({ ok: true, applied: false });
  });
});
