import { describe, expect, it } from 'vitest'

import { isInternalMcpServer, mergePreservingInternalMcp, withoutInternalMcp } from './mcp-internal'

describe('internal MCP (Composio) product filter', () => {
  it('treats composio as internal (case-insensitive)', () => {
    expect(isInternalMcpServer('composio')).toBe(true)
    expect(isInternalMcpServer('Composio')).toBe(true)
    expect(isInternalMcpServer(' my-server ')).toBe(false)
  })

  it('strips composio from the user-facing map', () => {
    expect(
      withoutInternalMcp({
        composio: { url: 'https://backend.composio.dev/tool' },
        'my-server': { command: 'npx' }
      })
    ).toEqual({ 'my-server': { command: 'npx' } })
  })

  it('re-merges composio on save so product edits cannot wipe connectors wiring', () => {
    const truth = {
      composio: { url: 'https://backend.composio.dev/tool', enabled: true },
      stale: { command: 'gone' }
    }
    const user = {
      'my-server': { command: 'npx' },
      composio: { url: 'https://evil.example' }
    }

    expect(mergePreservingInternalMcp(user, truth)).toEqual({
      'my-server': { command: 'npx' },
      composio: { url: 'https://backend.composio.dev/tool', enabled: true }
    })
  })
})
