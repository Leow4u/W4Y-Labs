import type { Plan } from "@/lib/billing";
import { PLANS } from "@/lib/billing";

/** Decisão de injecção de chave na activação Stripe (contrato testável). */
export interface KeyInjectionDecision {
  /** Tentar requestEnsureKey no provisionador. */
  shouldEnsure: boolean;
  /** Marcar key_injected_at=now() após sucesso. */
  markInjected: boolean;
  creditsUsd: number;
  reason: "existing_hash_relimit" | "ensure_new_key" | "deferred_not_ready" | "deferred_no_app" | "free_plan";
}

export function decideKeyInjection(opts: {
  plan: Plan;
  existingHash: string | null;
  flyApp: string | null;
  instanceReady: boolean;
}): KeyInjectionDecision {
  const def = PLANS[opts.plan];
  if (def.creditsUsd <= 0) {
    return {
      shouldEnsure: false,
      markInjected: opts.existingHash != null,
      creditsUsd: 0,
      reason: "free_plan",
    };
  }
  if (opts.existingHash) {
    return {
      shouldEnsure: false,
      markInjected: true,
      creditsUsd: def.creditsUsd,
      reason: "existing_hash_relimit",
    };
  }
  if (!opts.flyApp) {
    return {
      shouldEnsure: false,
      markInjected: false,
      creditsUsd: def.creditsUsd,
      reason: "deferred_no_app",
    };
  }
  if (!opts.instanceReady) {
    return {
      shouldEnsure: false,
      markInjected: false,
      creditsUsd: def.creditsUsd,
      reason: "deferred_not_ready",
    };
  }
  return {
    shouldEnsure: true,
    markInjected: true,
    creditsUsd: def.creditsUsd,
    reason: "ensure_new_key",
  };
}
