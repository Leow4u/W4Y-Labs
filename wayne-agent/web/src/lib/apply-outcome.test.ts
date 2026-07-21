/**
 * One vocabulary for "what did apply() actually do".
 *
 * Reproduced before this module existed: the tray computed
 *   `res.outcome || (res.status === "staged" ? "staged" : "applied")`
 * so `{ok:true, status:"no-update"}` and `{ok:true, status:"already-staged"}`
 * both announced "Atualização aplicada" — one meaning nothing needed doing, the
 * other that bytes had been waiting since a previous run.
 *
 * Drives the real module the tray uses. Proves no install, no Electron.
 */
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ao = require("../../../apps/desktop-shell/apply-outcome.cjs");

describe("engine status → apply outcome", () => {
  it("staged and already-staged both mean: ready, pending a restart", () => {
    expect(ao.fromEngineStatus("staged")).toBe("staged");
    expect(ao.fromEngineStatus("already-staged")).toBe("staged");
  });

  it("no-update is a true no-op, never applied", () => {
    expect(ao.fromEngineStatus("no-update")).toBe("no-update");
  });

  it("failures stay failures", () => {
    expect(ao.fromEngineStatus("install-failed")).toBe("failed");
    expect(ao.fromEngineStatus("check-failed")).toBe("failed");
  });

  it("fails CLOSED on a status this build does not know", () => {
    expect(ao.fromEngineStatus("brand-new")).toBe("failed");
    expect(ao.fromEngineStatus(undefined)).toBe("failed");
  });
});

describe("normalizeApplyResult", () => {
  it("no-update never becomes applied", () => {
    expect(ao.normalizeApplyResult({ ok: true, status: "no-update" })).toMatchObject({
      outcome: "no-update",
      ok: true,
    });
  });

  it("already-staged never becomes applied", () => {
    expect(
      ao.normalizeApplyResult({ ok: true, status: "already-staged" }),
    ).toMatchObject({ outcome: "staged" });
  });

  it("an explicit recognised outcome wins", () => {
    expect(ao.normalizeApplyResult({ ok: true, outcome: "recovered" })).toMatchObject({
      outcome: "recovered",
      ok: false,
    });
  });

  it("an UNRECOGNISED explicit outcome does not pass as success", () => {
    // This test asserted `"applied"` — it was named as if it proved the
    // opposite of what it checked, so the defect had a green guard on it.
    // ok:true alongside an outcome this build cannot read means nothing.
    const r = ao.normalizeApplyResult({ ok: true, outcome: "brand-new" });
    expect(r.outcome).toBe("failed");
    expect(r.ok).toBe(false);
  });

  it("an empty object is a failure, not an applied update", () => {
    expect(ao.normalizeApplyResult({}).outcome).toBe("failed");
  });

  it("recovered is ok:false — the update did NOT happen", () => {
    expect(ao.normalizeApplyResult({ ok: true, outcome: "recovered" })).toMatchObject({
      outcome: "recovered",
      ok: false,
    });
  });

  it("the bare ok:true legacy read can be refused explicitly", () => {
    expect(ao.normalizeApplyResult({ ok: true }, { legacy: false }).outcome).toBe("failed");
    expect(ao.normalizeApplyResult({ ok: true }).outcome).toBe("applied");
  });

  it("stale-plan is its own outcome, from either field", () => {
    expect(ao.normalizeApplyResult({ ok: false, error: "stale-plan" })).toMatchObject({
      outcome: "stale-plan",
      ok: false,
    });
  });

  it("ok:false is a failure", () => {
    expect(ao.normalizeApplyResult({ ok: false, error: "boom" })).toMatchObject({
      outcome: "failed",
      ok: false,
    });
  });

  it("nothing at all is a failure, not a success", () => {
    expect(ao.normalizeApplyResult(null).outcome).toBe("failed");
    expect(ao.normalizeApplyResult(undefined).ok).toBe(false);
  });

  it("the original error survives", () => {
    expect(
      ao.normalizeApplyResult({ ok: true, outcome: "recovered", error: "download 404" })
        .error,
    ).toBe("download 404");
  });
});

describe("judgeTokenlessApply — the tokenless path stopped saying no-update", () => {
  const answer = (fresh: unknown) => ao.judgeTokenlessApply(fresh);

  it("available with a token → apply that token", () => {
    expect(answer({ status: "available", token: "t" })).toEqual({
      action: "apply",
      token: "t",
    });
  });

  it("a genuine up-to-date is the ONLY no-update", () => {
    expect(answer({ status: "up-to-date" }).result).toMatchObject({
      ok: true,
      outcome: "no-update",
    });
  });

  it.each(["unknown", "in-progress", "preparing"])(
    "%s never becomes no-update",
    (status) => {
      const r = answer({ status }).result;
      expect(r.outcome).not.toBe("no-update");
      expect(r.ok).toBe(false);
    },
  );

  it("unknown reports a check failure and carries what was unverified", () => {
    expect(answer({ status: "unknown", unverified: ["shell"] }).result).toMatchObject({
      outcome: "failed",
      error: "check-failed",
      unverified: ["shell"],
    });
  });

  it("in-progress and preparing name their own reason", () => {
    expect(answer({ status: "in-progress" }).result.error).toBe("update-in-progress");
    expect(answer({ status: "preparing" }).result.error).toBe("update-not-ready");
  });

  it("available WITHOUT a token is refused, not applied", () => {
    expect(answer({ status: "available" }).result).toMatchObject({
      outcome: "stale-plan",
      ok: false,
    });
  });

  it("a legacy available with a token still works", () => {
    expect(answer({ available: true, token: "t" })).toEqual({ action: "apply", token: "t" });
  });

  it("null and unknown shapes fail closed", () => {
    expect(answer(null).result.outcome).toBe("failed");
    expect(answer({ status: "brand-new" }).result.outcome).toBe("failed");
  });
});
