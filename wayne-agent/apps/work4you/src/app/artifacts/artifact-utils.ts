import { readDesktopFileDataUrl } from '@/lib/desktop-fs'
import { filePathFromMediaPath, isRemoteGateway, mediaExternalUrl } from '@/lib/media'
import type { SessionInfo, SessionMessage } from '@/types/hermes'

export type ArtifactKind = 'image' | 'file' | 'link'
export type ArtifactFilter = 'all' | ArtifactKind
export const ARTIFACT_FILTERS: readonly ArtifactFilter[] = ['all', 'image', 'file', 'link']

export interface ArtifactSessionRef {
  id: string
  title: string
}

export interface ArtifactRecord {
  id: string
  kind: ArtifactKind
  value: string
  href: string
  label: string
  sessionId: string
  sessionTitle: string
  timestamp: number
  sessionCount?: number
  relatedSessions?: ArtifactSessionRef[]
}

const MEDIA_TAG_RE = /[`"']?MEDIA:\s*(?<inline>`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)[`"']?/g
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif|heic|heif)(?:\?.*)?$/i
const FILE_EXT_RE =
  /\.(?:png|jpe?g|gif|webp|svg|bmp|avif|heic|heif|pdf|txt|json|md|csv|zip|tar|gz|mp3|wav|ogg|m4a|mp4|mov|webm|opus)(?:\?.*)?$/i
const JUNK_VALUE_RE =
  /[\n\r]|\bSTDOUT:|\bSTDERR:|\.replace\s*\(|function\s*\(|=>\s*\{|^\(\?\:|^\/[^/]+\/[gimsuy]*$|^\s*\(\?/
const MAX_ARTIFACT_VALUE_LENGTH = 512

/** Tools whose successful results represent agent-created outputs. */
const OUTPUT_TOOL_NAMES = new Set([
  'write_file',
  'patch',
  'edit_file',
  'image_generate',
  'video_generate',
  'skill_manage',
  'tts',
  'text_to_speech'
])

const WRITE_RESULT_PATH_KEYS = ['resolved_path', 'path', 'file_path', 'output_path', 'audio_path'] as const
const IMAGE_RESULT_KEYS = ['image', 'host_image', 'agent_visible_image', 'video'] as const
const LINK_RESULT_KEYS = ['download_url', 'published_url', 'url'] as const

function artifactSessionTitle(session: SessionInfo): string {
  return session.title?.trim() || session.preview?.trim() || 'Untitled session'
}

function normalizeValue(value: string): string {
  return value.trim().replace(/[),.;]+$/, '')
}

function normalizeArtifactKey(value: string): string {
  const normalized = normalizeValue(value)

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized)

      return `${url.origin}${url.pathname}`.toLowerCase()
    } catch {
      return normalized.toLowerCase()
    }
  }

  return normalized.replace(/\\/g, '/').toLowerCase()
}

function unquoteMediaPath(value: string): string {
  const trimmed = value.trim()
  const quote = trimmed[0]

  return quote && quote === trimmed.at(-1) && ['"', "'", '`'].includes(quote) ? trimmed.slice(1, -1) : trimmed
}

function parseMaybeJson(value: string): unknown {
  if (!value.trim()) {
    return null
  }

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function normalizeToolName(name: unknown): string {
  return typeof name === 'string' ? name.trim().toLowerCase() : ''
}

function looksLikePathOrUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) ||
    value.startsWith('file://') ||
    value.startsWith('data:image/') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('~/')
  )
}

function looksLikeArtifact(value: string): boolean {
  if (/^(?:https?:\/\/|data:image\/)/i.test(value)) {
    return true
  }

  if (looksLikePathOrUrl(value) && (IMAGE_EXT_RE.test(value) || FILE_EXT_RE.test(value))) {
    return true
  }

  return /^[A-Za-z]:[\\/]/.test(value) || (value.startsWith('/') && value.includes('.'))
}

