import { isAbsoluteFsPath } from '@/lib/fs-path'

import type { ToolPart } from './types'

export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function looksLikePath(value: string): boolean {
  const raw = value.trim()

  if (!raw) {
    return false
  }

  if (/^file:\/\//i.test(raw) || isAbsoluteFsPath(raw)) {
    return true
  }

  // Relative / bare project paths the agent commonly returns (landing.html,
  // ./dist/index.html, src\page.htm). POSIX-only `./` checks miss Windows.
  return /^(?:\.{1,2}[\\/]|~[\\/]).+/.test(raw) || /^[^\\/:*?"<>|\r\n]+(?:[\\/][^\\/:*?"<>|\r\n]+)+$/.test(raw)
}

export function isPreviewableTarget(target: string): boolean {
  const raw = target?.trim()

  if (!raw) {
    return false
  }

  if (/^file:\/\//i.test(raw)) {
    return true
  }

  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(raw)) {
    return true
  }

  // Any .html / .htm path — absolute (POSIX/Windows), relative, or bare name.
  // Without this, Windows `C:\…\landing.html` and `landing.html` never reach
  // the preview stack (agent edits show in chat but Preview/Browser stay empty).
  const pathOnly = raw.split(/[?#]/, 1)[0] || raw

  return /\.html?$/i.test(pathOnly)
}

export function stableHash(value: string): string {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index)
  }

  return Math.abs(hash).toString(36)
}

export function toolPartDisclosureId(part: ToolPart): string {
  if (part.toolCallId) {
    return `tool:${part.toolCallId}`
  }

  return `tool:${part.toolName}:${stableHash(JSON.stringify(part.args ?? ''))}`
}

export function toolGroupDisclosureId(parts: ToolPart[]): string {
  return `tool-group:${parts.map(toolPartDisclosureId).join('|')}`
}

export const URL_PATTERN = /https?:\/\/[^\s'"<>)\]]+/i

export function findFirstUrl(...sources: unknown[]): string {
  for (const src of sources) {
    if (typeof src === 'string') {
      const m = src.match(URL_PATTERN)

      if (m) {
        return m[0]
      }
    } else if (src && typeof src === 'object') {
      for (const v of Object.values(src as Record<string, unknown>)) {
        const found = findFirstUrl(v)

        if (found) {
          return found
        }
      }
    }
  }

  return ''
}

export function hostnameOf(value: string): string {
  try {
    const url = new URL(value)

    return `${url.hostname}${url.pathname && url.pathname !== '/' ? url.pathname : ''}`
  } catch {
    return value
  }
}
