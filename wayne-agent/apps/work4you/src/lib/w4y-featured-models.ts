/**
 * Curated models for Settings → Models (Cursor-style roster).
 * IDs are OpenRouter slugs; product copy never says “OpenRouter”.
 * Hover blurbs / version labels are localized via i18n (`settings.model.featured*`);
 * English `description` here is fallback only.
 */
import type { ModelOptionProvider } from '@/types/hermes'

import { displayModelName } from './model-status-label'
import { isRelayFreeModel, RELAY_25_FAST_LABEL, RELAY_FREE_PRIMARY_MODEL } from './relay-free-model'

export type FeaturedVersionKey = 'highEffort' | 'fast'

export interface FeaturedModel {
  /** Catalog model id (e.g. anthropic/claude-opus-5). */
  id: string
  /** Short label for the Models settings row / composer. */
  label: string
  /** Full title in the hover card (defaults to label). Brand names stay untranslated. */
  title?: string
  /** English hover blurb — overridden by i18n when the locale provides one. */
  description: string
  /** Context window tokens for the hover card. */
  contextWindow: number
  /** Optional version chip key (localized in i18n). */
  version?: FeaturedVersionKey
  /** On by default in the composer picker when the user hasn’t customized. */
  defaultOn: boolean
  /**
   * `pinned` = always on the main Models list.
   * `more` = revealed by “More…” on the same screen.
   */
  section: 'pinned' | 'more'
}

/** Default provider slug for platform-routed catalog models. */
export const W4Y_CATALOG_PROVIDER = 'openrouter'

/** Catalog auto-router id — always pinned first in composer pickers. */
export const W4Y_AUTO_MODEL_ID = 'openrouter/auto'

/**
 * Product model pickers (composer, Settings → Models, visibility dialog, etc.)
 * only list the platform catalog + providers the user explicitly defined.
 * Ambient Anthropic / GitHub Copilot / other system providers must never appear
 * as separate sections — they imply the user connected those APIs.
 */
export function isW4yPickerProvider(
  provider: Pick<ModelOptionProvider, 'slug' | 'is_user_defined'>
): boolean {
  const slug = (provider.slug || '').toLowerCase()
  if (!slug || slug === 'moa') {
    return false
  }
  return slug === W4Y_CATALOG_PROVIDER || provider.is_user_defined === true
}

/** Filter provider rows for every Work4You model-list UI. */
export function filterW4yProviders(
  providers: readonly ModelOptionProvider[] | null | undefined
): ModelOptionProvider[] {
  return (providers ?? []).filter(isW4yPickerProvider)
}

/**
 * Ensure the platform catalog row exists and includes Auto, even when the live
 * options payload omitted it (stale cache / curated static list).
 */
export function ensureW4yAutoModel(
  providers: readonly ModelOptionProvider[] | null | undefined
): ModelOptionProvider[] {
  const list = [...(providers ?? [])]
  const idx = list.findIndex(p => (p.slug || '').toLowerCase() === W4Y_CATALOG_PROVIDER)

  if (idx < 0) {
    list.unshift({
      authenticated: true,
      models: [W4Y_AUTO_MODEL_ID],
      name: 'Catalog',
      slug: W4Y_CATALOG_PROVIDER
    })
    return list
  }

  const row = list[idx]!
  const models = row.models ?? []
  if (models.includes(W4Y_AUTO_MODEL_ID)) {
    return list
  }

  list[idx] = { ...row, models: [W4Y_AUTO_MODEL_ID, ...models] }
  return list
}

/**
 * Ensure Relay 2.5 Fast (`qwen/qwen3.7-flash`) is in the catalog row even when
 * the live OpenRouter list or curated cache omitted it — Free plan users must
 * always see their house model in Conta/Models and the composer picker.
 */
