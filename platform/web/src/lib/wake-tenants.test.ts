import { describe, expect, it } from "vitest";
import { shouldWakeForCron, tenantWakeUrl } from "./wake-tenants";
import { planRegime } from "./billing";

describe("tenantWakeUrl", () => {
  it("uses fly app hostname by default", () => {
    expect(tenantWakeUrl("wayne-abc")).toBe(
      "https://wayne-abc.fly.dev/api/auth/providers",
    );
  });

  it("respects instance base url", () => {
    expect(tenantWakeUrl("wayne-abc", "https://wayne-abc.fly.dev/")).toBe(
      "https://wayne-abc.fly.dev/api/auth/providers",
    );
  });
});

describe("shouldWakeForCron", () => {
  it("wakes base regime only", () => {
    expect(shouldWakeForCron("free")).toBe(true);
    expect(shouldWakeForCron("starter")).toBe(true);
    expect(shouldWakeForCron("pro")).toBe(false);
    expect(shouldWakeForCron("max")).toBe(false);
  });

  it("aligns with planRegime", () => {
    for (const plan of ["free", "starter", "pro", "max"] as const) {
      expect(shouldWakeForCron(plan)).toBe(planRegime(plan) === "base");
    }
  });
});
