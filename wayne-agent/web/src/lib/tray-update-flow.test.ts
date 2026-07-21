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
    // A null check now carries the (empty) list of layers it could not verify.
    expect(notify).toHaveBeenCalledWith("check-failed", { unverified: [] });
    expect(res).toMatchObject({ ok: false, reason: "check-failed" });
  });

  it("says 'up to date' and applies nothing when there is no update", async () => {
    const apply = vi.fn();
    const notify = vi.fn();
    const res = await runTrayUpdateCheck({
      // Carries an explicit status: under the fail-closed rule a status-less
      // answer is no longer read as "current" (see the exhaustive suite below).
      check: vi.fn().mockResolvedValue({
        available: false,
        status: "up-to-date",
        version: "0.4.0",
      }),
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
      .mockResolvedValueOnce({ available: false, status: "up-to-date", version: "0.4.1" });
    const res = await runTrayUpdateCheck({
      check,
      apply: vi.fn().mockResolvedValue({ ok: false, error: "stale-plan" }),
      notify: vi.fn().mockResolvedValue(true),
    });
    expect(res).toMatchObject({ ok: true, applied: false });
  });
});

describe("runTrayUpdateCheck — a success that does NOT relaunch is still announced", () => {
  it("notifies on apply success", async () => {
    // On the shell/relaunch paths this never renders (the process dies inside
    // the apply) — which is why it was missing. A STALLED engine retry survives
    // it: minutes of download, ok returned, no relaunch. Without this the tray
    // closed and nothing ever appeared.
    const notify = vi.fn();
    await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(plan()),
      apply: vi.fn().mockResolvedValue({ ok: true }),
      notify,
    });
    // `error` rides along so a recovery can name the install failure; on a real
    // apply it is null.
    expect(notify).toHaveBeenCalledWith("applied", { version: "0.4.1", error: null });
  });

  it("a failing dialog still does not break the success path", async () => {
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(plan()),
      apply: vi.fn().mockResolvedValue({ ok: true }),
      notify: vi.fn().mockRejectedValue(new Error("no display")),
    });
    expect(res).toMatchObject({ ok: true, applied: true });
  });
});

/**
 * Round: chip truth. The tray must not say "up to date" on an unverified check,
 * and must not call a fallback recovery an applied update.
 */
describe("runTrayUpdateCheck — three states, not two", () => {
  it("an UNKNOWN check is reported as a check failure, never as up-to-date", async () => {
    const notify = vi.fn();
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue({
        available: false,
        status: "unknown",
        unverified: ["shell"],
      }),
      apply: vi.fn(),
      notify,
    });
    expect(notify).toHaveBeenCalledWith("check-failed", { unverified: ["shell"] });
    expect(res).toMatchObject({ ok: false, reason: "check-failed" });
  });

  it("a VERIFIED up-to-date is still reported as up-to-date", async () => {
    const notify = vi.fn();
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue({
        available: false,
        status: "up-to-date",
        version: "0.4.0",
      }),
      apply: vi.fn(),
      notify,
    });
    expect(notify).toHaveBeenCalledWith("up-to-date", { version: "0.4.0" });
    expect(res).toMatchObject({ ok: true, applied: false });
  });

  it("never applies anything on an unknown check", async () => {
    const apply = vi.fn();
    await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue({ available: false, status: "unknown" }),
      apply,
      notify: vi.fn(),
    });
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("runTrayUpdateCheck — applied vs recovered", () => {
  it("outcome 'applied' says the update was applied", async () => {
    const notify = vi.fn();
    const log = vi.fn();
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(plan()),
      apply: vi.fn().mockResolvedValue({ ok: true, outcome: "applied" }),
      notify,
      log,
    });
    expect(notify).toHaveBeenCalledWith("applied", { version: "0.4.1", error: null });
    expect(res).toMatchObject({ applied: true, recovered: false });
    expect(log.mock.calls.flat().join(" ")).toContain("applied");
  });

  it("outcome 'recovered' must NOT read as an applied update", async () => {
    // via:"fallback" means the install failed and the CURRENT build was
    // reopened. Operationally fine, but it is not an update.
    const notify = vi.fn();
    const log = vi.fn();
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(plan()),
      apply: vi
        .fn()
        .mockResolvedValue({ ok: true, outcome: "recovered", error: "download 404" }),
      notify,
      log,
    });
    expect(notify).toHaveBeenCalledWith("recovered", {
      version: "0.4.1",
      error: "download 404",
    });
    expect(notify).not.toHaveBeenCalledWith("applied", expect.anything());
    expect(res).toMatchObject({ applied: false, recovered: true });
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("RECOVERED");
    expect(logged).not.toContain("tray apply applied");
  });

  it("the original install error survives to the message", async () => {
    const notify = vi.fn();
    await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(plan()),
      apply: vi
        .fn()
        .mockResolvedValue({ ok: true, outcome: "recovered", error: "installer died" }),
      notify,
    });
    expect(notify).toHaveBeenCalledWith(
      "recovered",
      expect.objectContaining({ error: "installer died" }),
    );
  });

  it("a total failure still reports failure and leaves the retry path", async () => {
    const notify = vi.fn();
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(plan()),
      apply: vi.fn().mockResolvedValue({ ok: false, outcome: "failed", error: "boom" }),
      notify,
    });
    expect(notify).toHaveBeenCalledWith("apply-failed", { reason: "boom" });
    expect(res).toMatchObject({ ok: false, applied: false });
  });
});

/**
 * Exhaustive, fail-closed status handling. The previous shape asked
 * `if (!plan.available)` and said "you are on the latest version", so every
 * status that was not `available` — including ones added later — silently
 * claimed the machine was current.
 */
