import { atom } from 'nanostores'

import { getHermesConfigRecord, saveHermesConfig } from '@/hermes'

/** Cursor-style chat density — edits/terminal disclosure defaults only. */
export type ConversationDensity = 'compact' | 'balanced' | 'detailed'

const DENSITY_VALUES = new Set<ConversationDensity>(['compact', 'balanced', 'detailed'])

function normalizeDensity(raw: unknown): ConversationDensity {
  return typeof raw === 'string' && DENSITY_VALUES.has(raw as ConversationDensity)
    ? (raw as ConversationDensity)
    : 'balanced'
}

/**
 * Show model chain-of-thought blocks in the desktop thread.
 * Product default is ON (Cursor/Claude-like). Does not affect the working
 * status row, tool progress, or "Pensando…" activity UI.
 */
export const $showReasoning = atom<boolean>(true)

/** How aggressively file edits and terminal output expand inline in chat. */
export const $conversationDensity = atom<ConversationDensity>('balanced')

export interface ToolDisclosureDensityInput {
  hasInlineDiff: boolean
  isFileEdit: boolean
  isShellTool: boolean
}

export function toolDisclosureDefaultOpen(
  density: ConversationDensity,
  { hasInlineDiff, isFileEdit, isShellTool }: ToolDisclosureDensityInput
): boolean {
  switch (density) {
    case 'detailed':
      return hasInlineDiff || isFileEdit || isShellTool
    case 'balanced':
      return hasInlineDiff && !isShellTool
    default:
      return false
  }
}

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

export function applyConversationDensityFromConfig(
  config: { display?: { conversation_density?: unknown } | null } | null | undefined
) {
  $conversationDensity.set(normalizeDensity(config?.display?.conversation_density))
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

export async function setConversationDensity(density: ConversationDensity): Promise<void> {
  const previous = $conversationDensity.get()

  if (previous === density) {
    return
  }

  $conversationDensity.set(density)

  try {
    const record = await getHermesConfigRecord()
    const display =
      record.display && typeof record.display === 'object' ? (record.display as Record<string, unknown>) : {}

    await saveHermesConfig({ ...record, display: { ...display, conversation_density: density } })
  } catch (error) {
    $conversationDensity.set(previous)
    throw error
  }
}
