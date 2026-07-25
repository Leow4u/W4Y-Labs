// Shared locale constants/types — safe for BOTH server and client modules
// (no next/headers here; the server-only reader lives in site-locale.ts).
export type SiteLocale = "pt" | "en";

export const SITE_LOCALE_COOKIE = "w4y_site_locale";
