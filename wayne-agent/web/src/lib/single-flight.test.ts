/**
 * Tests for the desktop shell's single-flight lock.
 *
 * The module lives in apps/desktop-shell (Electron main process) but has no
 * Electron dependency, precisely so it can be tested here: the shell has no
 * test runner of its own, and adding one would mean touching package-lock.
 * The import reaches outside web/ on purpose.
 */
import { describe, expect, it, vi } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createSingleFlight } = require("../../../apps/desktop-shell/single-flight.cjs");

/** Resolves after `ms`, letting a test interleave with an in-flight run. */
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("createSingleFlight", () => {
  it("takes the lock before the work can await — two concurrent callers run once", async () => {
    const sf = createSingleFlight();
    const work = vi.fn(async () => {
      // The old bug lived exactly here: the flag was still false during this
      // await, so a second caller walked straight past the guard.
      await tick(10);
      return "done";
    });

    const a = sf.run(work);
    const b = sf.run(work); // same synchronous turn, before any await resolves

    expect(a.started).toBe(true);
    expect(b.started).toBe(false);
    expect(b.token).toBe(a.token);
    expect(b.promise).toBe(a.promise); // joins, does not start a second run

    const [ra, rb] = await Promise.all([a.promise, b.promise]);
    expect(ra).toEqual({ ok: true, value: "done" });
    expect(rb).toEqual({ ok: true, value: "done" });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("holds the lock for the WHOLE run, not just until the first await", async () => {
    const sf = createSingleFlight();
    let seenDuringWork: boolean | null = null;

    const handle = sf.run(async () => {
      await tick(5);
      seenDuringWork = sf.isRunning(); // mid-flight, after an await
      await tick(5);
    });

    expect(sf.isRunning()).toBe(true); // already locked on return, no await yet
    await handle.promise;
    expect(seenDuringWork).toBe(true);
    expect(sf.isRunning()).toBe(false); // released only when the work ended
  });

  it("releases the lock when the work fails BEFORE the manifest step", async () => {
    const sf = createSingleFlight();
    const r = await sf.run(async () => {
      throw new Error("network unreachable");
    }).promise;

    expect(r).toEqual({ ok: false, error: "network unreachable" });
    expect(sf.isRunning()).toBe(false);
  });

  it("releases the lock when the work fails AFTER an await (post-manifest)", async () => {
    const sf = createSingleFlight();
    const r = await sf.run(async () => {
      await tick(5); // stands in for fetchEngineManifest()
      throw new Error("the installer did not finish");
    }).promise;

    expect(r).toEqual({ ok: false, error: "the installer did not finish" });
    expect(sf.isRunning()).toBe(false);
  });

  it("captures a synchronous throw without leaving the lock stuck", async () => {
    const sf = createSingleFlight();
    const r = await sf.run(() => {
      throw new Error("bad argument");
    }).promise;

    expect(r).toEqual({ ok: false, error: "bad argument" });
    expect(sf.isRunning()).toBe(false);
  });

  it("allows a retry after a failure — the reason the chip must stay clickable", async () => {
    const sf = createSingleFlight();
    const first = await sf.run(async () => {
      throw new Error("boom");
    }).promise;
    expect(first.ok).toBe(false);

    const second = sf.run(async () => "recovered");
    expect(second.started).toBe(true); // NOT blocked by the previous failure
    expect(await second.promise).toEqual({ ok: true, value: "recovered" });
  });

  it("gives each run its own token so a late finally cannot unlock a newer run", async () => {
    const sf = createSingleFlight();
    const one = sf.run(async () => tick(1));
    await one.promise;
    const two = sf.run(async () => tick(20));

    expect(two.token).not.toBe(one.token);
    expect(sf.activeToken()).toBe(two.token);
    await two.promise;
    expect(sf.activeToken()).toBeNull();
  });

  it("exposes the in-flight promise so a caller can join instead of firing again", async () => {
    const sf = createSingleFlight();
    const handle = sf.run(async () => {
      await tick(10);
      return 42;
    });

    const joined = sf.activePromise();
    expect(joined).toBe(handle.promise);
    expect(await joined).toEqual({ ok: true, value: 42 });
    expect(sf.activePromise()).toBeNull();
  });
});
