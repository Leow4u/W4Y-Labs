/**
 * "Você já está na versão mais recente" needed evidence it did not have.
 *
 * Reproduced before the fix, in main.cjs:
 *  - `shellUpdater.check()` is fail-open and answers `null` for an unreachable
 *    feed, a dev run or a broken electron-updater. `checkUnifiedUpdate()` fell
 *    straight through that into the engine branch, i.e. treated "could not ask"
 *    as "nothing there".
 *  - `checkEngineUpdate()` read ONLY `readStaged()` and the on-disk update
 *    state. It never called `fetchEngineManifest()`, so "nothing staged
 *    locally" was reported as "the remote engine is up to date".
 *
 * With both silent for the wrong reasons, a machine that had verified nothing
 * was told it was current. This covers the combination rule; it proves nothing
 * about the network, Electron or a real install.
 */
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const uc = require("../../../apps/desktop-shell/unified-check.cjs");

const A = uc.AVAILABLE;
const U = uc.UP_TO_DATE;
const X = uc.UNKNOWN;
const P = uc.IN_PROGRESS;

const L = (status: string, extra: Record<string, unknown> = {}) => uc.layer(status, extra);

describe("the shell × engine matrix", () => {
  const cases: [string, string, string, string][] = [
    ["shell up-to-date + engine up-to-date", U, U, U],
    ["shell available + engine up-to-date", A, U, A],
    ["shell up-to-date + engine available", U, A, A],
    ["shell UNKNOWN + engine up-to-date", X, U, X],
    ["shell up-to-date + engine UNKNOWN", U, X, X],
    ["both unknown", X, X, X],
    ["shell available + engine unknown", A, X, A],
    ["shell unknown + engine available", X, A, A],
    ["engine in progress", U, P, P],
  ];

  it.each(cases)("%s → %s", (_label, shell, engine, expected) => {
    expect(combine(shell, engine).status).toBe(expected);
  });

  const combine = (shell: string, engine: string) =>
    uc.combineUpdateLayers({ shell: L(shell), engine: L(engine) });

  it("an unverified layer is NAMED, not swept away, even when we offer an update", () => {
    const r = uc.combineUpdateLayers({ shell: L(A, { version: "9" }), engine: L(X) });
    expect(r.status).toBe(A);
    expect(r.unverified).toEqual(["engine"]);
  });

  it("says WHICH layer the offer came from, and carries its version", () => {
    const r = uc.combineUpdateLayers({ shell: L(U), engine: L(A, { version: "3", kind: "ready" }) });
    expect(r).toMatchObject({ status: A, source: "engine", version: "3", kind: "ready" });
  });

  it("in-progress is not up-to-date — it is unfinished", () => {
    expect(uc.combineUpdateLayers({ shell: L(U), engine: L(P) }).status).not.toBe(U);
  });

  it("a layer that does not apply here counts as verified", () => {
    // Cloud-shell has no local engine to check; that is an answer, not a gap.
    const r = uc.combineUpdateLayers({ shell: L(U), engine: uc.skipped() });
    expect(r.status).toBe(U);
    expect(r.unverified).toEqual([]);
  });

  it("up-to-date requires EVERY applicable layer to have been verified", () => {
    expect(uc.combineUpdateLayers({ shell: L(U), engine: L(U) }).status).toBe(U);
    expect(uc.combineUpdateLayers({ shell: L(U), engine: L(X) }).status).toBe(X);
  });
});

describe("a failed check must not retract a plan we already proved", () => {
  const proven = { status: A, source: "engine", version: "3", kind: "ready" };

  it("keeps the previous offer when the new check is unknown", () => {
    const next = { status: X, unverified: ["shell", "engine"] };
    const merged = uc.preferPreviousPlan(proven, next);
    expect(merged.status).toBe(A);
    expect(merged.stale).toBe(true);
  });

  it("a VERIFIED up-to-date does clear it", () => {
    const merged = uc.preferPreviousPlan(proven, { status: U });
    expect(merged.status).toBe(U);
  });

  it("a newer available plan replaces the old one", () => {
    const merged = uc.preferPreviousPlan(proven, { status: A, version: "4" });
    expect(merged).toMatchObject({ status: A, version: "4" });
  });

  it("with no previous plan the new result stands as-is", () => {
    expect(uc.preferPreviousPlan(null, { status: X }).status).toBe(X);
  });

  it("a previous NON-offer is not preserved", () => {
    expect(uc.preferPreviousPlan({ status: U }, { status: X }).status).toBe(X);
  });
});
