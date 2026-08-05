import { describe, expect, it } from "vitest";
import { decideKeyInjection } from "./billing-activate";
import { planRegime } from "./billing";

describe("planRegime", () => {
  it("premium for pro and max", () => {
    expect(planRegime("pro")).toBe("premium");
    expect(planRegime("max")).toBe("premium");
  });

  it("base for free and starter", () => {
    expect(planRegime("free")).toBe("base");
    expect(planRegime("starter")).toBe("base");
  });
});

describe("decideKeyInjection", () => {
  it("defers when instance not ready", () => {
    const d = decideKeyInjection({
      plan: "starter",
      existingHash: null,
      flyApp: "wayne-abc",
      instanceReady: false,
    });
    expect(d.shouldEnsure).toBe(false);
    expect(d.markInjected).toBe(false);
    expect(d.reason).toBe("deferred_not_ready");
  });

  it("ensures new key when ready and no hash", () => {
    const d = decideKeyInjection({
      plan: "pro",
      existingHash: null,
      flyApp: "wayne-abc",
      instanceReady: true,
    });
    expect(d.shouldEnsure).toBe(true);
    expect(d.markInjected).toBe(true);
    expect(d.creditsUsd).toBe(70);
  });

  it("relimit path when hash exists", () => {
    const d = decideKeyInjection({
      plan: "starter",
      existingHash: "abc123",
      flyApp: "wayne-abc",
      instanceReady: true,
    });
    expect(d.shouldEnsure).toBe(false);
    expect(d.markInjected).toBe(true);
    expect(d.reason).toBe("existing_hash_relimit");
  });
});