describe("runTrayUpdateCheck — no status may fall into up-to-date by accident", () => {
  const check = (status: string, extra: Record<string, unknown> = {}) =>
    vi.fn().mockResolvedValue({ available: false, status, ...extra });

  it.each(["in-progress", "preparing", "unknown", "brand-new-status"])(
    "%s never calls up-to-date",
    async (status) => {
      const notify = vi.fn();
      await runTrayUpdateCheck({ check: check(status), apply: vi.fn(), notify });
      expect(notify).not.toHaveBeenCalledWith("up-to-date", expect.anything());
    },
  );

  it("in-progress and preparing get their OWN notification, not a failure", async () => {
    for (const status of ["in-progress", "preparing"]) {
      const notify = vi.fn();
      const res = await runTrayUpdateCheck({
        check: check(status, { version: "9" }),
        apply: vi.fn(),
        notify,
      });
      expect(notify).toHaveBeenCalledWith(status, { version: "9" });
      expect(res).toMatchObject({ ok: true, applied: false, pending: true });
    }
  });

  it("a missing status fails closed", async () => {
    const notify = vi.fn();
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue({ available: false }),
      apply: vi.fn(),
      notify,
    });
    expect(notify).toHaveBeenCalledWith("check-failed", { unverified: [] });
    expect(res.ok).toBe(false);
  });
});

describe("runTrayUpdateCheck — the stale-plan recheck obeys the same rule", () => {
  const staleThen = (second: Record<string, unknown> | null) => ({
    check: vi.fn().mockResolvedValueOnce(plan()).mockResolvedValueOnce(second),
    apply: vi.fn().mockResolvedValue({ ok: false, error: "stale-plan" }),
    notify: vi.fn().mockResolvedValue(true), // user accepts the retry
  });

  it("recheck unknown → check-failed, never up-to-date", async () => {
    const d = staleThen({ available: false, status: "unknown", unverified: ["shell"] });
    const res = await runTrayUpdateCheck(d);
    expect(d.notify).not.toHaveBeenCalledWith("up-to-date", expect.anything());
    expect(res).toMatchObject({ ok: false, reason: "check-failed" });
  });

  it("recheck in-progress → pending, never up-to-date", async () => {
    const d = staleThen({ available: false, status: "in-progress", version: "9" });
    const res = await runTrayUpdateCheck(d);
    expect(d.notify).toHaveBeenCalledWith("in-progress", { version: "9" });
    expect(d.notify).not.toHaveBeenCalledWith("up-to-date", expect.anything());
    expect(res).toMatchObject({ pending: true });
  });

  it("recheck with an EXPLICIT up-to-date may say so", async () => {
    const d = staleThen({ available: false, status: "up-to-date", version: "0.4.1" });
    const res = await runTrayUpdateCheck(d);
    expect(d.notify).toHaveBeenCalledWith("up-to-date", { version: "0.4.1" });
    expect(res).toMatchObject({ ok: true, applied: false });
  });

  it("recheck with a fresh available plan applies THAT token", async () => {
    const apply = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "stale-plan" })
      .mockResolvedValueOnce({ ok: true, outcome: "applied" });
    const res = await runTrayUpdateCheck({
      check: vi
        .fn()
        .mockResolvedValueOnce(plan({ token: "old" }))
        .mockResolvedValueOnce(plan({ token: "new" })),
      apply,
      notify: vi.fn().mockResolvedValue(true),
    });
    expect(apply.mock.calls.map((c) => c[0])).toEqual(["old", "new"]);
    expect(res).toMatchObject({ ok: true, applied: true });
  });
});

describe("runTrayUpdateCheck — staged is not applied", () => {
  it("a retry that ends STAGED never notifies 'applied'", async () => {
    // The stalled-engine path returns {ok:true, status:"staged"}: the bytes are
    // ready and the update lands on the NEXT restart. Announcing it as applied
    // told the user something that had not happened yet.
    const notify = vi.fn();
    const log = vi.fn();
    const res = await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(plan()),
      apply: vi.fn().mockResolvedValue({ ok: true, outcome: "staged", status: "staged" }),
      notify,
      log,
    });
    expect(notify).toHaveBeenCalledWith("staged", { version: "0.4.1", error: null });
    expect(notify).not.toHaveBeenCalledWith("applied", expect.anything());
    expect(res).toMatchObject({ ok: true, applied: false, staged: true });
    expect(log.mock.calls.flat().join(" ")).toContain("STAGED");
  });

  it("infers staged from a bare status when no outcome was sent", async () => {
    const notify = vi.fn();
    await runTrayUpdateCheck({
      check: vi.fn().mockResolvedValue(plan()),
      apply: vi.fn().mockResolvedValue({ ok: true, status: "staged" }),
      notify,
    });
    expect(notify).toHaveBeenCalledWith("staged", expect.anything());
  });

  it("applied, recovered and staged stay three distinct answers", async () => {
    const seen: string[] = [];
    for (const outcome of ["applied", "recovered", "staged"]) {
      const notify = vi.fn();
      const res = await runTrayUpdateCheck({
        check: vi.fn().mockResolvedValue(plan()),
        apply: vi.fn().mockResolvedValue({ ok: true, outcome, error: null }),
        notify,
      });
      seen.push(notify.mock.calls[0][0]);
      expect(res.applied).toBe(outcome === "applied");
      expect(res.recovered).toBe(outcome === "recovered");
      expect(res.staged).toBe(outcome === "staged");
    }
    expect(seen).toEqual(["applied", "recovered", "staged"]);
  });
});
