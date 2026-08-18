import { afterEach, describe, expect, it, vi } from 'vitest'

import { executeDesktopBodyOp, fulfillDesktopBodyRequest } from './desktop-body'

describe('desktop body ops', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('paginates a local file read', async () => {
    vi.stubGlobal('window', {
      hermesDesktop: {
        readFileText: vi.fn(async () => ({
          path: 'C:/repo/a.txt',
          text: 'one\ntwo\nthree',
          byteSize: 13
        }))
      }
    })

    const result = await executeDesktopBodyOp('read_file', { path: 'C:/repo/a.txt', offset: 2, limit: 1 })
    expect(result.total_lines).toBe(3)
    expect(String(result.content)).toContain('two')
    expect(result.truncated).toBe(true)
  })

  it('writes via bodyWriteFile when present', async () => {
    const bodyWriteFile = vi.fn(async () => ({ path: 'C:/repo/n.txt', bytes_written: 5 }))
    vi.stubGlobal('window', { hermesDesktop: { bodyWriteFile } })

    const result = await executeDesktopBodyOp('write_file', { path: 'C:/repo/n.txt', content: 'hello' })
    expect(bodyWriteFile).toHaveBeenCalledWith('C:/repo/n.txt', 'hello')
    expect(result.status).toBe('ok')
  })

  it('replaces a string then writes', async () => {
    const bodyWriteFile = vi.fn(async (path: string) => ({ path, bytes_written: 4 }))
    vi.stubGlobal('window', {
      hermesDesktop: {
        bodyWriteFile,
        readFileText: vi.fn(async () => ({ path: 'C:/repo/a.txt', text: 'foo bar foo', byteSize: 11 }))
      }
    })

    await executeDesktopBodyOp('patch_replace', {
      path: 'C:/repo/a.txt',
      old_string: 'foo',
      new_string: 'baz',
      replace_all: true
    })
    expect(bodyWriteFile).toHaveBeenCalledWith('C:/repo/a.txt', 'baz bar baz')
  })

  it('runs a terminal command in the open folder', async () => {
    const bodyExec = vi.fn(async () => ({ output: 'ok\n', exit_code: 0 }))
    vi.stubGlobal('window', { hermesDesktop: { bodyExec } })

    const result = await executeDesktopBodyOp('terminal', {
      command: 'git status',
      workdir: 'C:/repo',
      timeout: 30
    })
    expect(bodyExec).toHaveBeenCalledWith({ command: 'git status', cwd: 'C:/repo', timeoutMs: 30_000 })
    expect(result.exit_code).toBe(0)
  })

  it('always replies to the gateway', async () => {
    const request = vi.fn(async () => ({ resolved: true }))
    await fulfillDesktopBodyRequest({ request } as never, {
      request_id: 'r1',
      op: 'nope',
      args: {}
    })
    expect(request).toHaveBeenCalledWith(
      'desktop.body.respond',
      expect.objectContaining({ ok: false, request_id: 'r1' })
    )
  })
})
