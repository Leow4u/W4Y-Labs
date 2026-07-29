import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { $repoStatus } from '@/store/coding-status'
import { notifyError } from '@/store/notifications'
import { newSessionInProfile } from '@/store/profile'
import { switchBranchInRepo } from '@/store/projects'
import { $currentCwd } from '@/store/session'

import { countLabel, SidebarRowStack } from '../chrome'
import { SidebarLoadMoreRow } from '../load-more-row'

import { SIDEBAR_GROUP_PAGE, useWorkspaceNodeOpen } from './model'
import { baseName, type SidebarSessionGroup } from './workspace-groups'
import { WorkspaceAddButton, WorkspaceHeader, WorkspaceMenu, WorkspaceShowMoreButton } from './workspace-header'

function samePath(a: null | string | undefined, b: null | string | undefined): boolean {
  const left = (a ?? '').replace(/[/\\]+$/, '').toLowerCase()
  const right = (b ?? '').replace(/[/\\]+$/, '').toLowerCase()

  return Boolean(left && right && left === right)
}

interface SidebarWorkspaceGroupProps {
  group: SidebarSessionGroup
  renderRows: (sessions: SessionInfo[]) => React.ReactNode
  onNewSession?: (path: null | string) => void
  // When set (linked worktree rows), shows a remove affordance that runs a real
  // `git worktree remove`.
  onRemove?: () => void
  // True when other lanes in the same repo already have sessions. Softens the
  // empty-lane copy so a quiet home checkout doesn't scream "no sessions yet"
  // while worktrees elsewhere are busy.
  hasSiblingSessions?: boolean
}

export function SidebarWorkspaceGroup({
  group,
  renderRows,
  onNewSession,
  onRemove,
  hasSiblingSessions = false
}: SidebarWorkspaceGroupProps) {
  const { t } = useI18n()
  const s = t.sidebar
  const p = s.projects
  const isProfileGroup = group.mode === 'profile'
  const repoStatus = useStore($repoStatus)
  const currentCwd = useStore($currentCwd)
  // Empty worktree/branch lanes start collapsed — especially the home lane when
  // the project has sessions elsewhere. Profile lanes and lanes that already
  // hold sessions default open.
  const defaultOpen = isProfileGroup || group.sessions.length > 0
  const [open, toggleOpen] = useWorkspaceNodeOpen(group.id, defaultOpen)
  const [visibleCount, setVisibleCount] = useState(SIDEBAR_GROUP_PAGE)

  const loadedCount = group.sessions.length
  const folderLabel = group.path ? baseName(group.path) : undefined
  const activeLaneDiff =
    !isProfileGroup && samePath(group.path, currentCwd) && repoStatus
      ? { added: repoStatus.added, removed: repoStatus.removed }
      : null
  const hoverCard =
    !isProfileGroup && (group.path || group.label)
      ? {
          title: group.label,
          note: group.isHome ? p.homeCheckout : undefined,
          branch: group.label,
          repo: folderLabel,
          path: group.path ?? undefined,
          sessionsLabel: p.sessionsCount(loadedCount)
        }
      : null
  // Profile groups know their on-disk total (children excluded); workspace
  // groups only ever page within what's already loaded.
  const totalCount = isProfileGroup ? Math.max(group.totalCount ?? loadedCount, loadedCount) : loadedCount
  const visibleSessions = group.sessions.slice(0, visibleCount)
  const hiddenCount = Math.max(0, totalCount - visibleSessions.length)
  const nextCount = Math.min(SIDEBAR_GROUP_PAGE, hiddenCount)

  // Leading glyph: profile color dot, a home mark for the repo's primary
  // checkout (labeled by its live branch), or a branch/kanban mark otherwise.
  const leadingIcon = group.color ? (
    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
  ) : (
    <Codicon
      className="shrink-0 text-(--ui-text-tertiary)"
      name={group.isKanban ? 'checklist' : group.isHome ? 'home' : 'git-branch'}
      size="0.75rem"
    />
  )

  // Reveal already-loaded rows first; only hit the backend when the next page
  // crosses what's been fetched for this profile.
  const handleProfileLoadMore = () => {
    const target = visibleCount + SIDEBAR_GROUP_PAGE

    setVisibleCount(target)

    if (target > loadedCount && loadedCount < totalCount) {
      group.onLoadMore?.()
    }
  }

  const handleNewSession = async () => {
    if (isProfileGroup) {
      newSessionInProfile(group.id)

      return
    }

    if (!onNewSession) {
      return
    }

    // Main-checkout lanes are branch-labeled views over the same repo root path.
    // Clicking "+" on `main` should open on `main`, not whatever branch the root
    // currently sits on (`test0`, etc.), so explicitly switch first.
    if (group.isMain && group.path && group.label) {
      try {
        await switchBranchInRepo(group.path, group.label)
      } catch (err) {
        notifyError(err, t.statusStack.coding.switchFailed(group.label))

        return
      }
    }

    onNewSession(group.path)
  }

  return (
    <SidebarRowStack>
      <WorkspaceHeader
        action={
          (onNewSession || isProfileGroup || onRemove) && (
            <div className="flex items-center">
              {(onNewSession || isProfileGroup) && (
                <WorkspaceAddButton
                  label={s.newSessionIn(group.label)}
                  // Profile groups start a fresh session in that profile but keep
                  // the all-profiles browse view; workspace groups seed the new
                  // session's cwd. Main checkout lanes are branch-targeted.
                  onClick={() => void handleNewSession()}
                />
              )}
              {onRemove && <WorkspaceMenu onRemove={onRemove} path={group.path} />}
            </div>
          )
        }
        count={isProfileGroup ? countLabel(visibleSessions.length, totalCount) : group.sessions.length}
        diff={activeLaneDiff}
        hover={hoverCard}
        icon={leadingIcon}
        label={group.label}
        meta={!isProfileGroup && folderLabel && folderLabel !== group.label ? folderLabel : undefined}
        onToggle={toggleOpen}
        open={open}
        title={group.path ?? undefined}
      />
      {open && (
        <>
          {visibleSessions.length === 0 ? (
            // Soft copy for empty checkout/worktree lanes (home included) when the
            // repo still has work elsewhere — avoid the Dutelog "no sessions yet"
            // scream. Truly empty profile groups keep the stronger blank copy.
            <div className="min-h-7 pl-2 text-[0.75rem] leading-7 text-(--ui-text-quaternary)">
              {isProfileGroup && !hasSiblingSessions ? s.noSessions : s.noSessionsInCheckout}
            </div>
          ) : (
            renderRows(visibleSessions)
          )}
          {hiddenCount > 0 &&
            (isProfileGroup ? (
              <SidebarLoadMoreRow
                loading={Boolean(group.loadingMore)}
                onClick={handleProfileLoadMore}
                step={nextCount}
              />
            ) : (
              <WorkspaceShowMoreButton
                count={nextCount}
                label={group.label}
                onClick={() => setVisibleCount(count => count + SIDEBAR_GROUP_PAGE)}
              />
            ))}
        </>
      )}
    </SidebarRowStack>
  )
}
