/**
 * Context header inside the composer:
 * project · Local/Cloud · branch (left) …… Changes (right).
 * Git chips only mount when `$repoStatus` confirms a real repo — never paint
 * master/Limpo on a non-git folder. Commit & PR live in the Review pane.
 */
import { useStore } from '@nanostores/react'
import { type ComponentProps, useEffect } from 'react'

import { cn } from '@/lib/utils'
import { $repoStatus, refreshRepoStatus } from '@/store/coding-status'
import { $cloudProjectSlug } from '@/store/run-target'
import {
  $projectScope,
  $projectTree,
  ALL_PROJECTS,
  projectIdForCwd,
  projectWorkspacePath
} from '@/store/projects'
import { $currentBranch, $currentCwd, $activeSessionId, setCurrentCwd } from '@/store/session'

import { ProjectChip } from './project-chip'
import { RunTargetChip } from './run-target-chip'
import { CodingStatusRow } from './status-stack/coding-row'

type BranchProps = Omit<ComponentProps<typeof CodingStatusRow>, 'fallbackBranch' | 'variant'>

export function ComposerContextHeader({
  sessionId,
  branch
}: {
  sessionId?: null | string
  branch: BranchProps
}) {
  const scope = useStore($projectScope)
  const cloudSlug = useStore($cloudProjectSlug)
  const tree = useStore($projectTree)
  const repoStatus = useStore($repoStatus)
  const sessionBranch = useStore($currentBranch)
  const hasProject = scope !== ALL_PROJECTS || Boolean(cloudSlug.trim())
  // Git chrome only when the probe says we are in a repo. Forcing chips on
  // every project lied "master / Limpo" on non-git folders (Dutelog).
  const showGitChrome = Boolean(repoStatus)
  const fallbackBranch = (repoStatus?.branch || sessionBranch || '').trim()

  // Seed cwd + kick probe when a local project is scoped. Critical: if
  // `$currentCwd` is a stale unrelated path on a DRAFT (no live session),
  // Review/Changes would probe that tree while the user thinks they're in
  // the project. A live session's cwd is authoritative — never yank it to
  // the project root (worktrees / resumed chats write where the session says).
  useEffect(() => {
    if (cloudSlug.trim()) {
      return
    }

    // tree in deps: path may arrive after projects.tree refresh.
    void tree

    if (scope === ALL_PROJECTS) {
      const cwd = $currentCwd.get()?.trim()

      if (cwd) {
        void refreshRepoStatus(cwd)
      }

      return
    }

    const projectPath = projectWorkspacePath(scope)
    const cwd = $currentCwd.get()?.trim()
    const cwdBelongs = Boolean(cwd && projectIdForCwd(cwd) === scope)
    const liveSession = Boolean($activeSessionId.get())

    if (projectPath && !cwdBelongs && !liveSession) {
      setCurrentCwd(projectPath)
      void refreshRepoStatus(projectPath)

      return
    }

    if (cwd) {
      void refreshRepoStatus(cwd)
    } else if (projectPath && !liveSession) {
      setCurrentCwd(projectPath)
      void refreshRepoStatus(projectPath)
    }
  }, [scope, cloudSlug, tree])

  return (
    <div
      className={cn(
        'relative z-0 flex min-h-8 w-full flex-wrap items-center gap-0.5 bg-transparent px-2.5 pb-2 pt-1.5'
      )}
      data-slot="composer-context-header"
    >
      <ProjectChip variant="header" />
      {hasProject && <RunTargetChip sessionId={sessionId} />}
      {showGitChrome && (
        <CodingStatusRow
          {...branch}
          fallbackBranch={fallbackBranch}
          variant="chip"
        />
      )}
    </div>
  )
}
