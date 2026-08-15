import { describe, expect, it } from "vitest";

import {
  MACOS_DESKTOP_AVAILABLE,
  MACOS_DESKTOP_URL,
  MACOS_DESKTOP_VERSION,
  WINDOWS_DESKTOP_URL,
  WINDOWS_DESKTOP_VERSION,
  resolveDesktopDownloadTarget,
} from "./product-download";

describe("per-platform versions", () => {
  // The two platforms release independently. When they shared one constant, a
  // Windows bump silently pointed the macOS link at a DMG that was never built
  // and every Mac visitor got a 404. Each URL must carry its own version.
  it("builds each installer URL from its own platform version", () => {
    expect(WINDOWS_DESKTOP_URL).toContain(`Work4You-${WINDOWS_DESKTOP_VERSION}-win-x64.exe`);
    expect(MACOS_DESKTOP_URL).toContain(`Work4You-${MACOS_DESKTOP_VERSION}-mac-arm64.dmg`);
  });

  it("does not leak the Windows version into the macOS URL", () => {
    if (WINDOWS_DESKTOP_VERSION === MACOS_DESKTOP_VERSION) return;
    expect(MACOS_DESKTOP_URL).not.toContain(WINDOWS_DESKTOP_VERSION);
    expect(WINDOWS_DESKTOP_URL).not.toContain(MACOS_DESKTOP_VERSION);
  });
});

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