import {
  buildToolView,
  countDiffLineStats,
  inlineDiffFromResult,
  isFileEditTool,
  stripInlineDiffChrome,
  toolPartDisclosureId,
  type ToolPart
} from '@/components/assistant-ui/tool/fallback-model'

export type TurnLayoutMode = 'ask' | 'agent'

export interface TurnFileHero {
  added: number
  basename: string
  disclosureId: string
  path: string
  removed: number
  toolCallId: string
}

export interface TurnDeliverySummary {
  added: number
  files: number
  removed: number
}

export interface ThreadTurnMessage {
  content?: readonly unknown[]
  id?: string
  parts?: readonly unknown[]
  role?: string
  status?: { type?: string }
}

function messageParts(message: ThreadTurnMessage): readonly unknown[] {
  if (Array.isArray(message.parts)) {
    return message.parts
  }

  if (message.role === 'assistant' && Array.isArray(message.content)) {
    return message.content
  }

  return []
}

function fileEditBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/').trim()

  return normalized.split('/').filter(Boolean).pop() || normalized
}

function asToolPart(part: unknown): ToolPart | null {
  if (!part || typeof part !== 'object') {
    return null
  }

  const row = part as Partial<ToolPart>

  if (row.type !== 'tool-call' || !row.toolName || !isFileEditTool(row.toolName)) {
    return null
  }

  return {
    args: row.args,
    isError: row.isError,
    result: row.result,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    type: 'tool-call'
  }
}

/** Stable scalar for useAuiState — encodes turn layout inputs without fresh objects. */
export function turnContractKey(
  messages: readonly ThreadTurnMessage[],
  indices: readonly number[],
  threadRunning: boolean
): string {
  let mode: TurnLayoutMode = 'ask'
  let running = false
  let toolCalls = 0
  const editTokens: string[] = []

  for (const index of indices) {
    const message = messages[index]

    if (!message || message.role !== 'assistant') {
      continue
    }

    if (message.status?.type === 'running') {
      running = true
    }

    const messageId = message.id ?? String(index)

    for (const part of messageParts(message)) {
      if (!part || typeof part !== 'object') {
        continue
      }

      const row = part as { type?: string; toolCallId?: string; toolName?: string; result?: unknown }

      if (row.type === 'tool-call') {
        mode = 'agent'
        toolCalls += 1

        const toolPart = asToolPart(part)

        if (toolPart) {
          editTokens.push(`${messageId}:${toolPart.toolCallId ?? ''}:${row.result !== undefined ? '1' : '0'}`)
        }
      }
    }
  }

  if (!running && threadRunning) {
    const lastIndex = indices[indices.length - 1]
    const last = messages[lastIndex]

    if (last?.role === 'assistant') {
      running = true
    }
  }

  return `${mode}|${running ? 1 : 0}|${toolCalls}|${editTokens.join(',')}`
}

export function turnLayoutModeFromKey(key: string): TurnLayoutMode {
  return key.startsWith('agent|') ? 'agent' : 'ask'
}

export interface TurnSurfaceSnapshot {
  delivery: TurnDeliverySummary
  heroes: TurnFileHero[]
  pendingEditIds: string[]
}

function collectPendingEditIds(messages: readonly ThreadTurnMessage[], indices: readonly number[]): string[] {
  const pending: string[] = []

  for (const index of indices) {
    const message = messages[index]

    if (!message || message.role !== 'assistant') {
      continue
    }

    for (const part of messageParts(message)) {
      const toolPart = asToolPart(part)

      if (!toolPart?.toolCallId || toolPart.result !== undefined) {
        continue
      }

      pending.push(toolPart.toolCallId)
    }
  }

  return pending
}

/** Stable JSON scalar for useAuiState — result-backed edits only; live stream diffs merged later. */
export function serializeTurnSurface(messages: readonly ThreadTurnMessage[], indices: readonly number[]): string {
  return JSON.stringify({
    delivery: buildTurnDelivery(messages, indices, {}),
    heroes: buildTurnFileHeroes(messages, indices, {}),
    pendingEditIds: collectPendingEditIds(messages, indices)
  } satisfies TurnSurfaceSnapshot)
}

export function mergeTurnSurface(
  messages: readonly ThreadTurnMessage[],
  indices: readonly number[],
  liveDiffs: Record<string, string>
): TurnSurfaceSnapshot {
  return {
    delivery: buildTurnDelivery(messages, indices, liveDiffs),
    heroes: buildTurnFileHeroes(messages, indices, liveDiffs),
    pendingEditIds: collectPendingEditIds(messages, indices)
  }
}

export function turnRunningFromKey(key: string): boolean {
  return key.split('|')[1] === '1'
}

function resolveInlineDiff(part: ToolPart, liveDiffs: Record<string, string>): string {
  const live = part.toolCallId ? liveDiffs[part.toolCallId] || '' : ''

  return stripInlineDiffChrome(live) || inlineDiffFromResult(part.result)
}

export function buildTurnDelivery(
  messages: readonly ThreadTurnMessage[],
  indices: readonly number[],
  liveDiffs: Record<string, string>
): TurnDeliverySummary {
  let files = 0
  let added = 0
  let removed = 0
  const seen = new Set<string>()

  for (const index of indices) {
    const message = messages[index]

    if (!message || message.role !== 'assistant') {
      continue
    }

    for (const part of messageParts(message)) {
      const toolPart = asToolPart(part)

      if (!toolPart?.toolCallId || seen.has(toolPart.toolCallId)) {
        continue
      }

      const inlineDiff = resolveInlineDiff(toolPart, liveDiffs)

      if (!inlineDiff) {
        continue
      }

      const stats = countDiffLineStats(inlineDiff)

      if (stats.added === 0 && stats.removed === 0) {
        continue
      }

      seen.add(toolPart.toolCallId)
      files += 1
      added += stats.added
      removed += stats.removed
    }
  }

  return { added, files, removed }
}

export function buildTurnFileHeroes(
  messages: readonly ThreadTurnMessage[],
  indices: readonly number[],
  liveDiffs: Record<string, string>
): TurnFileHero[] {
  const heroes: TurnFileHero[] = []
  const seenPaths = new Set<string>()

  for (const index of indices) {
    const message = messages[index]

    if (!message || message.role !== 'assistant') {
      continue
    }

    const messageId = message.id ?? String(index)

    for (const part of messageParts(message)) {
      const toolPart = asToolPart(part)

      if (!toolPart) {
        continue
      }

      const inlineDiff = resolveInlineDiff(toolPart, liveDiffs)

      if (!inlineDiff) {
        continue
      }

      const stats = countDiffLineStats(inlineDiff)

      if (stats.added === 0 && stats.removed === 0) {
        continue
      }

      const view = buildToolView(toolPart, inlineDiff)
      const path = view.subtitle.trim()

      if (!path || seenPaths.has(path)) {
        continue
      }

      seenPaths.add(path)
      heroes.push({
        added: stats.added,
        basename: fileEditBasename(path),
        disclosureId: `tool-entry:${messageId}:${toolPartDisclosureId(toolPart)}`,
        path,
        removed: stats.removed,
        toolCallId: toolPart.toolCallId ?? path
      })
    }
  }

  return heroes
}

/** @internal test helper */
export function __messagePartsForTests(message: ThreadTurnMessage): readonly unknown[] {
  return messageParts(message)
}