function isValidArtifactValue(value: string): boolean {
  const normalized = normalizeValue(value)

  if (!normalized || normalized.length > MAX_ARTIFACT_VALUE_LENGTH) {
    return false
  }

  if (JUNK_VALUE_RE.test(normalized)) {
    return false
  }

  if (/^https?:\/\//i.test(normalized)) {
    try {
      new URL(normalized)

      return true
    } catch {
      return false
    }
  }

  if (normalized.startsWith('data:image/')) {
    return true
  }

  if (!looksLikePathOrUrl(normalized)) {
    return false
  }

  if (IMAGE_EXT_RE.test(normalized) || FILE_EXT_RE.test(normalized)) {
    return true
  }

  return /^[A-Za-z]:[\\/]/.test(normalized) || (normalized.startsWith('/') && normalized.includes('.'))
}

function artifactKind(value: string): ArtifactKind {
  if (value.startsWith('data:image/') || IMAGE_EXT_RE.test(value)) {
    return 'image'
  }

  if (
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('~/') ||
    value.startsWith('file://')
  ) {
    return 'file'
  }

  return 'link'
}

function artifactHref(value: string): string {
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) {
    return value
  }

  if (value.startsWith('file://') || looksLikePathOrUrl(value)) {
    return mediaExternalUrl(value)
  }

  return value
}

export async function artifactImageSrc(value: string, href = artifactHref(value)): Promise<string> {
  if (/^(?:https?|data):/i.test(value)) {
    return href
  }

  if (typeof window !== 'undefined' && window.hermesDesktop && isRemoteGateway()) {
    return readDesktopFileDataUrl(filePathFromMediaPath(value))
  }

  return href
}

function artifactLabel(value: string): string {
  try {
    const url = new URL(value)
    const item = url.pathname.split('/').filter(Boolean).pop()

    return item || value
  } catch {
    const parts = value.split(/[\\/]/).filter(Boolean)

    return parts.pop() || value
  }
}

function messageText(message: SessionMessage): string {
  if (typeof message.content === 'string' && message.content.trim()) {
    return message.content
  }

  if (typeof message.text === 'string' && message.text.trim()) {
    return message.text
  }

  if (typeof message.context === 'string' && message.context.trim()) {
    return message.context
  }

  return ''
}

function collectMediaFromText(text: string, pushValue: (value: string) => void): void {
  for (const match of text.matchAll(MEDIA_TAG_RE)) {
    const raw = match.groups?.inline || match[1] || ''

    if (raw) {
      pushValue(unquoteMediaPath(raw))
    }
  }
}

function toolResultSucceeded(payload: Record<string, unknown>): boolean {
  if (payload.success === false) {
    return false
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return false
  }

  return payload.success === true || !('error' in payload)
}

function pushStringField(value: unknown, pushValue: (value: string) => void): void {
  if (typeof value !== 'string') {
    return
  }

  const normalized = normalizeValue(value)

  if (normalized) {
    pushValue(normalized)
  }
}

function extractFromWriteResult(payload: Record<string, unknown>, pushValue: (value: string) => void): void {
  for (const key of WRITE_RESULT_PATH_KEYS) {
    pushStringField(payload[key], pushValue)
  }

  if (Array.isArray(payload.files_modified)) {
    for (const entry of payload.files_modified) {
      pushStringField(entry, pushValue)
    }
  }
}

function extractFromImageResult(payload: Record<string, unknown>, pushValue: (value: string) => void): void {
  for (const key of IMAGE_RESULT_KEYS) {
    pushStringField(payload[key], pushValue)
  }
}

function extractFromLinkResult(payload: Record<string, unknown>, pushValue: (value: string) => void): void {
  for (const key of LINK_RESULT_KEYS) {
    const value = payload[key]

    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
      pushValue(value)
    }
  }
}