export function ensureRelayFreeModel(
  providers: readonly ModelOptionProvider[] | null | undefined
): ModelOptionProvider[] {
  const list = [...(providers ?? [])]
  const idx = list.findIndex(p => (p.slug || '').toLowerCase() === W4Y_CATALOG_PROVIDER)

  if (idx < 0) {
    list.unshift({
      authenticated: true,
      models: [RELAY_FREE_PRIMARY_MODEL, W4Y_AUTO_MODEL_ID],
      name: 'Catalog',
      slug: W4Y_CATALOG_PROVIDER
    })
    return list
  }

  const row = list[idx]!
  const models = row.models ?? []
  if (models.some(id => isRelayFreeModel(id))) {
    return list
  }

  list[idx] = { ...row, models: [RELAY_FREE_PRIMARY_MODEL, ...models] }
  return list
}

/** Catalog providers with Auto + Relay forced in — shared prep for every picker. */
export function prepareW4yPickerProviders(
  providers: readonly ModelOptionProvider[] | null | undefined
): ModelOptionProvider[] {
  return filterW4yProviders(ensureRelayFreeModel(ensureW4yAutoModel(providers)))
}

/**
 * Curated Models roster. Order = display order.
 * Pinned = main list; More = inline expand; + Add more LLM = full catalog page.
 */
