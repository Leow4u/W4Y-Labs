import { translateNow } from '@/i18n'

import { compactPreview, contextValue, isRecord, parseMaybeObject } from './format'
import type { ToolMeta, ToolTone } from './types'

/** Never surface vendor/server slugs in user-facing tool chrome. */
const HIDDEN_TOKENS = /\b(?:mcp|composio)\b/gi

const CONNECTOR_ACTION_RE =
  /manage_connection|connect_account|\boauth\b|authorize_connection|manage_connections/
const SEARCH_ACTION_RE = /search_tools|\bsearch\b|\bfind\b|\blookup\b|\bquery\b|\bgrep\b|\bglob\b/
const EXECUTE_ACTION_RE = /multi_execute|execute_tool|\bexecute\b|\brun\b|\binvoke\b/
const READ_ACTION_RE = /\bread\b|\bfetch\b|\blist\b|\bget\b|\bview\b|\bopen\b/
const WRITE_ACTION_RE = /\bwrite\b|\bcreate\b|\bupdate\b|\bsend\b|\bpost\b|\bdelete\b|\bremove\b/
const WEB_ACTION_RE = /browser|web|fetch|http|url|navigate|visit|download|request/

type McpCategory = 'connect' | 'search' | 'execute' | 'read' | 'write' | 'web' | 'generic'

interface McpCategorySpec {
  category: McpCategory
  icon: string
  tone: ToolTone
}

const CATEGORY_SPECS: { re: RegExp; spec: McpCategorySpec }[] = [
  { re: CONNECTOR_ACTION_RE, spec: { category: 'connect', icon: 'plug', tone: 'default' } },
  { re: EXECUTE_ACTION_RE, spec: { category: 'execute', icon: 'plug', tone: 'default' } },
  { re: SEARCH_ACTION_RE, spec: { category: 'search', icon: 'search', tone: 'web' } },
  { re: WRITE_ACTION_RE, spec: { category: 'write', icon: 'edit', tone: 'file' } },
  { re: READ_ACTION_RE, spec: { category: 'read', icon: 'file', tone: 'file' } },
  { re: WEB_ACTION_RE, spec: { category: 'web', icon: 'globe', tone: 'web' } }
]

export function isMcpToolName(name: string): boolean {
  return name.startsWith('mcp_')
}

/** Strip `mcp_<server>_` and redundant COMPOSIO_ prefixes for display parsing. */
export function mcpActionSegment(name: string): string {
  const withoutPrefix = name.replace(/^mcp_[^_]+_/i, '')

  return withoutPrefix.replace(/^COMPOSIO_/i, '')
}

function titleCaseWords(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function formatAppSlug(slug: string): string {
  return titleCaseWords(slug.replace(/[_-]+/g, ' '))
}

function detectCategory(name: string): McpCategorySpec {
  const lower = name.toLowerCase()
  const hit = CATEGORY_SPECS.find(entry => entry.re.test(lower))

  return hit?.spec ?? { category: 'generic', icon: 'tools', tone: 'default' }
}

function mcpCategoryLabels(category: McpCategory): Pick<ToolMeta, 'done' | 'pending' | 'pendingAction'> {
  return {
    done: translateNow(`assistant.tool.mcp.categories.${category}.done`),
    pending: translateNow(`assistant.tool.mcp.categories.${category}.pending`),
    pendingAction: translateNow(`assistant.tool.mcp.categories.${category}.pendingAction`)
  }
}

const SLUG_ARG_KEYS = ['tool_slug', 'tool_slugs', 'toolkit', 'toolkits', 'toolkit_slug', 'slug'] as const

function walkConnectorSlug(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()

    return trimmed && !HIDDEN_TOKENS.test(trimmed) ? formatAppSlug(trimmed.split('_')[0] ?? trimmed) : ''
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = walkConnectorSlug(item)

      if (hit) {
        return hit
      }
    }

    return ''
  }

  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (SLUG_ARG_KEYS.includes(key as (typeof SLUG_ARG_KEYS)[number])) {
        const hit = walkConnectorSlug(nested)

        if (hit) {
          return hit
        }
      }

      const hit = walkConnectorSlug(nested)

      if (hit) {
        return hit
      }
    }
  }

  return ''
}

const META_CONNECTOR_ACTIONS = /^(?:SEARCH_TOOLS|MULTI_EXECUTE(?:_TOOL)?|MANAGE_CONNECTIONS|EXECUTE_TOOL)$/i

export function mcpConnectorAppLabel(args: Record<string, unknown>, toolName: string): string {
  const fromArgs = walkConnectorSlug(args)

  if (fromArgs) {
    return fromArgs
  }

  const segment = mcpActionSegment(toolName)

  if (META_CONNECTOR_ACTIONS.test(segment)) {
    return ''
  }

  const appPrefix = /^([A-Z][A-Z0-9]+)_/.exec(segment)

  if (appPrefix) {
    return formatAppSlug(appPrefix[1]!)
  }

  const inherited = contextValue(args)

  if (inherited && !HIDDEN_TOKENS.test(inherited)) {
    return compactPreview(inherited.replace(HIDDEN_TOKENS, '').trim(), 48)
  }

  return ''
}

export function mcpToolMeta(name: string): ToolMeta | null {
  if (!isMcpToolName(name)) {
    return null
  }

  const spec = detectCategory(name)
  const labels = mcpCategoryLabels(spec.category)

  return {
    ...labels,
    icon: spec.icon,
    tone: spec.tone
  }
}

export function mcpToolTitleSuffix(
  toolName: string,
  args: Record<string, unknown>,
  pending: boolean
): string {
  const app = mcpConnectorAppLabel(args, toolName)

  if (app) {
    return app
  }

  const segment = mcpActionSegment(toolName)
  const cleaned = segment.replace(HIDDEN_TOKENS, '').trim()

  if (!cleaned) {
    return ''
  }

  const human = titleCaseWords(cleaned)

  return pending ? human : human
}

export function mcpTitleVerb(category: McpCategory, pending: boolean): string {
  if (pending) {
    return mcpCategoryLabels(category).pendingAction
  }

  switch (category) {
    case 'read':
      return translateNow('assistant.tool.actions.read')
    case 'execute':
    case 'write':
      return translateNow('assistant.tool.actions.ran')
    case 'search':
      return translateNow('assistant.tool.actions.searched')
    case 'connect':
      return translateNow('assistant.tool.mcp.connectDone')
    case 'web':
      return translateNow('assistant.tool.actions.opened')
    default:
      return mcpCategoryLabels(category).done.split(' ')[0] || translateNow('assistant.tool.actions.ran')
  }
}

export function mcpToolCategory(name: string): McpCategory {
  return detectCategory(name).category
}
