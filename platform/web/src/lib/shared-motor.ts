import "server-only";

/** Phase L0 — ship desktop first; browser chat and shared motor stay off prod. */
export function desktopLaunchMode(): boolean {
  return (process.env.W4Y_LAUNCH_MODE ?? "").trim().toLowerCase() === "desktop";
}

/** Default post-login path (verify, abrir, onboarding ready). */
export function postLoginDestination(): string {
  return desktopLaunchMode() ? "/baixar" : "/login/enter";
}

/** Human label for CTAs when launch mode is active. */
export function postLoginCtaLabel(locale: "pt" | "en" = "pt"): string {
  if (!desktopLaunchMode()) {
    return locale === "en" ? "Open Work4You" : "Abrir o Work4You";
  }
  return locale === "en" ? "Download the app" : "Baixar aplicativo";
}

/** Shared multi-tenant Fly motor (Claude-style instant login). */
export function sharedMotorEnabled(): boolean {
  if (desktopLaunchMode()) return false;
  return (process.env.W4Y_SHARED_MOTOR ?? "1") === "1";
}

export function sharedFlyApp(): string {
  return (process.env.W4Y_SHARED_FLY_APP?.trim() || "wayne-w4y").trim();
}

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
  return `https://${sharedFlyApp()}.fly.dev`;
}

/** Free-tier tenants use the shared motor; paid plans keep dedicated Fly apps. */
export function useSharedMotorForPlan(plan: string): boolean {
  if (!sharedMotorEnabled()) return false;
  const p = plan.trim().toLowerCase();
  return p === "free" || p === "";
}