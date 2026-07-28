import { cookies, headers } from "next/headers";
import { SITE_LOCALE_COOKIE, type SiteLocale } from "./site-locale-shared";

// Public-site locale (pt is the house default; en is served automatically to
// visitors whose browser asks for another language, and via the header chip).
// Cookie-based on purpose: same URLs for both languages, no route restructure.
// SERVER-ONLY (next/headers): client components import site-locale-shared.
export { SITE_LOCALE_COOKIE, type SiteLocale } from "./site-locale-shared";

/** Highest-priority language in an Accept-Language header ("pt-BR,pt;q=0.9,en;q=0.8"). */
function preferredFromHeader(value: string | null): SiteLocale {
  if (!value) return "pt"; // no stated preference (incl. most crawlers) -> house default
  const best = value
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split("=")[1]) || 0 : 1 };
    })
    .filter((e) => e.tag && e.tag !== "*")
    .sort((a, b) => b.q - a.q)[0];
  if (!best) return "pt";
  // Portuguese speakers get Portuguese; everyone else gets English.
  return best.tag.startsWith("pt") ? "pt" : "en";
}

/**
 * Locale for this request: an explicit choice (the PT|EN chip writes the
 * cookie) always wins; otherwise we follow the browser's stated language —
 * the same signal Claude and ChatGPT use, and a truer preference than IP
 * geolocation, which only says where someone is standing.
 */
export async function getSiteLocale(): Promise<SiteLocale> {
  const chosen = (await cookies()).get(SITE_LOCALE_COOKIE)?.value;
  if (chosen === "en" || chosen === "pt") return chosen;
  return preferredFromHeader((await headers()).get("accept-language"));
}

/** BCP-47 tag for the <html lang> attribute. */
export function htmlLang(locale: SiteLocale): string {
  return locale === "en" ? "en" : "pt-BR";
}
