import { describe, expect, it } from "vitest";

import {
  templatesPanelReachable,
  templatesPanelVisibilityClass,
} from "./quickstart-layout";

describe("templatesPanelVisibilityClass", () => {
  it("adds nothing when the panel is expanded", () => {
    expect(templatesPanelVisibilityClass(true)).toBe("");
  });

  it("hides a collapsed panel only from lg up", () => {
    expect(templatesPanelVisibilityClass(false)).toBe("lg:hidden");
  });

  it("never emits a bare `hidden` (that stranded the templates below lg)", () => {
    for (const open of [true, false]) {
      const tokens = templatesPanelVisibilityClass(open).split(/\s+/);
      expect(tokens).not.toContain("hidden");
    }
  });
});

describe("templatesPanelReachable", () => {
  it("is reachable at every viewport × collapsed combination", () => {
    for (const open of [true, false]) {
      for (const wide of [true, false]) {
        expect(templatesPanelReachable(open, wide)).toBe(true);
      }
    }
  });

  it("narrow + collapsed is only reachable because the panel still stacks", () => {
    // The regression: below `lg` no handle exists, so removing the panel left
    // nothing on screen and nothing to click.
    const panelShown = false;
    const handleShown = false; // handles are `hidden lg:flex`
    expect(panelShown || handleShown).toBe(false);
    expect(templatesPanelReachable(false, false)).toBe(true);
  });
});
