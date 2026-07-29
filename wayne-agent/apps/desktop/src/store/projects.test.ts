import { beforeEach, describe, expect, it, vi } from 'vitest'

import { $sidebarAgentsGrouped } from '@/store/layout'

import {
  $activeProjectId,
  $projectScope,
  $projectsRpcAvailable,
  $projectTree,
  $scopedSessionIds,
  $worktreeRefreshToken,
  ALL_PROJECTS,
  createProject,
  enterProject,
  exitProjectScope,
  openOrCreateProjectFromFolder,
  openProjectCreate,
  pickProjectFolder,
  projectNameFromPath,
  refreshProjects,
  refreshWorktrees,
  sessionBelongsToProject
} from './projects'

vi.mock('@/i18n', () => ({
  translateNow: (key: string) => key
}))

vi.mock('@/store/notifications', () => ({
  notify: vi.fn()
}))

vi.mock('@/lib/desktop-fs', () => ({
  desktopDefaultCwd: vi.fn(),
  isDesktopFsRemoteMode: vi.fn(),
  selectDesktopPaths: vi.fn(),
  writeDesktopFileText: vi.fn()
}))

vi.mock('@/store/gateway', () => ({
  primaryBrainGateway: vi.fn(),
  ensureActiveGatewayOpen: vi.fn()
}))

const fs = await import('@/lib/desktop-fs')
const desktopDefaultCwd = vi.mocked(fs.desktopDefaultCwd)
const isDesktopFsRemoteMode = vi.mocked(fs.isDesktopFsRemoteMode)
const selectDesktopPaths = vi.mocked(fs.selectDesktopPaths)

const gw = await import('@/store/gateway')
const primaryBrainGateway = vi.mocked(gw.primaryBrainGateway)
const notifications = await import('@/store/notifications')
const notify = vi.mocked(notifications.notify)

describe('project scope', () => {
  beforeEach(() => {
    window.localStorage.clear()
    $projectScope.set(ALL_PROJECTS)
  })

  it('defaults to ALL_PROJECTS', () => {
    expect($projectScope.get()).toBe(ALL_PROJECTS)
  })

  it('enterProject scopes the sidebar to the project id', () => {
    // setActiveProject fires best-effort (no gateway in test → it rejects and is
    // swallowed); the synchronous scope change is what matters here.
    enterProject('p_123')
    expect($projectScope.get()).toBe('p_123')
  })

  it('exitProjectScope returns to the overview', () => {
    enterProject('p_123')
    exitProjectScope()
    expect($projectScope.get()).toBe(ALL_PROJECTS)
  })

  it('entering the synthetic No-project bucket still scopes (no active pin)', () => {
    enterProject('__no_project__')
    expect($projectScope.get()).toBe('__no_project__')
  })

  it('persists the scope to localStorage', () => {
    enterProject('p_abc')
    expect(window.localStorage.getItem('hermes.desktop.projectScope')).toBe('p_abc')
  })
})

describe('worktree refresh', () => {
  it('refreshWorktrees bumps the probe token so useRepoWorktreeMap refetches', () => {
    const before = $worktreeRefreshToken.get()
    refreshWorktrees()
    expect($worktreeRefreshToken.get()).toBe(before + 1)
  })
})

describe('pickProjectFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the remote-aware directory picker locally', async () => {
    isDesktopFsRemoteMode.mockReturnValue(false)
    selectDesktopPaths.mockResolvedValue(['/local/repo'])

    await expect(pickProjectFolder()).resolves.toBe('/local/repo')
    expect(selectDesktopPaths).toHaveBeenCalledWith({
      createDirectory: undefined,
      defaultPath: undefined,
      directories: true,
      multiple: false,
      title: undefined
    })
  })

  it('seeds the picker with the backend cwd on a remote gateway', async () => {
    isDesktopFsRemoteMode.mockReturnValue(true)
    desktopDefaultCwd.mockResolvedValue({ branch: 'main', cwd: '/backend/work' })
    selectDesktopPaths.mockResolvedValue(['/backend/work/repo'])

    await expect(pickProjectFolder()).resolves.toBe('/backend/work/repo')
    expect(selectDesktopPaths).toHaveBeenCalledWith({
      createDirectory: undefined,
      defaultPath: '/backend/work',
      directories: true,
      multiple: false,
      title: undefined
    })
  })

  it('returns null when the picker is cancelled (empty selection)', async () => {
    isDesktopFsRemoteMode.mockReturnValue(false)
    selectDesktopPaths.mockResolvedValue([])

    await expect(pickProjectFolder()).resolves.toBeNull()
  })
})

describe('projectNameFromPath', () => {
  it('uses the last path segment on Windows and POSIX paths', () => {
    expect(projectNameFromPath('C:\\DEV\\W4Y Labs')).toBe('W4Y Labs')
    expect(projectNameFromPath('/www/app')).toBe('app')
  })
})

