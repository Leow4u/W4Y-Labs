import { describe, expect, it } from "vitest";

import { catalogPhase } from "@/hooks/useConnectors";
import {
  normalizeConnectorKey,
  resolveFeaturedConnectors,
} from "@/lib/connector-curation";
import type { ConnectorToolkit } from "@/lib/api";

function tk(slug: string, name: string): ConnectorToolkit {
  return {
    slug,
    name,
    description: "",
    logo: null,
    categories: [],
    no_auth: false,
    managed_auth: true,
    auth_schemes: [],
    tools_count: 1,
    triggers_count: 0,
  };
}

describe("catalogPhase", () => {
  it("treats fetch failure as error not empty", () => {
    expect(catalogPhase({ loading: false, error: "down", total: 0 })).toBe("error");
  });
});

describe("connector-curation", () => {
  it("normalizes slug keys", () => {
    expect(normalizeConnectorKey("Google_Sheets")).toBe("googlesheets");
  });

  it("resolves featured by slug or display name", () => {
    const toolkits = [
      tk("GMAIL", "Gmail"),
      tk("google_sheets", "Google Sheets"),
      tk("random_app", "Random"),
    ];
    const featured = resolveFeaturedConnectors(toolkits);
    expect(featured.map((t) => t.slug)).toEqual(["GMAIL", "google_sheets"]);
  });
});