export const W4Y_FEATURED_MODELS: readonly FeaturedModel[] = [
  // —— Pinned (main list) ——
  {
    id: RELAY_FREE_PRIMARY_MODEL,
    label: RELAY_25_FAST_LABEL,
    title: RELAY_25_FAST_LABEL,
    description: 'Work4You house model on the Free plan — fast, tool-capable, 1M context.',
    contextWindow: 1_000_000,
    version: 'fast',
    defaultOn: true,
    section: 'pinned'
  },
  {
    id: 'openrouter/auto',
    label: 'Auto',
    title: 'Auto',
    description: 'Automatically picks the best model for each request.',
    contextWindow: 1_000_000,
    defaultOn: true,
    section: 'pinned'
  },
  {
    id: 'x-ai/grok-4.5',
    label: 'Grok 4.5',
    title: 'Grok 4.5',
    description: "SpaceXAI's smartest model with frontier performance on coding, knowledge work, and STEM.",
    contextWindow: 500_000,
    version: 'highEffort',
    defaultOn: true,
    section: 'pinned'
  },
  {
    id: 'anthropic/claude-opus-5',
    label: 'Opus 5',
    title: 'Claude Opus 5',
    description: "Anthropic's large model class, great for difficult tasks.",
    contextWindow: 1_000_000,
    version: 'highEffort',
    defaultOn: true,
    section: 'pinned'
  },
  {
    id: 'openai/gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    title: 'GPT-5.6 Sol',
    description: 'Flagship GPT-5.6 for complex reasoning, coding, and agentic work.',
    contextWindow: 1_050_000,
    version: 'highEffort',
    defaultOn: true,
    section: 'pinned'
  },
  {
    id: 'anthropic/claude-fable-5',
    label: 'Fable 5',
    title: 'Claude Fable 5',
    description: 'Mythos-class model for autonomous knowledge work and long-running coding.',
    contextWindow: 1_000_000,
    version: 'highEffort',
    defaultOn: true,
    section: 'pinned'
  },
  {
    id: 'anthropic/claude-sonnet-5',
    label: 'Sonnet 5',
    title: 'Claude Sonnet 5',
    description: "Anthropic's most capable Sonnet-class model for coding, agents, and professional work.",
    contextWindow: 1_000_000,
    version: 'highEffort',
    defaultOn: true,
    section: 'pinned'
  },
  {
    id: 'openai/gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    title: 'GPT-5.6 Terra',
    description: 'Balanced GPT-5.6 between flagship Sol and cost-efficient Luna.',
    contextWindow: 1_050_000,
    version: 'highEffort',
    defaultOn: true,
    section: 'pinned'
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Sonnet 4.6',
    title: 'Claude Sonnet 4.6',
    description: 'Capable Sonnet-class model for coding, agents, and professional work.',
    contextWindow: 1_000_000,
    version: 'highEffort',
    defaultOn: true,
    section: 'pinned'
  },
  {
    id: 'anthropic/claude-opus-4.8',
    label: 'Opus 4.8',
    title: 'Claude Opus 4.8',
    description: "Anthropic's most capable Opus-family model for demanding agentic work.",
    contextWindow: 1_000_000,
    version: 'highEffort',
    defaultOn: false,
    section: 'pinned'
  },
  {
    id: 'openai/gpt-5.5',
    label: 'GPT-5.5',
    title: 'GPT-5.5',
    description: 'Frontier model for complex professional workloads with strong reasoning.',
    contextWindow: 1_050_000,
    version: 'highEffort',
    defaultOn: false,
    section: 'pinned'
  },
  {
    id: 'openai/gpt-5.3-codex',
    label: 'Codex 5.3',
    title: 'GPT-5.3 Codex',
    description: "OpenAI's advanced agentic coding model for software engineering.",
    contextWindow: 400_000,
    version: 'highEffort',
    defaultOn: false,
    section: 'pinned'
  },

  // —— More… (same screen expand) ——
  {
    id: 'anthropic/claude-opus-4.7',
    label: 'Opus 4.7',
    title: 'Claude Opus 4.7',
    description: 'Next-generation Opus for long-running, asynchronous agents.',
    contextWindow: 1_000_000,
    version: 'highEffort',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'openai/gpt-5.4',
    label: 'GPT-5.4',
    title: 'GPT-5.4',
    description: 'Frontier model unifying Codex and GPT lines with a large context window.',
    contextWindow: 1_050_000,
    version: 'highEffort',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'anthropic/claude-opus-4.6',
    label: 'Opus 4.6',
    title: 'Claude Opus 4.6',
    description: 'Strong Opus for coding and long-running professional tasks.',
    contextWindow: 1_000_000,
    version: 'highEffort',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'anthropic/claude-opus-4.5',
    label: 'Opus 4.5',
    title: 'Claude Opus 4.5',
    description: 'Frontier reasoning model optimized for complex software engineering.',
    contextWindow: 200_000,
    version: 'highEffort',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'openai/gpt-5.2',
    label: 'GPT-5.2',
    title: 'GPT-5.2',
    description: 'Frontier-grade GPT-5 series model with strong agentic and long-context performance.',
    contextWindow: 400_000,
    version: 'highEffort',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'openai/gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    title: 'GPT-5.6 Luna',
    description: 'Fast, cost-efficient GPT-5.6 for high-volume, latency-sensitive work.',
    contextWindow: 1_050_000,
    version: 'fast',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'google/gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    title: 'Gemini 3.6 Flash',
    description: 'High-efficiency Google model for coding, agents, and app development.',
    contextWindow: 1_048_576,
    version: 'fast',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    title: 'Gemini 3.1 Pro',
    description: "Google's frontier reasoning model with strong software engineering performance.",
    contextWindow: 1_048_576,
    version: 'highEffort',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'openai/gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    title: 'GPT-5.4 Mini',
    description: 'Faster, efficient GPT-5.4 for high-throughput workloads.',
    contextWindow: 400_000,
    version: 'fast',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'openai/gpt-5.4-nano',
    label: 'GPT-5.4 Nano',
    title: 'GPT-5.4 Nano',
    description: 'Lightest GPT-5.4 variant, optimized for speed-critical tasks.',
    contextWindow: 400_000,
    version: 'fast',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    label: 'Haiku 4.5',
    title: 'Claude Haiku 4.5',
    description: "Anthropic's fastest efficient model with near-frontier intelligence.",
    contextWindow: 200_000,
    version: 'fast',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    label: 'Sonnet 4.5',
    title: 'Claude Sonnet 4.5',
    description: 'Advanced Sonnet optimized for real-world agents and coding workflows.',
    contextWindow: 1_000_000,
    version: 'highEffort',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'openai/gpt-5.1',
    label: 'GPT-5.1',
    title: 'GPT-5.1',
    description: 'Frontier-grade GPT-5 series model with strong general-purpose reasoning.',
    contextWindow: 400_000,
    version: 'highEffort',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'google/gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    title: 'Gemini 3 Flash',
    description: 'High-speed thinking model for agentic workflows and multi-turn chat.',
    contextWindow: 1_048_576,
    version: 'fast',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'google/gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    title: 'Gemini 3.5 Flash',
    description: "Google's high-efficiency multimodal model with near-Pro coding and reasoning.",
    contextWindow: 1_048_576,
    version: 'fast',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'anthropic/claude-sonnet-4',
    label: 'Sonnet 4',
    title: 'Claude Sonnet 4',
    description: 'Strong Sonnet for coding and reasoning workloads.',
    contextWindow: 1_000_000,
    version: 'highEffort',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'openai/gpt-5-mini',
    label: 'GPT-5 Mini',
    title: 'GPT-5 Mini',
    description: 'Compact GPT-5 for lighter-weight reasoning tasks.',
    contextWindow: 400_000,
    version: 'fast',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    title: 'Gemini 2.5 Flash',
    description: "Google's workhorse model for advanced reasoning, coding, and multimodal tasks.",
    contextWindow: 1_048_576,
    version: 'fast',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'moonshotai/kimi-k2.7-code',
    label: 'Kimi K2.7 Code',
    title: 'Kimi K2.7 Code',
    description: 'Coding-focused Kimi K2 model for end-to-end programming tasks.',
    contextWindow: 262_144,
    version: 'highEffort',
    defaultOn: false,
    section: 'more'
  },
  {
    id: 'z-ai/glm-5.2',
    label: 'GLM 5.2',
    title: 'GLM 5.2',
    description: 'Large-scale reasoning model from Z.ai with a 1M-token context window.',
    contextWindow: 1_048_576,
    version: 'highEffort',
    defaultOn: false,
    section: 'more'
  }
]

