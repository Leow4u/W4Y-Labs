import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HermesReviewFile } from '@/global'

import {
  activeRepoCwd,
  changesChipKind,
  isActiveRepoCwd,
  summarizeReviewChanges
} from './active-repo'
import { $projectScope, $projectTree, ALL_PROJECTS, enterProject } from './projects'
import {
  $reviewFiles,
  $reviewIsRepo,
  $reviewLoading,
  refreshReview
} from './review'
import { $currentCwd, $activeSessionId, setCurrentCwd } from './session'

function stubReviewList(impl: (...args: unknown[]) => Promise<{ files: HermesReviewFile[]; isRepo: boolean }>) {
  ;(window as unknown as { hermesDesktop?: unknown }).hermesDesktop = {
    git: {
      review: {
        list: impl,
        diff: async () => '',
        shipInfo: async () => ({ ghReady: false, pr: null })
      },
      repoStatus: async () => null
    }
  }
}

describe('activeRepoCwd', () => {
  beforeEach(() => {
    setCurrentCwd('')
  })

  it('reads the live $currentCwd (trimmed)', () => {
    setCurrentCwd('  C:\\DEV\\demo  ')
    expect(activeRepoCwd()).toBe('C:\\DEV\\demo')
  })

  it('is null when cwd is empty', () => {
    setCurrentCwd('   ')
    expect(activeRepoCwd()).toBeNull()
  })

  it('compares repo paths without slash/case noise', () => {
    setCurrentCwd('C:\\DEV\\Demo')
    expect(isActiveRepoCwd('c:/DEV/Demo')).toBe(true)
    expect(isActiveRepoCwd('C:\\other')).toBe(false)
  })
})

describe('enterProject attachCwd → activeRepoCwd', () => {
  beforeEach(() => {
    window.localStorage.clear()
    $projectScope.set(ALL_PROJECTS)
    $activeSessionId.set(null)
    setCurrentCwd('')
    $projectTree.set([
      {
        id: 'p_app',
        label: 'App',
        path: 'C:\\work\\app',
        color: null,
        icon: null,
        isAuto: false,
        sessionCount: 0,
        lastActive: 0,
        previewSessions: [],
        repos: [
          {
            id: 'C:\\work\\app',
            path: 'C:\\work\\app',
            label: 'app',
            sessionCount: 0,
            groups: [{ id: 'C:\\work\\app-feature', path: 'C:\\work\\app-feature', label: 'feature', sessions: [] }]
          }
        ]
      }
    ])
  })

  it('sets activeRepoCwd to the project root when cwd is empty/stale', () => {
    setCurrentCwd('C:\\Users\\someone\\unrelated')
    enterProject('p_app', { attachCwd: true })
    expect($projectScope.get()).toBe('p_app')
    expect(activeRepoCwd()).toBe('C:\\work\\app')
  })

  it('does NOT yank an in-project worktree cwd back to the project root', () => {
    setCurrentCwd('C:\\work\\app-feature')
    enterProject('p_app', { attachCwd: true })
    expect(activeRepoCwd()).toBe('C:\\work\\app-feature')
  })

  it('does NOT overwrite a live session cwd (agent writes there)', () => {
    $activeSessionId.set('sess_live')
    setCurrentCwd('C:\\Users\\someone\\unrelated')
    enterProject('p_app', { attachCwd: true })
    expect(activeRepoCwd()).toBe('C:\\Users\\someone\\unrelated')
    $activeSessionId.set(null)
  })

  it('leaves cwd alone when attachCwd is omitted', () => {
    setCurrentCwd('C:\\Users\\someone\\unrelated')
    enterProject('p_app')
    expect(activeRepoCwd()).toBe('C:\\Users\\someone\\unrelated')
  })
})

describe('refreshReview wiring', () => {
  beforeEach(() => {
    $reviewFiles.set([])
    $reviewIsRepo.set(true)
    $reviewLoading.set(false)
    setCurrentCwd('')
    delete (window as unknown as { hermesDesktop?: unknown }).hermesDesktop
  })

  afterEach(() => {
    delete (window as unknown as { hermesDesktop?: unknown }).hermesDesktop
  })

  it('with a repo cwd, populates $reviewFiles from the git bridge', async () => {
    const files: HermesReviewFile[] = [
      { path: 'a.ts', added: 3, removed: 1, status: 'M', staged: false },
      { path: 'b.ts', added: 2, removed: 0, status: '?', staged: false }
    ]
    const list = vi.fn(async () => ({ files, base: null, isRepo: true }))
    stubReviewList(list)
    setCurrentCwd('C:\\work\\app')

    await refreshReview()

    expect(list).toHaveBeenCalledWith('C:\\work\\app', 'uncommitted', null)
    expect($reviewFiles.get()).toEqual(files)
    expect($reviewIsRepo.get()).toBe(true)
    expect($reviewLoading.get()).toBe(false)
  })

  it('clears files and marks not-a-repo when activeRepoCwd is empty', async () => {
    stubReviewList(async () => ({
      files: [{ path: 'ghost.ts', added: 1, removed: 0, status: 'M', staged: false }],
      isRepo: true
    }))
    setCurrentCwd('')
    $reviewFiles.set([{ path: 'stale.ts', added: 1, removed: 0, status: 'M', staged: false }])

    await refreshReview()

    expect($reviewFiles.get()).toEqual([])
    expect($reviewIsRepo.get()).toBe(false)
  })
})

describe('Changes chip derives from $reviewFiles (same state as Review pane)', () => {
  it('summarizeReviewChanges matches the Review file list', () => {
    const files: HermesReviewFile[] = [
      { path: 'a.ts', added: 3, removed: 1, status: 'M', staged: false },
      { path: 'new.ts', added: 0, removed: 0, status: '?', staged: false }
    ]
    const summary = summarizeReviewChanges(files)
    expect(summary).toEqual({ fileCount: 2, added: 3, removed: 1, hasChanges: true })
    expect(changesChipKind(summary)).toBe('diffCount')
  })

  it('empty Review list → clean chip (not a parallel repoStatus story)', () => {
    expect(changesChipKind(summarizeReviewChanges([]))).toBe('clean')
  })

  it('loading with no files yet → loading; dirty list wins over loading', () => {
    expect(changesChipKind(summarizeReviewChanges([]), { loading: true })).toBe('loading')
    expect(
      changesChipKind(summarizeReviewChanges([{ path: 'a.ts', added: 1, removed: 0, status: 'M', staged: false }]), {
        loading: true
      })
    ).toBe('diffCount')
  })

  it('untracked-only (0/0 deltas) still shows dirty, not Limpo', () => {
    expect(
      changesChipKind(
        summarizeReviewChanges([{ path: 'new.ts', added: 0, removed: 0, status: '?', staged: false }])
      )
    ).toBe('untracked')
  })
})
