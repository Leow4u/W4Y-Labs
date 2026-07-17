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