/** Format token counts for hover cards (e.g. 1000000 → "1M", 500000 → "500k"). */
export function formatContextWindow(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return '—'
  }
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000
    return Number.isInteger(m) ? `${m}M` : `${parseFloat(m.toFixed(2))}M`
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`
  }
  return String(tokens)
}

export function featuredBySection(section: FeaturedModel['section']): FeaturedModel[] {
  return W4Y_FEATURED_MODELS.filter(m => m.section === section)
}

export function featuredDefaultOnIds(): string[] {
  return W4Y_FEATURED_MODELS.filter(m => m.defaultOn).map(m => m.id)
}

/** Short curated label for a catalog model id (never the provider name). */
export function featuredModelLabel(modelId: string): string | undefined {
  return W4Y_FEATURED_MODELS.find(entry => entry.id === modelId)?.label
}

/** How every picker renders a model id: curated label first, prettified id otherwise. */
export function modelLabel(modelId: string): string {
  if (isRelayFreeModel(modelId)) return RELAY_25_FAST_LABEL
  return featuredModelLabel(modelId) ?? displayModelName(modelId)
}

/** Resolve featured entries that exist in a live model id list. */
export function resolveFeaturedModels(
  availableIds: ReadonlySet<string> | readonly string[],
  opts?: { primaryOnly?: boolean; section?: FeaturedModel['section'] }
): FeaturedModel[] {
  const available = availableIds instanceof Set ? availableIds : new Set(availableIds)

  return W4Y_FEATURED_MODELS.filter(entry => {
    if (opts?.primaryOnly && entry.section !== 'pinned') {
      return false
    }
    if (opts?.section && entry.section !== opts.section) {
      return false
    }
    return available.has(entry.id)
  })
}