describe('openOrCreateProjectFromFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    $projectScope.set(ALL_PROJECTS)
    $projectTree.set([])
    $projectsRpcAvailable.set(true)
  })

  it('enters an existing tree project when the folder already matches', async () => {
    isDesktopFsRemoteMode.mockReturnValue(false)
    selectDesktopPaths.mockResolvedValue(['/www/app'])
    $projectTree.set([
      {
        id: 'p_app',
        label: 'App',
        path: '/www/app',
        color: null,
        icon: null,
        isAuto: false,
        sessionCount: 0,
        lastActive: 0,
        previewSessions: [],
        repos: [{ id: '/www/app', path: '/www/app', label: 'app', sessionCount: 0, groups: [] }]
      }
    ])

    await expect(openOrCreateProjectFromFolder()).resolves.toBe('p_app')
    expect($projectScope.get()).toBe('p_app')
  })

  it('creates and enters a project when the folder is new', async () => {
    isDesktopFsRemoteMode.mockReturnValue(false)
    selectDesktopPaths.mockResolvedValue(['/srv/fresh'])

    const created = { folders: [], id: 'p_fresh', name: 'fresh', primary_path: '/srv/fresh' }
    const request = vi.fn(async (method: string) => {
      if (method === 'projects.create') {
        return { project: created }
      }

      return { active_id: 'p_fresh', projects: [created], scoped_session_ids: [] }
    })

    primaryBrainGateway.mockReturnValue({ connectionState: 'open', request } as never)

    await expect(openOrCreateProjectFromFolder()).resolves.toBe('p_fresh')
    expect(request).toHaveBeenCalledWith(
      'projects.create',
      expect.objectContaining({ folders: ['/srv/fresh'], name: 'fresh', use: true })
    )
    expect($projectScope.get()).toBe('p_fresh')
  })

  it('returns null when the picker is cancelled', async () => {
    selectDesktopPaths.mockResolvedValue([])
    await expect(openOrCreateProjectFromFolder()).resolves.toBeNull()
  })

  it('forwards createDirectory into the native picker for New folder', async () => {
    selectDesktopPaths.mockResolvedValue([])
    await openOrCreateProjectFromFolder({ createDirectory: true, title: 'New folder' })
    expect(selectDesktopPaths).toHaveBeenCalledWith(
      expect.objectContaining({ createDirectory: true, title: 'New folder' })
    )
  })
})

describe('createProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    $sidebarAgentsGrouped.set(false)
    $activeProjectId.set(null)
    $projectsRpcAvailable.set(null)
  })

  it('creates the project and flips into the grouped view so a blank slate shows it', async () => {
    const created = { folders: [], id: 'p_new', name: 'Demo', primary_path: '/srv/demo' }

    const request = vi.fn(async (method: string) => {
      if (method === 'projects.create') {
        return { project: created }
      }

      // Reconcile (fire-and-forget) re-reads list + tree; echo the project back
      // so the optimistic state survives instead of being wiped to empty.
      return { active_id: 'p_new', projects: [created], scoped_session_ids: [] }
    })

    primaryBrainGateway.mockReturnValue({ connectionState: 'open', request } as never)

    const result = await createProject({ folders: ['/srv/demo'], name: 'Demo', use: true })

    expect(result).toEqual(created)
    expect(request).toHaveBeenCalledWith('projects.create', expect.objectContaining({ name: 'Demo' }))
    expect($sidebarAgentsGrouped.get()).toBe(true)
    expect($activeProjectId.get()).toBe('p_new')
  })

  it('marks the backend stale and surfaces a friendly error when projects.create is missing', async () => {
    primaryBrainGateway.mockReturnValue({
      connectionState: 'open',
      request: vi.fn().mockRejectedValue(new Error('unknown method: projects.create'))
    } as never)

    await expect(createProject({ folders: ['/srv/demo'], name: 'Demo' })).rejects.toThrow(
      'sidebar.projects.staleBackend'
    )
    expect($projectsRpcAvailable.get()).toBe(false)
  })
})

describe('projects RPC capability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    $projectsRpcAvailable.set(null)
  })

  it('marks the backend stale when projects.list is missing', async () => {
    primaryBrainGateway.mockReturnValue({
      connectionState: 'open',
      request: vi.fn().mockRejectedValue(new Error('unknown method: projects.list'))
    } as never)

    await refreshProjects()

    expect($projectsRpcAvailable.get()).toBe(false)
  })

  it('blocks opening the create dialog once the backend is known stale', () => {
    $projectsRpcAvailable.set(false)

    openProjectCreate()

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'warning', message: 'sidebar.projects.staleBackend' })
    )
  })
})

describe('sessionBelongsToProject', () => {
  beforeEach(() => {
    $scopedSessionIds.set(new Set())
    $projectTree.set([])
  })

  it('treats scoped ids as project-bound', () => {
    $scopedSessionIds.set(new Set(['s1']))
    expect(sessionBelongsToProject({ id: 's1', cwd: null })).toBe(true)
    expect(sessionBelongsToProject({ id: 's2', cwd: null })).toBe(false)
  })

  it('treats detached sessions as unbound', () => {
    expect(sessionBelongsToProject({ id: 'loose', cwd: null })).toBe(false)
    expect(sessionBelongsToProject({ id: 'loose', cwd: '' })).toBe(false)
  })

  it('optimistically binds a cwd that matches the live tree', () => {
    $projectTree.set([
      {
        id: 'p_app',
        label: 'App',
        path: '/www/app',
        color: null,
        icon: null,
        isAuto: false,
        sessionCount: 0,
        lastActive: 0,
        previewSessions: [],
        repos: [{ id: '/www/app', path: '/www/app', label: 'app', sessionCount: 0, groups: [] }]
      }
    ])

    expect(sessionBelongsToProject({ id: 'fresh', cwd: '/www/app' })).toBe(true)
    expect(sessionBelongsToProject({ id: 'other', cwd: '/tmp/scratch' })).toBe(false)
  })
})
