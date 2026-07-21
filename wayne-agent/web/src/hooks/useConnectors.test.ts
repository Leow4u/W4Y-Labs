import { describe, expect, it } from "vitest";

import { catalogPhase } from "@/hooks/useConnectors";

describe("catalogPhase", () => {
  it("is loading while the catalog is in flight, whatever else is set", () => {
    expect(catalogPhase({ loading: true, error: null, total: 0 })).toBe("loading");
    expect(catalogPhase({ loading: true, error: "down", total: 0 })).toBe("loading");
  });

  it("tells a failed load apart from an empty catalog", () => {
    // The defect: both used to end here with total 0, and the page rendered
    // the same "no connectors" state for a service that was simply down.
    expect(catalogPhase({ loading: false, error: "down", total: 0 })).toBe("error");
    expect(catalogPhase({ loading: false, error: null, total: 0 })).toBe("empty");
  });

  it("keeps reporting the failure even if stale toolkits are still in state", () => {
    expect(catalogPhase({ loading: false, error: "down", total: 40 })).toBe("error");
  });

  it("is ready once the catalog arrived", () => {
    expect(catalogPhase({ loading: false, error: null, total: 1047 })).toBe("ready");
  });
});
