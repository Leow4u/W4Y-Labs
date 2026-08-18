/**
 * F3: execute Fly-brain tool calls on the PC folder (Electron IPC).
 * The motor waits on desktop.body.respond — this must not throw out of the
 * event handler without a reply.
 */
import { readDesktopFileText, writeDesktopFileText } from '@/lib/desktop-fs'
import type { HermesGateway } from '@/hermes'

export type DesktopBodyOp = 'read_file' | 'write_file' | 'patch_replace' | 'terminal'

export interface DesktopBodyRequest {
  args?: Record<string, unknown>
  desktop_cwd?: string
  op?: string
  request_id?: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function asInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

export async function executeDesktopBodyOp(
  op: string,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const path = asString(args.path)
  if (op === 'read_file') {
    const file = await readDesktopFileText(path)
    const offset = Math.max(1, asInt(args.offset, 1))
    const limit = Math.max(1, asInt(args.limit, 500))
    const lines = (file.text || '').split(/\r?\n/)
    const page = lines.slice(offset - 1, offset - 1 + limit)
    const numbered = page.map((line, i) => `${String(offset + i).padStart(6, ' ')}|${line}`).join('\n')
    return {
      content: numbered,
      file_size: file.byteSize,
      path: file.path || path,
      total_lines: lines.length,
      truncated: offset - 1 + limit < lines.length
    }
  }

  if (op === 'write_file') {
    const content = asString(args.content)
    const desktop = window.hermesDesktop
    if (desktop?.bodyWriteFile) {
      const written = await desktop.bodyWriteFile(path, content)
      return { bytes_written: written.bytes_written ?? content.length, path: written.path, status: 'ok' }
    }
    const written = await writeDesktopFileText(path, content)
    return { bytes_written: content.length, path: written.path, status: 'ok' }
  }

  if (op === 'patch_replace') {
    const file = await readDesktopFileText(path)
    const oldString = asString(args.old_string)
    const newString = asString(args.new_string)
    const replaceAll = args.replace_all === true
    if (!oldString) {
      throw new Error('old_string is required')
    }
    const haystack = file.text || ''
    if (!haystack.includes(oldString)) {
      throw new Error('old_string not found in file')
    }
    const next = replaceAll ? haystack.split(oldString).join(newString) : haystack.replace(oldString, newString)
    const desktop = window.hermesDesktop
    if (desktop?.bodyWriteFile) {
      const written = await desktop.bodyWriteFile(path, next)
      return { path: written.path, status: 'ok' }
    }
    const written = await writeDesktopFileText(path, next)
    return { path: written.path, status: 'ok' }
  }

  if (op === 'terminal') {
    const command = asString(args.command)
    const cwd = asString(args.workdir || args.desktop_cwd)
    const timeoutSec = asInt(args.timeout, 120)
    const exec = window.hermesDesktop?.bodyExec
    if (!exec) {
      throw new Error('desktop exec is not available')
    }
    const result = await exec({ command, cwd, timeoutMs: timeoutSec * 1000 })
    return {
      error: result.error,
      exit_code: result.exit_code,
      output: result.output || '',
      status: result.exit_code === 0 ? 'ok' : 'error'
    }
  }

  throw new Error(`unsupported desktop body op: ${op}`)
}

export async function fulfillDesktopBodyRequest(
  gateway: HermesGateway | null,
  payload: DesktopBodyRequest
): Promise<void> {
  const requestId = asString(payload.request_id)
  if (!requestId || !gateway) {
    return
  }

  try {
    const result = await executeDesktopBodyOp(asString(payload.op), payload.args || {})
    await gateway.request('desktop.body.respond', { ok: true, request_id: requestId, result })
  } catch (err) {
    await gateway.request('desktop.body.respond', {
      error: err instanceof Error ? err.message : String(err),
      ok: false,
      request_id: requestId
    })
  }
}
