import { describe, expect, it } from "vitest";

import {
  MACOS_DESKTOP_AVAILABLE,
  WINDOWS_DESKTOP_URL,
  resolveDesktopDownloadTarget,
} from "./product-download";

describe("resolveDesktopDownloadTarget", () => {
  it("routes Windows User-Agent to the NSIS artefact", () => {
    const t = resolveDesktopDownloadTarget(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    );
    expect(t.platform).toBe("windows");
    expect(t.href).toBe(WINDOWS_DESKTOP_URL);
    expect(t.direct).toBe(true);
  });

  it("routes macOS to DMG when published, else landing page", () => {
    const t = resolveDesktopDownloadTarget(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15",
    );
    expect(t.platform).toBe("mac");
    if (MACOS_DESKTOP_AVAILABLE) {
      expect(t.direct).toBe(true);
      expect(t.href).toContain("-mac-arm64.dmg");
    } else {
      expect(t.direct).toBe(false);
      expect(t.href).toBe("/download/desktop/mac");
    }
  });

  it("routes Linux to terminal install anchor", () => {
    const t = resolveDesktopDownloadTarget(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    );
    expect(t.platform).toBe("linux");
    expect(t.href).toBe("/#install-terminal");
  });
});