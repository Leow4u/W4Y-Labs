import { afterEach, describe, expect, it, vi } from 'vitest'

import { $connection } from '@/store/session'
import type { SessionInfo, SessionMessage } from '@/types/hermes'

import {
  artifactImageSrc,
  collectArtifactsForSession,
  mergeArtifactsAcrossSessions
} from './artifact-utils'

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    ended_at: null,
    id: 'session-1',
    input_tokens: 0,
    is_active: false,
    last_active: 1000,
    message_count: 1,
    model: null,
    output_tokens: 0,
    preview: null,
    source: null,
    started_at: 1000,
    title: 'Session',
    tool_call_count: 0,
    ...overrides
  }
}

describe('collectArtifactsForSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    $connection.set(null)
  })

  it('ignores bare https links cited in assistant prose', () => {
    const artifacts = collectArtifactsForSession(makeSession(), [
      {
        content: 'Reference: https://example.com/docs/getting-started',
        role: 'assistant',
        timestamp: 2000
      }
    ])

    expect(artifacts).toHaveLength(0)
  })

  it('indexes MEDIA: paths from assistant output', () => {
    const artifacts = collectArtifactsForSession(makeSession(), [
      {
        content: "MEDIA:/tmp/voice.mp3\n\nhere's the audio",
        role: 'assistant',
        timestamp: 2000
      }
    ])

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      kind: 'file',
      value: '/tmp/voice.mp3'
    })
  })

  it('indexes successful write_file tool results', () => {
    const artifacts = collectArtifactsForSession(makeSession({ id: 'session-write' }), [
      {
        content: JSON.stringify({
          success: true,
          path: '/workspace/report.pdf',
          resolved_path: '/workspace/report.pdf'
        }),
        role: 'tool',
        timestamp: 3000,
        tool_name: 'write_file'
      }
    ])

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      kind: 'file',
      value: '/workspace/report.pdf'
    })
  })

  it('indexes image_generate URLs from tool results', () => {
    const artifacts = collectArtifactsForSession(makeSession({ id: 'session-image' }), [
      {
        content: JSON.stringify({ success: true, image: 'https://cdn.example/cat.png' }),
        role: 'tool',
        timestamp: 3000,
        tool_call_id: 'img-1',
        tool_name: 'image_generate'
      }
    ])

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      href: 'https://cdn.example/cat.png',
      kind: 'image',
      value: 'https://cdn.example/cat.png'
    })
  })

  it('ignores read-only tool payloads such as search_files errors', () => {
    const artifacts = collectArtifactsForSession(makeSession({ id: 'session-search' }), [
      {
        content: JSON.stringify({ error: 'Path not found: /repo/.github', path: '/repo/.github' }),
        role: 'tool',
        timestamp: 3000,
        tool_name: 'search_files'
      }
    ])

    expect(artifacts).toHaveLength(0)
  })

  it('rejects junk path fragments from tool JSON walks', () => {
    const artifacts = collectArtifactsForSession(makeSession({ id: 'session-junk' }), [
      {
        content: JSON.stringify({
          success: true,
          path: 'dear.json\n\nThe',
          resolved_path: 'foo.replace(bar)'
        }),
        role: 'tool',
        timestamp: 3000,
        tool_name: 'write_file'
      }
    ])

    expect(artifacts).toHaveLength(0)
  })

  it('ignores generic source_url fields from non-output tools', () => {
    const artifacts = collectArtifactsForSession(makeSession({ id: 'session-2' }), [
      {
        content: JSON.stringify({ source_url: 'https://example.com/changelog/latest' }),
        role: 'tool',
        timestamp: 3000,
        tool_name: 'web_extract'
      }
    ])

    expect(artifacts).toHaveLength(0)
  })
})

describe('mergeArtifactsAcrossSessions', () => {
  it('dedupes the same artifact value across sessions', () => {
    const merged = mergeArtifactsAcrossSessions([
      {
        href: '/tmp/report.pdf',
        id: 's1:/tmp/report.pdf',
        kind: 'file',
        label: 'report.pdf',
        sessionId: 's1',
        sessionTitle: 'First',
        timestamp: 2000,
        value: '/tmp/report.pdf'
      },
      {
        href: '/tmp/report.pdf',
        id: 's2:/tmp/report.pdf',
        kind: 'file',
        label: 'report.pdf',
        sessionId: 's2',
        sessionTitle: 'Second',
        timestamp: 3000,
        value: '/tmp/report.pdf'
      }
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      sessionCount: 2,
      sessionId: 's2',
      sessionTitle: 'Second',
      timestamp: 3000,
      value: '/tmp/report.pdf'
    })
    expect(merged[0].relatedSessions).toEqual([
      { id: 's1', title: 'First' },
      { id: 's2', title: 'Second' }
    ])
  })
})

describe('artifactImageSrc', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    $connection.set(null)
  })

  it('resolves remote image artifact thumbnails through the desktop fs bridge', async () => {
    const api = vi.fn(async ({ path }: { path: string }) => {
      if (path.startsWith('/api/fs/read-data-url?')) {
        return { dataUrl: 'data:image/jpeg;base64,cmVtb3Rl' }
      }

      throw new Error(`unexpected path ${path}`)
    })

    vi.stubGlobal('window', { hermesDesktop: { api } })
    $connection.set({ baseUrl: 'https://gw', mode: 'remote', token: 'secret' } as never)

    const path = '/Users/me/.hermes/skills/work-esab/references/images/manual-step03.jpeg'
    const downloadHref = `https://gw/api/files/download?path=${encodeURIComponent(path)}&token=secret`

    await expect(artifactImageSrc(path, downloadHref)).resolves.toBe('data:image/jpeg;base64,cmVtb3Rl')

    expect(api).toHaveBeenCalledWith({
      path: '/api/fs/read-data-url?path=%2FUsers%2Fme%2F.hermes%2Fskills%2Fwork-esab%2Freferences%2Fimages%2Fmanual-step03.jpeg'
    })
  })
})
