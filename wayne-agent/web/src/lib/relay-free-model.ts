/**
 * Relay 2.5 Fast — subsidized free-tier house model (Cursor Hobby pattern).
 *
 * Users on plan `free` see only this product name in the composer; other models
 * stay locked until upgrade. Backend slugs are operational — swap here without
 * redeploying copy. See docs/BILLING-ARQUITETURA.md §Relay 2.5 Fast.
 */

/** Branded product name (never localized — like Relay / MAX). */
export const RELAY_25_FAST_LABEL = "Relay 2.5 Fast";

/** OpenRouter primary slug (~$0.03 / $0.13 per M, tools, 1M ctx). */
export const RELAY_FREE_PRIMARY_MODEL = "qwen/qwen3.7-flash";

/** OpenRouter fallback when primary errors or rate-limits (~$0.03 / $0.14 per M). */
export const RELAY_FREE_FALLBACK_MODEL = "openai/gpt-oss-20b";

/** Default reasoning effort for the free house model. */
export const RELAY_FREE_REASONING = "medium";

/** Provider for platform-routed free inference. */
export const RELAY_FREE_PROVIDER = "openrouter";

/** True when a catalog slug is the Relay 2.5 Fast backend (primary). */
export function isRelayFreeModel(modelId: string): boolean {
  const id = (modelId || "").trim();
  if (!id) return false;
  if (id === RELAY_FREE_PRIMARY_MODEL) return true;
  const tail = id.split("/").pop() || id;
  return tail === "qwen3.7-flash";
}

/** fallback_model chain entry for config.yaml (openrouter provider). */
export function relayFreeFallbackChain(): Array<{ provider: string; model: string }> {
  return [{ provider: RELAY_FREE_PROVIDER, model: RELAY_FREE_FALLBACK_MODEL }];
}
