/**
 * plans — plan vocabulary + upgrade/portal deep links (Onda D · PR-9 D2/D5/D7).
 *
 * The tenant plan lives in the PLATFORM (GET /planos/plan). Web hits that
 * same-origin (LB routes /planos* to the platform). Local-engine desktop
 * logged-in cannot reach /planos on loopback and the shell bridge is /api/*
 * only — so the desktop uses GET /api/account/plan on the cloud tenant
 * (Wayne proxies to the platform with the session cookies). null = unknown.
 *
 * Customer-facing names: Grátis · Essencial · Plus · Max (Cursor-like billing).
 * Internal platform keys (free/starter/pro/max) map here — single source of truth.
 */
import { accountGetJson, shouldUseAccountCloud } from "@/lib/accountApi";
import { isLocalEngine } from "@/lib/projects";

export type PlanKey = "gratis" | "essencial" | "plus" | "max";

/** Brand names — product nouns shown as-is (not localized), like Relay/MAX. */
export const PLAN_LABEL: Record<PlanKey, string> = {
  gratis: "Grátis",
  essencial: "Essencial",
  plus: "Plus",
  max: "Max",
};

/** Platform plan key (free/starter/pro/max/…) → UI PlanKey. Unknown → gratis. */
export function normalizePlan(raw: string | null | undefined): PlanKey {
  const p = (raw || "").toLowerCase().trim();
  if (p === "starter" || p === "essencial") return "essencial";
  if (p === "pro" || p === "plus") return "plus";
  if (p === "max" || p === "business") return "max";
  if (p === "free" || p === "gratis") return "gratis";
  return "gratis";
}

/** Display brand name for a raw platform plan key. */
export function planLabel(raw: string | null | undefined): string {
  return PLAN_LABEL[normalizePlan(raw)];
}

/** True when the tenant is on the subsidized Free tier (Relay 2.5 Fast only). */
export function isGratisPlan(raw: string | null | undefined): boolean {
  return normalizePlan(raw) === "gratis";
}

/** Full catalog unlocks on Essencial and above. */
export function planUnlocksCatalogModels(raw: string | null | undefined): boolean {
  return !isGratisPlan(raw);
}

/** MAX (premium reasoning) requires Plus or Max. */
export function planUnlocksMax(raw: string | null | undefined): boolean {
  const k = normalizePlan(raw);
  return k === "plus" || k === "max";
}

/** Entregas share/export pack — Plus+ (Max full; Plus partial per audit matrix). */
export function planUnlocksDeliverableShare(raw: string | null | undefined): boolean {
  const k = normalizePlan(raw);
  return k === "plus" || k === "max";
}

/** Reads the tenant plan from the platform. null = unknown (fail-open). */
export async function fetchPlan(): Promise<string | null> {
  try {
    if (await shouldUseAccountCloud()) {
      const d = await accountGetJson<{ plan?: string }>(
        "/api/account/plan",
        8000,
      );
      return d?.plan ? String(d.plan) : null;
    }
    const r = await fetch("/planos/plan", { credentials: "include" });
    if (!r.ok) return null;
    const d = (await r.json()) as { plan?: string };
    return d?.plan ? String(d.plan) : null;
  } catch {
    return null;
  }
}

/**
 * Opens the subscription page. Cloud: same origin, the LB routes /planos to the
 * platform (full-page nav, leaves the SPA — intentional). Local-engine: the SPA
 * origin is the loopback gateway, so /planos does not exist here — open
 * work4you.ai/planos as a shell child window (the shell allows those children).
 */
export function openPlans(query?: string): void {
  const path = `/planos${query ? `?${query}` : ""}`;
  if (isLocalEngine()) {
    window.open(`https://work4you.ai${path}`);
  } else {
    window.location.href = path;
  }
}

/** Deep link for a locked tier/feature → upgrade at the right plan (D7). */
export function openUpgrade(planHint?: PlanKey): void {
  const platformKey =
    planHint === "essencial"
      ? "starter"
      : planHint === "plus"
        ? "pro"
        : planHint === "max"
          ? "max"
          : undefined;
  openPlans(platformKey ? `plan=${platformKey}` : undefined);
}

/** Absolute path for portal when the caller builds a full URL (desktop). */
export const BILLING_PORTAL_PATH = "/planos/portal";

/** "Manage subscription" → Stripe customer portal, via the platform (D5). */
export function openBillingPortal(): void {
  if (isLocalEngine()) {
    window.open(`https://work4you.ai${BILLING_PORTAL_PATH}`);
  } else {
    window.location.href = BILLING_PORTAL_PATH;
  }
}
