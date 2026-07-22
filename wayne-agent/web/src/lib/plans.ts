/**
 * plans — plan vocabulary + upgrade/portal deep links (Onda D · PR-9 D2/D5/D7).
 *
 * The tenant plan lives in the PLATFORM, read live from the shell:
 *   GET /planos/plan → { plan: string }   (same origin; the LB routes /planos*
 *   to the platform, so the session cookie rides along). null = unknown.
 *
 * The customer UI shows exactly THREE product names — Hobby · Pro · Business —
 * plus Trial. Internal platform keys (free/starter/pro/max/…) map onto them
 * HERE, the single source of truth. Never surface Essencial/Flash/Crew in the
 * UI (see docs/BILLING-ARQUITETURA.md §v2).
 */
import { isLocalEngine } from "@/lib/projects";

export type PlanKey = "hobby" | "pro" | "business" | "trial";

/** Brand names — product nouns shown as-is (not localized), like Relay/MAX. */
export const PLAN_LABEL: Record<PlanKey, string> = {
  hobby: "Hobby",
  pro: "Pro",
  business: "Business",
  trial: "Trial",
};

/** Platform plan key (free/starter/pro/max/…) → UI PlanKey. Unknown → hobby. */
export function normalizePlan(raw: string | null | undefined): PlanKey {
  const p = (raw || "").toLowerCase().trim();
  if (p === "pro") return "pro";
  if (p === "max" || p === "business") return "business";
  if (p === "trial") return "trial";
  return "hobby"; // free / starter / essencial / unknown
}

/** Display brand name for a raw platform plan key. */
export function planLabel(raw: string | null | undefined): string {
  return PLAN_LABEL[normalizePlan(raw)];
}

/** MAX (premium reasoning) requires Pro+. Hobby/Trial are locked out. */
export function planUnlocksMax(raw: string | null | undefined): boolean {
  const k = normalizePlan(raw);
  return k === "pro" || k === "business";
}

/** Entregas share/export pack — Pro+ (Business full; Pro partial per audit matrix). */
export function planUnlocksDeliverableShare(raw: string | null | undefined): boolean {
  const k = normalizePlan(raw);
  return k === "pro" || k === "business";
}

/** Reads the tenant plan from the shell. null = unknown (fail-open). */
export async function fetchPlan(): Promise<string | null> {
  try {
    const r = await fetch("/planos/plan", { credentials: "include" });
    if (!r.ok) return null;
    const d = (await r.json()) as { plan?: string };
    return d?.plan ? String(d.plan) : null;
  } catch {
    return null; // shell unavailable → unknown → fail-open (no lock)
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
  openPlans(planHint ? `plan=${planHint}` : undefined);
}

/** "Manage subscription" → Stripe customer portal, via the platform (D5). */
export function openBillingPortal(): void {
  openPlans("portal=1");
}
