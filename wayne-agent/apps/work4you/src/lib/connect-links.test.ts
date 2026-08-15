import { describe, expect, it } from 'vitest'

import { extractConnectLinks, isConnectLinkUrl } from './connect-links'

describe('connect-links', () => {
  it('detects composio connect URLs', () => {
    expect(isConnectLinkUrl('https://connect.composio.dev/link/abc_123')).toBe(true)
    expect(isConnectLinkUrl('https://dashboard.composio.dev/link/xyz')).toBe(true)
    expect(isConnectLinkUrl('https://app.composio.dev/link/xyz')).toBe(true)
    expect(isConnectLinkUrl('https://example.com/link/xyz')).toBe(false)
  })

  it('extracts markdown and bare connect links from prose', () => {
    const { text, links } = extractConnectLinks(
      'Para conectar o Gmail:\n👉 [Authorize](https://connect.composio.dev/link/abc123)\n\nOu https://connect.composio.dev/link/def456'
    )
    expect(links).toEqual([
      'https://connect.composio.dev/link/abc123',
      'https://connect.composio.dev/link/def456'
    ])
    expect(text).not.toContain('composio.dev')
  })
})
