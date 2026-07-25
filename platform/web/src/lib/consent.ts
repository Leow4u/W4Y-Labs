// Cookie-consent state for the public site (client-side helper).
// Analytics/marketing scripts must check this before loading:
//   if (getCookieConsent() === "all") { /* load analytics */ }
// "essential" (or no choice yet) = never load non-essential scripts.

export type CookieConsent = "all" | "essential";

const KEY = "w4y:cookie-consent";

export function getCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { choice?: string };
    return parsed.choice === "all" || parsed.choice === "essential"
      ? parsed.choice
      : null;
  } catch {
    return null;
  }
}

export function setCookieConsent(choice: CookieConsent): void {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ choice, at: new Date().toISOString() }),
    );
  } catch {
    /* storage unavailable (private mode) — banner will just show again */
  }
  // Lets already-mounted listeners (Analytics) react without a reload.
  window.dispatchEvent(new CustomEvent("w4y:consent", { detail: choice }));
}
