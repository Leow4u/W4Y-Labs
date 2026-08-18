/** Desktop installer + CLI one-liners (marketing site). */

const DOWNLOAD_BASE = "https://storage.googleapis.com/w4y-engine-dist";

/**
 * Windows and macOS ship on their own cadences — Windows is built and uploaded
 * from a dev machine, macOS by CI — so each carries its own version.
 *
 * They used to share one constant, and that is exactly how the macOS download
 * broke: bumping the shared version for a Windows release pointed the macOS
 * link at a DMG that had never been built, so every Mac visitor got a 404.
 * Only ever set these to a version that is actually in the bucket.
 */
// Typed as string, not as their literals: these are release pointers that move
// independently, and code that compares them must stay legal when they differ.
export const WINDOWS_DESKTOP_VERSION: string = "1.0.125";
export const MACOS_DESKTOP_VERSION: string = "1.0.113";

export const DESKTOP_SIZE = "~200 MB";

export const WINDOWS_DESKTOP_URL =
  `${DOWNLOAD_BASE}/Work4You-${WINDOWS_DESKTOP_VERSION}-win-x64.exe`;

/** Apple Silicon (arm64) — first macOS release target. Flip available after CI publish. */
export const MACOS_DESKTOP_URL =
  `${DOWNLOAD_BASE}/Work4You-${MACOS_DESKTOP_VERSION}-mac-arm64.dmg`;

/** For surfaces that name one version for both platforms. */
export const DESKTOP_VERSION_LABEL =
  WINDOWS_DESKTOP_VERSION === MACOS_DESKTOP_VERSION
    ? WINDOWS_DESKTOP_VERSION
    : `${WINDOWS_DESKTOP_VERSION} (Windows) · ${MACOS_DESKTOP_VERSION} (macOS)`;

/**
 * Set true after the first DMG is on GCS (`latest-mac.yml` + artefact).
 * Can ship unsigned first (parity with Windows 1.0.95) — flip together with CI publish.
 */
export const MACOS_DESKTOP_AVAILABLE = true;

/** False until Apple Developer ID signing + notarization are live. */
export const MACOS_DESKTOP_SIGNED = false;

export const DESKTOP_DOWNLOAD_PATH = "/download/desktop";

export type DesktopDownloadPlatform = "windows" | "mac" | "linux" | "unknown";

export type DesktopDownloadTarget = {
  platform: DesktopDownloadPlatform;
  /** Absolute installer URL, or site path for mac-not-ready landing. */
  href: string;
  direct: boolean;
};

/** Resolve desktop installer from a User-Agent string (server / API route). */
export function resolveDesktopDownloadTarget(
  userAgent: string,
): DesktopDownloadTarget {
  const ua = userAgent || "";

  if (/Windows NT|Win64|WOW64|Windows/i.test(ua)) {
    return { platform: "windows", href: WINDOWS_DESKTOP_URL, direct: true };
  }

  if (/Macintosh|Mac OS X|MacIntel/i.test(ua)) {
    if (MACOS_DESKTOP_AVAILABLE) {
      return { platform: "mac", href: MACOS_DESKTOP_URL, direct: true };
    }
    return { platform: "mac", href: "/download/desktop/mac", direct: false };
  }

  if (/Linux|X11|CrOS/i.test(ua)) {
    return { platform: "linux", href: "/#install-terminal", direct: false };
  }

  return { platform: "unknown", href: DESKTOP_DOWNLOAD_PATH, direct: false };
}

/** Public bootstrap scripts on GCS (work4you.ai/install.* hits Fly auth). */
export const INSTALL_CMD = {
  windows: `irm ${DOWNLOAD_BASE}/install.ps1 | iex`,
  unix: `curl -fsSL ${DOWNLOAD_BASE}/install.sh | bash`,
} as const;

/** Login → SSO handoff → app SPA in the browser (or download in L0). */
export const BROWSER_ENTER = "/login?next=/login/enter";

/** Signed-in users skip the login form. */
export const BROWSER_ENTER_AUTHED = "/login/enter";

/** L0 revogado — o site abre o produto (SSO), não só /baixar. */
export function desktopLaunchPublic(): boolean {
  return false;
}

export function browserEnterAuthed(): string {
  return desktopLaunchPublic() ? "/baixar" : BROWSER_ENTER_AUTHED;
}

export function browserEnter(): string {
  return desktopLaunchPublic()
    ? "/login?next=/baixar"
    : BROWSER_ENTER;
}
