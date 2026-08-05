import { describe, expect, it } from "vitest";
import { computeReconcileAlertLevel, STALE_KEY_INJECTION_MINUTES } from "./reconcile-keys";

describe("reconcile alert levels", () => {
  it("ok when nothing pending", () => {
    expect(computeReconcileAlertLevel([], [], [])).toBe("ok");
  });

  it("warning when repairs succeeded", () => {
    expect(computeReconcileAlertLevel(["t-a"], [], [])).toBe("warning");
  });

  it("critical on failures", () => {
    expect(computeReconcileAlertLevel([], ["t-b"], [])).toBe("critical");
  });

  it("critical on stale tenants", () => {
    expect(computeReconcileAlertLevel([], [], ["t-c"])).toBe("critical");
  });
});

describe("stale threshold", () => {
  it("is 15 minutes", () => {
    expect(STALE_KEY_INJECTION_MINUTES).toBe(15);
  });
});
