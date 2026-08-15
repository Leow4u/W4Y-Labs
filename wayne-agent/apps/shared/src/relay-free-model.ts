/**
 * Relay 2.5 Fast — subsidized free-tier house model (Cursor Hobby pattern).
 * Shared by desktop browser/electron builds. See docs/BILLING-ARQUITETURA.md.
 */

export const RELAY_25_FAST_LABEL = 'Relay 2.5 Fast'

export const RELAY_FREE_PRIMARY_MODEL = 'qwen/qwen3.7-flash'

export const RELAY_FREE_FALLBACK_MODEL = 'openai/gpt-oss-20b'

export const RELAY_FREE_REASONING = 'medium'

export const RELAY_FREE_PROVIDER = 'openrouter'

export function isRelayFreeModel(modelId: string): boolean {
  const id = (modelId || '').trim()
  if (!id) return false
  if (id === RELAY_FREE_PRIMARY_MODEL) return true
  const tail = id.split('/').pop() || id
  return tail === 'qwen3.7-flash'
}

export function relayFreeFallbackChain(): Array<{ provider: string; model: string }> {
  return [{ provider: RELAY_FREE_PROVIDER, model: RELAY_FREE_FALLBACK_MODEL }]
}
