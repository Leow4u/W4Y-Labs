/**
 * The background update tick — the wiring that broke silently in 74150ac.
 *
 * Module lives in apps/desktop-shell and is Electron-free on purpose; the
 * shell has no runner of its own (see single-flight.test.ts).
 */
import { describe, expect, it, vi } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runUpdateTick } = require("../../../apps/desktop-shell/update-scheduler.cjs");

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("runUpdateTick — real scheduler wiring", () => {
  it("awaits the single-flight HANDLE, not the handle itself", async () => {
    // The regression: main.cjs called .finally() on {started, token, promise}.
    let workDone = false;
    const schedule = vi.fn();
    const res = await runUpdateTick({
      run: () => ({
        started: true,
        token: 1,
        promise: tick(5).then(() => {
          workDone = true;
          return { ok: true };
        }),
      }),
      schedule,
    });

    expect(res).toEqual({ ok: true, started: true });
    expect(workDone).toBe(true); // it waited for the work, not just the object
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("reschedules after a SUCCESSFUL run", async () => {
    const schedule = vi.fn();
    await runUpdateTick({ run: () => ({ started: true, promise: Promise.resolve({ ok: true }) }), schedule });
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("reschedules after a FAILED run and reports the failure", async () => {
    const schedule = vi.fn();
    const res = await runUpdateTick({
      run: () => ({ started: true, promise: Promise.resolve({ ok: false, error: "installer died" }) }),
      schedule,
    });
    expect(res).toEqual({ ok: false, started: true, error: "installer died" });
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("reschedules when the run could not even start (lock held)", async () => {
    const schedule = vi.fn();
    const res = await runUpdateTick({
      run: () => ({ started: false, promise: Promise.resolve({ ok: true }) }),
      schedule,
    });
    expect(res.started).toBe(false);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("NEVER throws when run() throws synchronously — and still reschedules", async () => {
    const schedule = vi.fn();
    const onError = vi.fn();
    // A throw here used to escape into the setTimeout callback: an uncaught
    // exception in the Electron main process.
    const res = await runUpdateTick({
      run: () => {
        throw new TypeError("runBackgroundEngineUpdate(...).finally is not a function");
      },
      schedule,
      onError,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("is not a function");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1); // the tick survives
  });

  it("NEVER throws when the work rejects — and still reschedules", async () => {
    const schedule = vi.fn();
    const res = await runUpdateTick({
      run: () => ({ started: true, promise: Promise.reject(new Error("network gone")) }),
      schedule,
    });
    expect(res).toMatchObject({ ok: false, error: "network gone" });
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("survives a schedule() that itself throws", async () => {
    const onError = vi.fn();
    await expect(
      runUpdateTick({
        run: () => ({ started: true, promise: Promise.resolve({ ok: true }) }),
        schedule: () => {
          throw new Error("timer subsystem gone");
        },
        onError,
      }),
    ).resolves.toBeTruthy(); // does not reject
    expect(onError).toHaveBeenCalled();
  });

  it("tolerates a bare promise or nothing, and still reschedules", async () => {
    const s1 = vi.fn();
    await runUpdateTick({ run: () => Promise.resolve("legacy shape"), schedule: s1 });
    expect(s1).toHaveBeenCalledTimes(1);

    const s2 = vi.fn();
    await runUpdateTick({ run: () => undefined, schedule: s2 });
    expect(s2).toHaveBeenCalledTimes(1);
  });
});
