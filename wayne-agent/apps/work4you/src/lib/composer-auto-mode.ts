/**
 * Cursor-style Auto toggle for the composer model menu.
 * Auto ON → `openrouter/auto` routing; Auto OFF → last manual / featured model.
 */
import { persistString, storedString } from '@/lib/storage'
import {
  W4Y_AUTO_MODEL_ID,
  W4Y_CATALOG_PROVIDER,
  W4Y_FEATURED_MODELS
} from '@/lib/w4y-featured-models'

const MANUAL_MODEL_KEY = 'hermes.desktop.composer.manual-model'
const MANUAL_PROVIDER_KEY = 'hermes.desktop.composer.manual-provider'

/** True when the active model is the catalog auto-router. */
export function isW4yAutoModel(model: string): boolean {
  const m = model.trim()
  if (!m) {
    return false
  }

  if (m === W4Y_AUTO_MODEL_ID) {
    return true
  }

  if (/\/(auto)$/i.test(m)) {
    return true
  }

  const slash = m.lastIndexOf('/')
  const base = slash >= 0 ? m.slice(slash + 1) : m

  return base.toLowerCase() === 'auto'
}

/** Remember the last non-Auto pick so toggling Auto off can restore it. */
export function rememberComposerManualModel(model: string, provider: string): void {
  if (!model.trim() || !provider.trim() || isW4yAutoModel(model)) {
    return
  }

  persistString(MANUAL_MODEL_KEY, model)
  persistString(MANUAL_PROVIDER_KEY, provider)
}

/** Last manual model, or the first featured non-Auto default. */
export function resolveComposerManualFallback(): { model: string; provider: string } {
  const model = storedString(MANUAL_MODEL_KEY)?.trim() ?? ''
  const provider = storedString(MANUAL_PROVIDER_KEY)?.trim() ?? ''

  if (model && provider && !isW4yAutoModel(model)) {
    return { model, provider }
  }

  const featured = W4Y_FEATURED_MODELS.find(entry => entry.id !== W4Y_AUTO_MODEL_ID && entry.defaultOn)

  return {
    model: featured?.id ?? 'x-ai/grok-4.5',
    provider: W4Y_CATALOG_PROVIDER
  }
}
