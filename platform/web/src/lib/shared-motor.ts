import "server-only";

/**
 * L0 (browser congelado + motor no PC) está revogado.
 * Claude v1: 1 email = 1 Fly `wayne-<slug>`. Nunca wayne-w4y para cliente.
 * @see docs/PLANO-CLAUDE-V1.md
 */

/** @deprecated L0 — sempre false. Signup provisiona Fly dedicada. */
export function desktopLaunchMode(): boolean {
  return false;
}

/** Default post-login: SSO para o tenant da sessão. */
export function postLoginDestination(): string {
  return "/login/enter";
}

export function postLoginCtaLabel(locale: "pt" | "en" = "pt"): string {
  return locale === "en" ? "Open Work4You" : "Abrir o Work4You";
}

/** Motor partilhado wayne-w4y NÃO é caminho de cliente. */
export function sharedMotorEnabled(): boolean {
  return false;
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

/** Todos os planos: Fly dedicada. Free não partilha wayne-w4y. */
export function useSharedMotorForPlan(_plan: string): boolean {
  return false;
}
