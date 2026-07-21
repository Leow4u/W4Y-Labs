/**
 * A pinned engine plan must still describe the artifact on disk.
 *
 * Reproduced before the fix: an engine plan of kind "ready" went straight to
 * `applyEngineUpdate()` — kill the engine, relaunch, exit — without re-reading
 * `readStaged()` or re-checking `engineSlots.isComplete()`. The check had proved
 * a complete staged build minutes earlier and the apply simply trusted it. If
 * the directory was deleted, replaced by a newer download, or left half-written
 * in between, the old token still restarted the whole app and installed
 * nothing, while reporting success.
 *
 * These drive the real decision function main.cjs calls. They touch no
 * filesystem and prove nothing about Electron or an actual relaunch.
 */
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sp = require("../../../apps/desktop-shell/staged-plan.cjs");

const artifact = (over: Record<string, unknown> = {}) => ({
  root: "C:/home/engine/slot-a",
  zipUrl: "https://x/engine-1.zip",
  version: "1.0",
  ...over,
});

describe("validateStagedPlan", () => {
  const pinned = sp.stagedIdentity(artifact());

  it("accepts the same, complete artifact", () => {
    expect(
      sp.validateStagedPlan({ pinned, current: artifact(), complete: true }),
    ).toEqual({ ok: true });
  });

  it("refuses when the staged build VANISHED between check and click", () => {
    expect(sp.validateStagedPlan({ pinned, current: null, complete: false })).toEqual({
      ok: false,
      reason: "staged-gone",
    });
  });

  it("refuses a build left INCOMPLETE — no relaunch on half a download", () => {
    expect(
      sp.validateStagedPlan({ pinned, current: artifact(), complete: false }),
    ).toEqual({ ok: false, reason: "staged-incomplete" });
  });

  it("refuses when the slot was REPLACED by another download", () => {
    const other = artifact({ root: "C:/home/engine/slot-b" });
    expect(sp.validateStagedPlan({ pinned, current: other, complete: true })).toEqual({
      ok: false,
      reason: "staged-changed",
    });
  });

  it("refuses when the archive changed even though the slot did not", () => {
    const other = artifact({ zipUrl: "https://x/engine-2.zip" });
    expect(sp.validateStagedPlan({ pinned, current: other, complete: true }).ok).toBe(
      false,
    );
  });

  it("fails CLOSED when the snapshot recorded no identity", () => {
    // An older snapshot cannot prove sameness, so we do not relaunch on a guess.
    expect(
      sp.validateStagedPlan({ pinned: null, current: artifact(), complete: true }),
    ).toEqual({ ok: false, reason: "identity-unknown" });
  });

  it("a missing field on one side is not treated as equal", () => {
    const partial = { root: "C:/home/engine/slot-a" }; // no zipUrl
    expect(
      sp.validateStagedPlan({ pinned, current: partial, complete: true }).ok,
    ).toBe(false);
  });

  it("`complete` must be exactly true — unknown is not good enough", () => {
    for (const complete of [null, undefined, "yes"]) {
      expect(sp.validateStagedPlan({ pinned, current: artifact(), complete }).ok).toBe(
        false,
      );
    }
  });
});

describe("stagedIdentity", () => {
  it("keeps root and zipUrl, which together name the build", () => {
    expect(sp.stagedIdentity(artifact())).toEqual({
      root: "C:/home/engine/slot-a",
      zipUrl: "https://x/engine-1.zip",
      version: "1.0",
    });
  });

  it("is null when there is nothing identifying at all", () => {
    expect(sp.stagedIdentity(null)).toBeNull();
    expect(sp.stagedIdentity({ version: "1.0" })).toBeNull();
  });
});
