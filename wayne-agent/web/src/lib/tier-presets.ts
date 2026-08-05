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
import { isGratisPlan } from "@/lib/plans";
import {
  RELAY_FREE_PRIMARY_MODEL,
  RELAY_FREE_REASONING,
} from "@/lib/relay-free-model";

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
    // Relay 2.5 Fast backend — see relay-free-model.ts (single slug source).
    model: RELAY_FREE_PRIMARY_MODEL,
    reasoning: RELAY_FREE_REASONING,
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
 * UI-facing model modes (Fase 10 · Onda B). The customer never sees the five
 * internal tiers — the composer and Config expose exactly TWO product names:
 *
 *   Relay → `auto` preset (the router; fast + economical; every plan)
 *   MAX   → `expert` preset (premium reasoning; Pro+)
 *
 * Crew stays a *capability* in Agentes (delegate_task), NOT a UI model mode.
 */
export type UiMode = "relay" | "max";
export const UI_MODE_ORDER: UiMode[] = ["relay", "max"];
/** UI mode → internal tier preset key. Single source of truth. */
export const UI_MODE_TIER: Record<UiMode, TierKey> = { relay: "auto", max: "expert" };
/** Product name shown for a UI mode (brand names, not localized). */
export const UI_MODE_LABEL: Record<UiMode, string> = { relay: "Relay", max: "MAX" };

/** Collapses any internal tier onto the two UI modes (expert/crew → MAX). */
export function uiModeFromTier(tier: TierKey | null): UiMode {
  return tier === "expert" || tier === "crew" ? "max" : "relay";
}

/** Resolves the active UI mode straight from the config's (model, reasoning). */
export function uiModeFromConfig(model: string, reasoning: string): UiMode {
  return uiModeFromTier(tierFromConfig(model, reasoning));
}

/** The tier preset a UI mode applies. */
export function uiModePreset(mode: UiMode): TierPreset {
  return TIER_PRESETS[UI_MODE_TIER[mode]];
}

/** Plan-aware preset: Grátis keeps Relay 2.5 Fast (qwen), not the paid router. */
export function uiModePresetForPlan(
  mode: UiMode,
  plan: string | null | undefined,
): TierPreset {
  if (mode === "relay" && isGratisPlan(plan)) {
    return TIER_PRESETS.gratis;
  }
  return uiModePreset(mode);
}

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
