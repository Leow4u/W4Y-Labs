import "server-only";

/**
 * Claude v1: 1 email = 1 Fly `wayne-<slug>`.
 * The Fly *app* `wayne-w4y` is W4Y-internal lab / image factory only —
 * never a customer runtime (shared motor is revoked).
 * @see docs/PLANO-CLAUDE-V1.md
 */

/** Fly app name reserved for W4Y lab — not customer routing. */
export const SHARED_LAB_FLY_APP = "wayne-w4y";

/** @deprecated L0 — always false. Signup provisions a dedicated Fly. */
export function desktopLaunchMode(): boolean {
  return false;
}

/** Default post-login: SSO into the session tenant's dedicated Fly. */
export function postLoginDestination(): string {
  return "/login/enter";
}

export function postLoginCtaLabel(locale: "pt" | "en" = "pt"): string {
  return locale === "en" ? "Open Work4You" : "Abrir o Work4You";
}

/**
 * Shared-motor product path — permanently off.
 * Do not reintroduce env-gated true; isolation requires a Fly app per email.
 */
export function sharedMotorEnabled(): boolean {
  return false;
}

/** @deprecated Lab hostname helper — not used for customer SSO. */
export function sharedFlyApp(): string {
  return SHARED_LAB_FLY_APP;
}

/** @deprecated */
export function sharedMotorUrl(): string {
  const appSubdomain = (process.env.W4Y_APP_SUBDOMAIN ?? "1") === "1";
  const appOrigin = (
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.APP_ORIGIN ||
    ""
  ).trim();
  if (appSubdomain && appOrigin) {
    return appOrigin.replace(/\/$/, "");
  }
  const fromEnv = process.env.WAYNE_INTERNAL_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return `https://${SHARED_LAB_FLY_APP}.fly.dev`;
}

/** Every plan gets a dedicated Fly. Free never shares wayne-w4y. */
export function useSharedMotorForPlan(_plan: string): boolean {
  return false;
}

/** True when `fly_app` must not receive customer traffic. */
export function isForbiddenCustomerFlyApp(
  flyApp: string | null | undefined,
): boolean {
  const app = (flyApp || "").trim();
  if (!app) return true;
  return app === SHARED_LAB_FLY_APP;
}
