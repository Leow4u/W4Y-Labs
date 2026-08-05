/** Desktop installer + CLI one-liners (marketing site). */

export const WINDOWS_DESKTOP_URL =
  "https://storage.googleapis.com/w4y-engine-dist/Work4You-1.0.87-win-x64.exe";

export const DESKTOP_VERSION = "1.0.87";
export const DESKTOP_SIZE = "~104 MB";

export const INSTALL_CMD = {
  windows: "irm https://work4you.ai/install.ps1 | iex",
  unix: "curl -fsSL https://work4you.ai/install.sh | bash",
} as const;

/** Login → SSO handoff → app SPA in the browser. */
export const BROWSER_ENTER = "/login?next=/login/enter";

/** Signed-in users skip the login form. */
export const BROWSER_ENTER_AUTHED = "/login/enter";
