import { describe, expect, it } from 'vitest'

import { buildToolView } from './index'
import {
  isMcpToolName,
  mcpActionSegment,
  mcpConnectorAppLabel,
  mcpToolMeta
} from './mcp-labels'

describe('mcp tool labels', () => {
  it('detects mcp tool names', () => {
    expect(isMcpToolName('mcp_composio_COMPOSIO_SEARCH_TOOLS')).toBe(true)
    expect(isMcpToolName('terminal')).toBe(false)
  })

  it('strips vendor segments from action names', () => {
    expect(mcpActionSegment('mcp_composio_COMPOSIO_SEARCH_TOOLS')).toBe('SEARCH_TOOLS')
    expect(mcpActionSegment('mcp_composio_GMAIL_FETCH_EMAILS')).toBe('GMAIL_FETCH_EMAILS')
  })

  it('humanizes composio meta tools without vendor branding', () => {
    const meta = mcpToolMeta('mcp_composio_COMPOSIO_SEARCH_TOOLS')

    expect(meta?.pending).toBe('Finding app tools')
    expect(meta?.done).toBe('Found app tools')
    expect(meta?.pending).not.toMatch(/composio/i)
  })

  it('extracts connector app labels from args', () => {
    expect(mcpConnectorAppLabel({ toolkit: 'gmail' }, 'mcp_composio_COMPOSIO_MULTI_EXECUTE_TOOL')).toBe('Gmail')
    expect(mcpConnectorAppLabel({}, 'mcp_composio_GMAIL_FETCH_EMAILS')).toBe('Gmail')
  })
})

describe('buildToolView mcp tools', () => {
  const part = (overrides: Record<string, unknown>) => ({
    args: {},
    isError: false,
    result: undefined,
    toolCallId: 'tc-1',
    toolName: 'mcp_composio_COMPOSIO_SEARCH_TOOLS',
    type: 'tool-call' as const,
    ...overrides
  })

  it('never shows composio in the row title', () => {
    const pending = buildToolView(part({}), '')
    const done = buildToolView(part({ result: { ok: true } }), '')

    expect(pending.title).toBe('Finding app tools')
    expect(done.title).toBe('Found app tools')
    expect(pending.title.toLowerCase()).not.toContain('composio')
    expect(done.title.toLowerCase()).not.toContain('mcp')
  })

  it('shows the app name for multi-execute connector calls', () => {
    const view = buildToolView(
      part({
        args: { toolkit: 'gmail' },
        toolName: 'mcp_composio_COMPOSIO_MULTI_EXECUTE_TOOL'
      }),
      ''
    )

    expect(view.title).toBe('Running Gmail')
    expect(view.titleAction?.text).toBe('Running')
  })
})
