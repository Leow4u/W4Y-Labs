/**
 * "modelos Work4You" tiers — an abstraction over (model × reasoning effort ×
 * multi-agent) that HIDES the LLMs behind 4 levels: Flash / Auto / Expert
 * / Crew. Applying a tier = setModelAssignment (model) + saveConfig
 * (agent.reasoning_effort + delegation). See docs/BILLING-ARQUITETURA.md.
 *
 * Each tier's credit multiplier (billing) follows the model's real cost
 * — Flash is cheap, Crew (Claude + subagents) is expensive. Plan gating
 * (Expert=Pro, Crew=Business) comes in the plans phase.
 */

import type { Translations } from "@/i18n/types";

export type TierKey = "gratis" | "flash" | "auto" | "expert" | "crew";

export interface TierPreset {
  key: TierKey;
  label: string;
  subtitle: string;
  /** model slug on OpenRouter (provider = "openrouter"). */
  model: string;
  /** agent.reasoning_effort */
  reasoning: string;
  /** delegation.model — "" inherits from the parent. */
  delegationModel: string;
  /** delegation.reasoning_effort — "" inherits. */
  delegationReasoning: string;
  /** delegation.max_concurrent_children (only makes sense on Crew). */
  maxConcurrentChildren?: number;
}

export const TIER_PRESETS: Record<TierKey, TierPreset> = {
  gratis: {
    key: "gratis",
    // label/subtitle are FALLBACKS — every render path goes through
    // tierLabel/tierSubtitle below, which localize this tier (×16).
    label: "Grátis",
    subtitle: "Sem custo",
    // Zero-cost tier: OpenRouter ":free" variant, served by NVIDIA (1M ctx,
    // tool calling). SINGLE source of truth for the slug — if OpenRouter ever
    // drops the model, swapping it is an operational change made here only.
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    reasoning: "medium",
    delegationModel: "",
    delegationReasoning: "",
  },
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

export const TIER_ORDER: TierKey[] = ["gratis", "flash", "auto", "expert", "crew"];
export const DEFAULT_TIER: TierKey = "auto";

/**
 * Display label for a tier. "gratis" is localized (×16 via i18n); Flash/Auto/
 * Expert/Crew are product names shown as-is everywhere.
 */
export function tierLabel(t: Translations, k: TierKey): string {
  return k === "gratis" ? t.tiers.gratis : TIER_PRESETS[k].label;
}

/** Display subtitle for a tier — same localization rule as tierLabel. */
export function tierSubtitle(t: Translations, k: TierKey): string {
  return k === "gratis" ? t.tiers.gratisSubtitle : TIER_PRESETS[k].subtitle;
}

/** Last segment of the slug (e.g. "google/gemini-3.5-flash" -> "gemini-3.5-flash"),
 *  to match regardless of whether the config stores the short or the full slug. */
function modelTail(m: string): string {
  return (m || "").split("/").pop() || "";
}

/**
 * Detects the active tier from the config's (model, reasoning). Flash and Auto
 * share the model and differ by effort; Expert/Crew differ by model.
 * Returns null when the user picked a raw model outside the presets.
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
