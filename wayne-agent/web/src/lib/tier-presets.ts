/**
 * Tiers "modelos Work4You" — abstração sobre (modelo × esforço de raciocínio ×
 * multi-agente) que ESCONDE as LLMs por trás de 4 níveis: Flash / Auto / Expert
 * / Crew. Aplicar um tier = setModelAssignment (modelo) + saveConfig
 * (agent.reasoning_effort + delegation). Ver docs/BILLING-ARQUITETURA.md.
 *
 * O multiplicador de crédito de cada tier (billing) segue o custo real do modelo
 * — Flash é barato, Crew (Claude + subagentes) é caro. O gating por plano
 * (Expert=Pro, Crew=Business) entra na fase de planos.
 */

export type TierKey = "flash" | "auto" | "expert" | "crew";

export interface TierPreset {
  key: TierKey;
  label: string;
  subtitle: string;
  /** slug do modelo na OpenRouter (provider = "openrouter"). */
  model: string;
  /** agent.reasoning_effort */
  reasoning: string;
  /** delegation.model — "" herda do pai. */
  delegationModel: string;
  /** delegation.reasoning_effort — "" herda. */
  delegationReasoning: string;
  /** delegation.max_concurrent_children (só faz sentido no Crew). */
  maxConcurrentChildren?: number;
}

export const TIER_PRESETS: Record<TierKey, TierPreset> = {
  flash: {
    key: "flash",
    label: "Flash",
    subtitle: "Respostas rápidas",
    model: "google/gemini-3.5-flash",
    reasoning: "low",
    delegationModel: "",
    delegationReasoning: "",
  },
  auto: {
    key: "auto",
    label: "Auto",
    subtitle: "Escolhe por você",
    model: "google/gemini-3.5-flash",
    reasoning: "medium",
    delegationModel: "",
    delegationReasoning: "",
  },
  expert: {
    key: "expert",
    label: "Expert",
    subtitle: "Pensa fundo",
    model: "anthropic/claude-sonnet-5",
    reasoning: "high",
    delegationModel: "",
    delegationReasoning: "",
  },
  crew: {
    key: "crew",
    label: "Crew",
    subtitle: "Time de especialistas",
    model: "anthropic/claude-opus-4.8",
    reasoning: "high",
    delegationModel: "google/gemini-3.5-flash",
    delegationReasoning: "low",
    maxConcurrentChildren: 4,
  },
};

export const TIER_ORDER: TierKey[] = ["flash", "auto", "expert", "crew"];
export const DEFAULT_TIER: TierKey = "auto";

/** Último segmento do slug (ex.: "google/gemini-3.5-flash" -> "gemini-3.5-flash"),
 *  para casar independente de o config guardar o slug curto ou completo. */
function modelTail(m: string): string {
  return (m || "").split("/").pop() || "";
}

/**
 * Detecta o tier ativo a partir do (model, reasoning) da config. Flash e Auto
 * compartilham o modelo e se diferenciam pelo esforço; Expert/Crew pelo modelo.
 * Retorna null quando o usuário escolheu um modelo cru fora dos presets.
 */
export function tierFromConfig(model: string, reasoning: string): TierKey | null {
  const tail = modelTail(model);
  const r = (reasoning || "medium").toLowerCase();
  for (const k of TIER_ORDER) {
    const p = TIER_PRESETS[k];
    if (modelTail(p.model) === tail && p.reasoning === r) return k;
  }
  return null;
}
