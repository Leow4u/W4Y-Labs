/**
 * Work4You cloud projects client for Hermes desktop.
 * Uses work4youDesktop.cloud (login cookies) — same bridge as connectors.
 * Does not talk to the local Hermes projects.* RPC.
 */
import { Codecs, persistentAtom } from '@/lib/persisted'

export const PROJECTS_DIR = 'projects'
export const CLOUD_NOT_LOGGED_IN = 'cloud-not-logged-in'
export const CLOUD_UNAVAILABLE = 'cloud-unavailable'

/** Cloud computer managed root (Fly volume). ship-info / clone cwd base. */
export const CLOUD_FILES_ROOT = '/opt/data'

export type RunTarget = 'cloud' | 'local'

export interface CloudProjectFolder {
  path: string
  label: null | string
  is_primary: boolean
  added_at?: number
}

export interface CloudProjectRow {
  id: string
  slug: string
  name: string
  description: null | string
  icon: null | string
  color: null | string
  board_slug: null | string
  primary_path: null | string
  archived: boolean
  created_at: number
  folders: CloudProjectFolder[]
}

type CloudApiResult = {
  ok: boolean
  status?: number
  json?: unknown
  error?: string
}

type CloudBridge = {
  wsUrl: () => Promise<{ ok?: boolean; url?: string; error?: string }>
  api: (args: { method?: string; path: string; body?: unknown }) => Promise<CloudApiResult>
  canMutate?: () => Promise<boolean>
}

export function cloudBridge(): CloudBridge | null {
  if (typeof window === 'undefined') return null
  const c = window.work4youDesktop?.cloud
  return c && typeof c.wsUrl === 'function' && typeof c.api === 'function' ? c : null
}

export function cloudRunAvailable(): boolean {
  return cloudBridge() !== null
}

export async function mintCloudWsUrl(): Promise<string> {
  const c = cloudBridge()
  if (!c) throw new Error(CLOUD_UNAVAILABLE)
  const r = await c.wsUrl()
  if (!r?.ok || !r.url) {
    throw new Error(r?.error === 'not-logged-in' ? CLOUD_NOT_LOGGED_IN : CLOUD_UNAVAILABLE)
  }
  return r.url
}

/** true = logged in; false = needs sign-in; null = bridge/network trouble. */
export async function probeCloudLogin(): Promise<boolean | null> {
  try {
    await mintCloudWsUrl()
    return true
  } catch (e) {
    return e instanceof Error && e.message === CLOUD_NOT_LOGGED_IN ? false : null
  }
}

async function cloudRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const c = cloudBridge()
  if (!c) throw new Error(CLOUD_UNAVAILABLE)
  const res = await c.api({ method, path, body })
  if (!res?.ok) {
    if (res?.status === 401 || res?.error === 'not-logged-in') {
      throw new Error(CLOUD_NOT_LOGGED_IN)
    }
    throw new Error(res?.error || `cloud-http-${res?.status ?? 0}`)
  }
  return res.json as T
}

export function slugifyProject(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function prettifyProject(name: string): string {
  const s = name.replace(/[-_]+/g, ' ').trim()
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

export function projectCwd(root: string, slug: string): string {
  const base = root.endsWith('/') ? root.slice(0, -1) : root
  return `${base}/${PROJECTS_DIR}/${slug}`
}

export function cloudProjectCwd(slug: string): string {
  return projectCwd(CLOUD_FILES_ROOT, slug)
}

/** Windows-absolute or UNC — must never ship to cloud session.create. */
export const LOCAL_PATH_RE = /^(?:[A-Za-z]:[\\/]|\\\\)/

export function isLocalMachinePath(path: string): boolean {
  return LOCAL_PATH_RE.test(path.trim())
}

/** Strip PC paths when the brain is cloud (session.create contract). */
export function cwdForCloudSession(preferred?: null | string): string {
  const cwd = (preferred || '').trim()
  if (!cwd || isLocalMachinePath(cwd)) return ''
  return cwd
}

export async function listCloudProjects(): Promise<CloudProjectRow[]> {
  const res = await cloudRequest<{ projects: CloudProjectRow[] }>('GET', '/api/projects')
  return (res.projects ?? []).filter(p => !p.archived)
}

export async function createCloudProject(input: {
  name: string
  slug?: string
  folders?: string[]
  primary_path?: string
}): Promise<CloudProjectRow | null> {
  const res = await cloudRequest<{ project: CloudProjectRow | null; created?: boolean }>('POST', '/api/projects', input)
  return res.project ?? null
}

/** Relative to managed files root (same as web: `projects/<slug>`). */
export async function mkdirCloudProject(slug: string): Promise<void> {
  await cloudRequest('POST', '/api/files/mkdir', { path: `${PROJECTS_DIR}/${slug}` })
}

export async function mkdirCloud(path: string): Promise<void> {
  await cloudRequest('POST', '/api/files/mkdir', { path })
}

export async function registerCloudProjectRow(slug: string, displayName?: string): Promise<CloudProjectRow | null> {
  return createCloudProject({
    name: (displayName || '').trim() || prettifyProject(slug),
    slug,
    folders: [cloudProjectCwd(slug)]
  })
}

/** Prepare folder + project row for a cloud clone (best-effort register). */
export async function prepareCloudCloneProject(url: string): Promise<{ slug: string; name: string }> {
  const name = repoNameFromUrl(url)
  const slug = slugifyProject(name) || 'repo'
  await mkdirCloudProject(slug).catch(() => undefined)
  await registerCloudProjectRow(slug, name).catch(() => undefined)
  return { slug, name }
}

export async function cloudGhReady(path = CLOUD_FILES_ROOT): Promise<boolean> {
  try {
    const res = await cloudRequest<{ ghReady?: boolean }>(
      'GET',
      `/api/git/review/ship-info?path=${encodeURIComponent(path)}`
    )
    return Boolean(res.ghReady)
  } catch {
    return false
  }
}

export const GIT_URL_RE = /^(https?:\/\/|git@)[\w.@:\-~/]+$/i

export function repoNameFromUrl(url: string): string {
  const cleaned = url.trim().replace(/\.git$/i, '')
  const parts = cleaned.split(/[/:]/).filter(Boolean)
  return parts[parts.length - 1] || 'repo'
}

/** Preferred brain for the NEXT new session (composer control). */
export const $runTarget = persistentAtom<RunTarget>('hermes.desktop.runTarget', 'local', {
  decode: raw => (raw === 'cloud' ? 'cloud' : 'local'),
  encode: value => value
})

/**
 * Where the LIVE session runs. Settles on session.create; new-session resets
 * to follow $runTarget again.
 */
export const $sessionRunTarget = persistentAtom<RunTarget>('hermes.desktop.sessionRunTarget', 'local', {
  decode: raw => (raw === 'cloud' ? 'cloud' : 'local'),
  encode: value => value
})

/** Cloud project slug bound for the next/current cloud session (projects/<slug>). */
export const $cloudProjectSlug = persistentAtom<string>('hermes.desktop.cloudProjectSlug', '', Codecs.text)

export function setRunTarget(target: RunTarget): void {
  $runTarget.set(target)
}

export function setSessionRunTarget(target: RunTarget): void {
  $sessionRunTarget.set(target)
}

export function setCloudProjectSlug(slug: string): void {
  $cloudProjectSlug.set(slug.trim())
}

export function clearCloudProjectSlug(): void {
  $cloudProjectSlug.set('')
}
