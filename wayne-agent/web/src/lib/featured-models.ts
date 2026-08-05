/**
 * featured-models — curated model slugs for Config → Modelos (PR-8 C5).
 * Keeps the picker/toggles off the 1,047-model OpenRouter wall.
 */
export const FEATURED_MODEL_SLUGS = [
  "google/gemini-3.5-flash",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-4.8",
  "openai/gpt-4.1",
  "openai/gpt-4.1-mini",
  "deepseek/deepseek-chat-v3",
  "meta-llama/llama-4-maverick",
  "google/gemini-2.5-pro",
  "mistralai/mistral-large",
  "x-ai/grok-3",
  "qwen/qwen3-coder",
  "qwen/qwen3.7-flash",
  "openai/gpt-oss-20b",
] as const;

/** Subagent / explore delegation dropdown (Cursor parity). Empty = inherit. */
export const EXPLORE_SUBAGENT_SLUGS = [
  "google/gemini-3.5-flash",
  "anthropic/claude-sonnet-5",
  "deepseek/deepseek-chat-v3",
  "openai/gpt-4.1-mini",
  "meta-llama/llama-4-maverick",
] as const;

export const DEFAULT_FEATURED_ENABLED = FEATURED_MODEL_SLUGS.slice(0, 4);
