import { cookies } from "next/headers";
import { SITE_LOCALE_COOKIE, type SiteLocale } from "./site-locale-shared";

// Public-site locale (pt default, en opt-in via the header chip).
// Cookie-based on purpose: same URLs for both languages, no route
// restructure, no middleware — the chip sets the cookie and refreshes.
// SERVER-ONLY (next/headers): client components import site-locale-shared.
export { SITE_LOCALE_COOKIE, type SiteLocale } from "./site-locale-shared";

export async function getSiteLocale(): Promise<SiteLocale> {
  const v = (await cookies()).get(SITE_LOCALE_COOKIE)?.value;
  return v === "en" ? "en" : "pt";
}
