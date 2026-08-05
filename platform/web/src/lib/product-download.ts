/** Desktop installer + CLI one-liners (marketing site). */

export const WINDOWS_DESKTOP_URL =
  "https://storage.googleapis.com/w4y-engine-dist/Work4You-1.0.87-win-x64.exe";

export const DESKTOP_VERSION = "1.0.87";
export const DESKTOP_SIZE = "~104 MB";

const INSTALL_SCRIPT_BASE =
  "https://storage.googleapis.com/w4y-engine-dist";

/** Public bootstrap scripts on GCS (work4you.ai/install.* hits Fly auth). */
export const INSTALL_CMD = {
  windows: `irm ${INSTALL_SCRIPT_BASE}/install.ps1 | iex`,
  unix: `curl -fsSL ${INSTALL_SCRIPT_BASE}/install.sh | bash`,
} as const;

/** Login → SSO handoff → app SPA in the browser. */
export const BROWSER_ENTER = "/login?next=/login/enter";

/** Signed-in users skip the login form. */
export const BROWSER_ENTER_AUTHED = "/login/enter";
