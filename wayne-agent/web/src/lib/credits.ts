/**
 * Work4You credits (Onda C — docs/BILLING-ARQUITETURA.md §3): the user sees
 * CREDITS, never dollars. `credits = real-cost × rate`, where the rate embeds
 * the margin and hides LLM price volatility.
 *
 * CREDITS_PER_USD = 100 is the OFFICIAL rate of the catalog implemented in the
 * billing epic (commit 503485a: "créditos exibidos, 1 cr = $0,01" — Starter/
 * Pro/Max in the shell/Stripe). Changing it here reprices the whole usage UI at
 * once — but it must move TOGETHER with the shell's catalog.
 *
 * SECURITY: no US$ value may leak into the customer UI — always go through
 * usdToCredits before rendering.
 */
export const CREDITS_PER_USD = 100;

export function usdToCredits(usd: number): number {
  return Math.round((usd || 0) * CREDITS_PER_USD);
}

/** 12345 → "12.345" (separator of the browser's active locale). */
export function formatCredits(n: number): string {
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

/**
 * Usage bands for the credit meter (Onda D · PR-9 D4) — the friendly-warning
 * thresholds from BILLING-ARQUITETURA §5: 50 / 75 / 90%. One source of truth
 * for both the Config meter and the composer footer so the colors never drift.
 */
export type CreditBand = "ok" | "warn" | "high" | "critical";

export function creditBand(usedPercent: number | null | undefined): CreditBand {
  const p = usedPercent ?? 0;
  if (p >= 90) return "critical";
  if (p >= 75) return "high";
  if (p >= 50) return "warn";
  return "ok";
}

/** Tailwind text-color class for a band (transparent-to-loud). */
export function creditBandText(band: CreditBand): string {
  switch (band) {
    case "critical":
      return "text-destructive";
    case "high":
      return "text-warning";
    case "warn":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-text-tertiary";
  }
}

/** Tailwind fill-color class for a band's progress bar. */
export function creditBandFill(band: CreditBand): string {
  switch (band) {
    case "critical":
      return "bg-destructive";
    case "high":
      return "bg-warning";
    case "warn":
      return "bg-amber-500";
    default:
      return "bg-live";
  }
}
