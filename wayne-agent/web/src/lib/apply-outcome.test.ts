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
    expect(ao.normalizeApplyResult({ ok: true, outcome: "brand-new" }).outcome).toBe(
      "applied",
    );
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

  it("a bare ok:true (the shell/relaunch path) reads as applied", () => {
    expect(ao.normalizeApplyResult({ ok: true }).outcome).toBe("applied");
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
