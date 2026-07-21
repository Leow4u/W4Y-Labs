/**
 * The shell update as ONE shared operation — including the fallback.
 *
 * The defect: the single-flight wrapped only killEngine + shellUpdater.apply().
 * The fail-open fallback sat after the await, OUTSIDE the lock, so when the
 * shell install failed every joined caller woke up with the same failed outcome
 * and each ran its own app.relaunch()+exit(0). The lock was real; it just ended
 * one line too early.
 *
 * These tests drive the real createSingleFlight with two concurrent callers,
 * which is the only way the bug shows up at all.
 */
import { describe, expect, it, vi } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runShellApplyWithFallback } = require("../../../apps/desktop-shell/shell-apply-flow.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createSingleFlight } = require("../../../apps/desktop-shell/single-flight.cjs");

const defer = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("runShellApplyWithFallback — one operation, one answer", () => {
  it("returns via the shell when the install works, and never falls back", async () => {
    const engineFallback = vi.fn();
    const res = await runShellApplyWithFallback({
      killEngine: vi.fn(),
      shellApply: vi.fn().mockResolvedValue({ ok: true }),
      engineFallback,
    });
    expect(res).toEqual({ ok: true, via: "shell" });
    expect(engineFallback).not.toHaveBeenCalled();
  });

  it("kills the engine before the installer runs", async () => {
    const order: string[] = [];
    await runShellApplyWithFallback({
      killEngine: () => order.push("kill"),
      shellApply: async () => {
        order.push("apply");
        return { ok: true };
      },
      engineFallback: vi.fn(),
    });
    expect(order).toEqual(["kill", "apply"]);
  });

  it("falls back INSIDE the operation when the install fails", async () => {
    const engineFallback = vi.fn().mockReturnValue({ ok: true });
    const res = await runShellApplyWithFallback({
      killEngine: vi.fn(),
      shellApply: vi.fn().mockResolvedValue({ ok: false, error: "download 404" }),
      engineFallback,
    });
    expect(engineFallback).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ ok: true, via: "fallback", error: "download 404" });
  });

  it("falls back when the install THROWS, not just when it reports failure", async () => {
    const engineFallback = vi.fn().mockReturnValue({ ok: true });
    const res = await runShellApplyWithFallback({
      killEngine: vi.fn(),
      shellApply: vi.fn().mockRejectedValue(new Error("quitAndInstall exploded")),
      engineFallback,
    });
    expect(engineFallback).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });

  it("reports honestly when even the fallback fails", async () => {
    const res = await runShellApplyWithFallback({
      killEngine: vi.fn(),
      shellApply: vi.fn().mockResolvedValue({ ok: false, error: "download 404" }),
      engineFallback: vi.fn().mockReturnValue({ ok: false, error: "relaunch denied" }),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("download 404");
    expect(res.error).toContain("relaunch denied");
  });

  it("never throws, even if killEngine does", async () => {
    const engineFallback = vi.fn().mockReturnValue({ ok: true });
    await expect(
      runShellApplyWithFallback({
        killEngine: () => {
          throw new Error("no engine handle");
        },
        shellApply: vi.fn(),
        engineFallback,
      }),
    ).resolves.toMatchObject({ ok: true, via: "fallback" });
  });
});

describe("two concurrent callers — the whole point", () => {
  /** Mirrors main.cjs: one flight, work = the full apply+fallback operation. */
  const wire = (shellApply: () => Promise<unknown>, engineFallback: () => unknown) => {
    const flight = createSingleFlight();
    const call = async () => {
      const h = flight.run(() =>
        runShellApplyWithFallback({ killEngine: vi.fn(), shellApply, engineFallback }),
      );
      const outcome = await h.promise;
      return { started: h.started, outcome };
    };
    return call;
  };

  it("SUCCESS: both callers share one install and one identical result", async () => {
    const shellApply = vi.fn().mockImplementation(async () => {
      await defer(10);
      return { ok: true };
    });
    const engineFallback = vi.fn();
    const call = wire(shellApply, engineFallback);

    const [a, b] = await Promise.all([call(), call()]);

    expect(shellApply).toHaveBeenCalledTimes(1); // never two installers
    expect(engineFallback).not.toHaveBeenCalled();
    expect(a.outcome).toEqual(b.outcome); // same answer
    expect(a.outcome.value).toEqual({ ok: true, via: "shell" });
    expect([a.started, b.started].filter(Boolean)).toHaveLength(1); // one owner
  });

  it("FAILURE: the fallback runs ONCE and both callers get that same result", async () => {
    // This is the regression. Before the fix each waiter ran its own
    // applyEngineUpdate() — two relaunch+exit races over one process.
    const shellApply = vi.fn().mockImplementation(async () => {
      await defer(10);
      return { ok: false, error: "download 404" };
    });
    const engineFallback = vi.fn().mockReturnValue({ ok: true });
    const call = wire(shellApply, engineFallback);

    const [a, b] = await Promise.all([call(), call()]);

    expect(shellApply).toHaveBeenCalledTimes(1);
    expect(engineFallback).toHaveBeenCalledTimes(1); // NOT once per caller
    expect(a.outcome).toEqual(b.outcome);
    expect(a.outcome.value).toMatchObject({ ok: true, via: "fallback" });
  });

  it("FAILURE THROWN: still exactly one fallback across both callers", async () => {
    const shellApply = vi.fn().mockImplementation(async () => {
      await defer(10);
      throw new Error("installer vanished");
    });
    const engineFallback = vi.fn().mockReturnValue({ ok: true });
    const call = wire(shellApply, engineFallback);

    const [a, b] = await Promise.all([call(), call()]);

    expect(engineFallback).toHaveBeenCalledTimes(1);
    expect(a.outcome).toEqual(b.outcome);
  });

  it("three callers, still one install and one fallback", async () => {
    const shellApply = vi.fn().mockImplementation(async () => {
      await defer(10);
      return { ok: false, error: "boom" };
    });
    const engineFallback = vi.fn().mockReturnValue({ ok: true });
    const call = wire(shellApply, engineFallback);

    const all = await Promise.all([call(), call(), call()]);

    expect(shellApply).toHaveBeenCalledTimes(1);
    expect(engineFallback).toHaveBeenCalledTimes(1);
    expect(new Set(all.map((r) => JSON.stringify(r.outcome))).size).toBe(1);
  });
});
