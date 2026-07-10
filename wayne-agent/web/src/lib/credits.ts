/**
 * Créditos Work4You (Onda C — docs/BILLING-ARQUITETURA.md §3): o usuário vê
 * CRÉDITOS, nunca dólar. `créditos = custo-real × taxa`, onde a taxa embute a
 * margem e esconde a volatilidade do preço de LLM.
 *
 * CREDITS_PER_USD = 100 é a taxa OFICIAL do catálogo implementado no épico de
 * billing (commit 503485a: "créditos exibidos, 1 cr = $0,01" — Starter/Pro/Max
 * na casca/Stripe). Trocar aqui reprecifica toda a UI de utilização de uma vez
 * — mas precisa andar JUNTO com o catálogo da casca.
 *
 * SEGURANÇA: nenhum valor em US$ pode vazar pra UI do cliente — sempre passar
 * pelo usdToCredits antes de renderizar.
 */
export const CREDITS_PER_USD = 100;

export function usdToCredits(usd: number): number {
  return Math.round((usd || 0) * CREDITS_PER_USD);
}

/** 12345 → "12.345" (separador do locale ativo do navegador). */
export function formatCredits(n: number): string {
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}