function extractFromToolPayload(
  toolName: string,
  payload: Record<string, unknown>,
  pushValue: (value: string) => void
): void {
  if (!toolResultSucceeded(payload)) {
    return
  }

  if (toolName === 'image_generate') {
    extractFromImageResult(payload, pushValue)
    extractFromLinkResult(payload, pushValue)

    return
  }

  if (toolName === 'video_generate') {
    extractFromImageResult(payload, pushValue)
    extractFromLinkResult(payload, pushValue)

    return
  }

  if (toolName === 'write_file' || toolName === 'patch' || toolName === 'edit_file') {
    extractFromWriteResult(payload, pushValue)

    return
  }

  if (toolName === 'skill_manage') {
    extractFromWriteResult(payload, pushValue)

    return
  }

  if (toolName === 'tts' || toolName === 'text_to_speech') {
    extractFromWriteResult(payload, pushValue)

    if (typeof payload.media_tag === 'string') {
      collectMediaFromText(payload.media_tag, pushValue)
    }

    return
  }

  extractFromWriteResult(payload, pushValue)
  extractFromImageResult(payload, pushValue)
  extractFromLinkResult(payload, pushValue)
}

function collectArtifactsFromAssistantMessage(message: SessionMessage, pushValue: (value: string) => void): void {
  const text = messageText(message)

  if (!text) {
    return
  }

  collectMediaFromText(text, pushValue)
}

function collectArtifactsFromToolMessage(message: SessionMessage, pushValue: (value: string) => void): void {
  const toolName = normalizeToolName(message.tool_name || message.name)

  if (!toolName || !OUTPUT_TOOL_NAMES.has(toolName)) {
    return
  }

  const text = messageText(message)

  if (!text) {
    return
  }

  const parsed = parseMaybeJson(text)

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    extractFromToolPayload(toolName, parsed as Record<string, unknown>, pushValue)
  }

  collectMediaFromText(text, pushValue)
}

function collectArtifactsFromMessage(message: SessionMessage, pushValue: (value: string) => void): void {
  if (message.role === 'assistant') {
    collectArtifactsFromAssistantMessage(message, pushValue)

    return
  }

  if (message.role === 'tool') {
    collectArtifactsFromToolMessage(message, pushValue)
  }
}

export function collectArtifactsForSession(session: SessionInfo, messages: SessionMessage[]): ArtifactRecord[] {
  const found = new Map<string, ArtifactRecord>()
  const title = artifactSessionTitle(session)

  for (const message of messages) {
    collectArtifactsFromMessage(message, candidate => {
      const value = normalizeValue(candidate)

      if (!value || !isValidArtifactValue(value) || !looksLikeArtifact(value)) {
        return
      }

      const key = `${session.id}:${normalizeArtifactKey(value)}`

      if (found.has(key)) {
        return
      }

      found.set(key, {
        id: key,
        kind: artifactKind(value),
        value,
        href: artifactHref(value),
        label: artifactLabel(value),
        sessionId: session.id,
        sessionTitle: title,
        timestamp: message.timestamp || session.last_active || session.started_at || Date.now()
      })
    })
  }

  return Array.from(found.values())
}

export function mergeArtifactsAcrossSessions(records: readonly ArtifactRecord[]): ArtifactRecord[] {
  const merged = new Map<
    string,
    ArtifactRecord & {
      sessions: Map<string, string>
    }
  >()

  for (const record of records) {
    const key = normalizeArtifactKey(record.value)
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, {
        ...record,
        sessions: new Map([[record.sessionId, record.sessionTitle]])
      })

      continue
    }

    existing.sessions.set(record.sessionId, record.sessionTitle)

    if (record.timestamp > existing.timestamp) {
      existing.timestamp = record.timestamp
      existing.sessionId = record.sessionId
      existing.sessionTitle = record.sessionTitle
    }
  }

  return Array.from(merged.values()).map(({ sessions, ...record }) => {
    const sessionCount = sessions.size

    return {
      ...record,
      id: `artifact:${normalizeArtifactKey(record.value)}`,
      sessionCount: sessionCount > 1 ? sessionCount : undefined,
      relatedSessions:
        sessionCount > 1
          ? Array.from(sessions.entries()).map(([id, title]) => ({
              id,
              title
            }))
          : undefined
    }
  })
}
