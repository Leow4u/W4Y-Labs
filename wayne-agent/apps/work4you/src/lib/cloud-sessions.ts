/**
 * Tenant cloud session list — same REST surface as the browser app (Fly motor).
 * Desktop merges these rows into the sidebar when the Work4You account is signed in.
 */
import type { PaginatedSessions, SessionInfo, SessionMessagesResponse } from '@/types/hermes'

import { cloudBridge } from './w4y-cloud-projects'

export const CLOUD_BRAIN = 'cloud' as const
export type SessionBrain = typeof CLOUD_BRAIN | 'local'

export function tagCloudSessions(sessions: SessionInfo[]): SessionInfo[] {
  return sessions.map(row => ({
    ...row,
    _w4y_brain: CLOUD_BRAIN,
    profile: row.profile || 'default'
  }))
}

export function isCloudBrainSession(session: Pick<SessionInfo, '_w4y_brain'> | null | undefined): boolean {
  return session?._w4y_brain === CLOUD_BRAIN
}

function sessionsQuery(
  limit: number,
  minMessages: number,
  archived: 'exclude' | 'include' | 'only',
  order: 'created' | 'recent',
  filter: { source?: string; excludeSources?: string[] } = {}
): string {
  const sourceParam = filter.source ? `&source=${encodeURIComponent(filter.source)}` : ''
  const excludeParam = filter.excludeSources?.length
    ? `&exclude_sources=${encodeURIComponent(filter.excludeSources.join(','))}`
    : ''

  return (
    `/api/sessions?limit=${limit}&offset=0&min_messages=${Math.max(0, minMessages)}` +
    `&archived=${archived}&order=${order}${sourceParam}${excludeParam}`
  )
}

/** List sessions on the signed-in tenant (app.work4you.ai motor). */
export async function listCloudSessions(
  limit = 40,
  minMessages = 0,
  archived: 'exclude' | 'include' | 'only' = 'exclude',
  order: 'created' | 'recent' = 'recent',
  filter: { source?: string; excludeSources?: string[] } = {}
): Promise<PaginatedSessions> {
  const bridge = cloudBridge()
  if (!bridge) {
    return { sessions: [], total: 0, offset: 0, limit }
  }

  const res = await bridge.api({ method: 'GET', path: sessionsQuery(limit, minMessages, archived, order, filter) })
  if (!res.ok || !res.json || typeof res.json !== 'object') {
    return { sessions: [], total: 0, offset: 0, limit }
  }

  const data = res.json as PaginatedSessions
  const sessions = tagCloudSessions(Array.isArray(data.sessions) ? data.sessions.slice(0, limit) : [])

  return {
    ...data,
    sessions,
    offset: 0,
    limit,
    total: typeof data.total === 'number' ? data.total : sessions.length
  }
}

export async function getCloudSession(id: string): Promise<SessionInfo | null> {
  const bridge = cloudBridge()
  if (!bridge) {
    return null
  }

  const res = await bridge.api({ method: 'GET', path: `/api/sessions/${encodeURIComponent(id)}` })
  if (!res.ok || !res.json || typeof res.json !== 'object') {
    return null
  }

  return tagCloudSessions([res.json as SessionInfo])[0] ?? null
}

export async function getCloudSessionMessages(id: string): Promise<SessionMessagesResponse | null> {
  const bridge = cloudBridge()
  if (!bridge) {
    return null
  }

  const res = await bridge.api({
    method: 'GET',
    path: `/api/sessions/${encodeURIComponent(id)}/messages`
  })
  if (!res.ok || !res.json || typeof res.json !== 'object') {
    return null
  }

  return res.json as SessionMessagesResponse
}

export async function patchCloudSession(
  id: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean }> {
  const bridge = cloudBridge()
  if (!bridge) {
    return { ok: false }
  }

  const res = await bridge.api({
    method: 'PATCH',
    path: `/api/sessions/${encodeURIComponent(id)}`,
    body
  })

  return { ok: Boolean(res.ok) }
}

export async function deleteCloudSession(id: string): Promise<{ ok: boolean }> {
  const bridge = cloudBridge()
  if (!bridge) {
    return { ok: false }
  }

  const res = await bridge.api({
    method: 'DELETE',
    path: `/api/sessions/${encodeURIComponent(id)}`
  })

  return { ok: Boolean(res.ok) }
}

/** Merge cloud + local recents by last_active (newest first). */
export function mergeCloudAndLocalSessions(local: SessionInfo[], cloud: SessionInfo[]): SessionInfo[] {
  const byId = new Map<string, SessionInfo>()

  for (const row of local) {
    byId.set(row.id, row)
  }

  for (const row of cloud) {
    byId.set(row.id, row)
  }

  return [...byId.values()].sort((a, b) => (b.last_active || b.started_at) - (a.last_active || a.started_at))
}
