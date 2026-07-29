import { atom } from 'nanostores'

import { getHermesConfigRecord, saveHermesConfig } from '@/hermes'

/**
 * Show model chain-of-thought blocks in the desktop thread.
 * Product default is ON (Cursor/Claude-like). Does not affect the working
 * status row, tool progress, or "Pensando…" activity UI.
 */
export const $showReasoning = atom<boolean>(true)

/** Seed from loaded config. Missing key → desktop default ON. */
export function applyShowReasoningFromConfig(
  config: { display?: { show_reasoning?: unknown } | null } | null | undefined
) {
  const raw = config?.display?.show_reasoning

  if (raw === undefined || raw === null) {
    $showReasoning.set(true)
    return
  }

  $showReasoning.set(Boolean(raw))
}

/**
 * Flip and persist `display.show_reasoning`. Optimistic — reverts on save failure.
 */
export async function setShowReasoning(enabled: boolean): Promise<void> {
  const previous = $showReasoning.get()

  if (previous === enabled) {
    return
  }

  $showReasoning.set(enabled)

  try {
    const record = await getHermesConfigRecord()
    const display =
      record.display && typeof record.display === 'object' ? (record.display as Record<string, unknown>) : {}

    await saveHermesConfig({ ...record, display: { ...display, show_reasoning: enabled } })
  } catch (error) {
    $showReasoning.set(previous)
    throw error
  }
}
