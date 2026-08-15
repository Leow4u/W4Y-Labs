import { mcpToolCategory } from './mcp-labels'

/** Core Wayne tools that Cursor folds into "Explored N tools". */
const EXPLORATION_CORE_TOOLS = new Set([
  'read_file',
  'search_files',
  'skills_list',
  'skill_view',
  'web_search',
  'web_extract',
  'session_search'
])

export function isExplorationTool(toolName: string): boolean {
  if (EXPLORATION_CORE_TOOLS.has(toolName)) {
    return true
  }

  if (!toolName.startsWith('mcp_')) {
    return false
  }

  const category = mcpToolCategory(toolName)

  return category === 'search' || category === 'read'
}

export type ToolGroupKind = 'explored' | 'worked' | 'inline'

export function classifyToolGroup(toolNames: readonly string[]): ToolGroupKind {
  if (toolNames.length === 0) {
    return 'inline'
  }

  if (toolNames.every(isExplorationTool)) {
    return 'explored'
  }

  if (toolNames.length >= 2) {
    return 'worked'
  }

  return 'inline'
}

export function toolNamesInPartRange(
  parts: ReadonlyArray<{ type?: string; toolName?: string }>,
  startIndex: number,
  endIndex: number
): string[] {
  return parts
    .slice(Math.max(0, startIndex), endIndex + 1)
    .flatMap(part => (part?.type === 'tool-call' && part.toolName ? [part.toolName] : []))
}

type MessagePartSlice = { type?: string; text?: string; result?: unknown; status?: { type?: string } }

/** True between tool rounds while the model picks the next step (Cursor-style). */
export function messageIsPlanningNext(parts: readonly MessagePartSlice[], live: boolean): boolean {
  if (!live) {
    return false
  }

  const toolParts = parts.filter(part => part?.type === 'tool-call')

  if (toolParts.length === 0) {
    return false
  }

  if (toolParts.some(part => part.result === undefined)) {
    return false
  }

  const last = parts[parts.length - 1]

  if (!last) {
    return false
  }

  if (last.type === 'reasoning' && last.status?.type === 'running') {
    return false
  }

  if (last.type === 'text') {
    const text = typeof last.text === 'string' ? last.text.trim() : ''

    if (text.length > 0) {
      return false
    }
  }

  return last.type === 'tool-call' || (last.type === 'text' && toolParts.length > 0)
}
