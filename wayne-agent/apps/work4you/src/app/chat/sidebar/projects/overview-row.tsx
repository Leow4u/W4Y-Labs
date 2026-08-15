import type * as React from 'react'
import { useRef } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import type { HermesGitWorktree } from '@/global'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import {
  SIDEBAR_LEAD_ICON_SIZE,
  SidebarRowBody,
  SidebarRowCluster,
  SidebarRowGrab,
  SidebarRowLabel,
  SidebarRowLead,
  SidebarRowLeadGlyph,
  SidebarRowNest,
  SidebarRowShell
} from '../chrome'

import { EnteredProjectContent } from './entered-content'
import { useWorkspaceNodeOpen } from './model'
import { ProjectMenu } from './project-menu'
import type { SidebarProjectTree } from './workspace-groups'
import { WorkspaceAddButton } from './workspace-header'

// A bare color dot (no icon) or an icon glyph — tinted by `color` when set, else
// the lead's default tertiary. The glyph wrapper centers + caps size either way.
export function projectIcon({ color, icon }: SidebarProjectTree) {
  if (color && !icon) {
    return (
      <SidebarRowLeadGlyph>
        <span aria-hidden="true" className="size-1 rounded-full" style={{ backgroundColor: color }} />
      </SidebarRowLeadGlyph>
    )
  }

  return (
    <SidebarRowLeadGlyph style={color ? { color } : undefined}>
      <Codicon name={icon || 'folder-library'} size={SIDEBAR_LEAD_ICON_SIZE} />
    </SidebarRowLeadGlyph>
  )
}

export function ProjectBackRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <SidebarRowShell>
      <SidebarRowBody
        className="group/back w-full text-(--ui-text-tertiary) opacity-40 hover:text-foreground"
        onClick={onClick}
      >
        <SidebarRowLead>
          <SidebarRowLeadGlyph>
            <Codicon name="arrow-left" size={SIDEBAR_LEAD_ICON_SIZE} />
          </SidebarRowLeadGlyph>
        </SidebarRowLead>
        <SidebarRowLabel className="text-xs underline-offset-4 group-hover/back:underline">{label}</SidebarRowLabel>
      </SidebarRowBody>
    </SidebarRowShell>
  )
}

interface ProjectOverviewRowProps {
  project: SidebarProjectTree
  onToggleProject?: (id: string, open: boolean) => void
  onNewSession?: (path: null | string) => void
  renderRows?: (sessions: SessionInfo[]) => React.ReactNode
  activeProjectId?: null | string
  expandedContent?: SidebarProjectTree
  repoWorktrees?: Record<string, HermesGitWorktree[]>
  liveSessions?: SessionInfo[]
  removedSessionIds?: ReadonlySet<string>
  reorderable?: boolean
  dragging?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  ref?: React.Ref<HTMLDivElement>
  style?: React.CSSProperties
}

export function ProjectOverviewRow({
  project,
  onToggleProject,
  onNewSession,
  renderRows,
  activeProjectId,
  expandedContent,
  repoWorktrees,
  liveSessions,
  removedSessionIds,
  reorderable = false,
  dragging = false,
  dragHandleProps,
  ref,
  style
}: ProjectOverviewRowProps) {
  const { t } = useI18n()
  const s = t.sidebar
  const isActive = project.id === activeProjectId
  const defaultOpen = isActive
  const [open, toggleOpen] = useWorkspaceNodeOpen(project.id, defaultOpen)
  const rowRef = useRef<HTMLDivElement>(null)

  const handleToggle = () => {
    const next = !open

    toggleOpen()
    onToggleProject?.(project.id, next)
  }

  const lead = reorderable ? (
    <SidebarRowGrab
      ariaLabel={s.projects.reorder(project.label)}
      dragging={dragging}
      dragHandleProps={dragHandleProps}
      leadClassName="overflow-visible"
    >
      {projectIcon(project)}
    </SidebarRowGrab>
  ) : (
    <SidebarRowLead>{projectIcon(project)}</SidebarRowLead>
  )

  const bodyProject = expandedContent ?? project

  return (
    <div className={cn(dragging && 'relative z-10')} ref={ref} style={style}>
      <SidebarRowShell
        actions={
          <>
            {onNewSession && (
              <WorkspaceAddButton label={s.newSessionIn(project.label)} onClick={() => onNewSession(project.path)} />
            )}
            <ProjectMenu anchorRef={rowRef} isActive={isActive} project={project} />
          </>
        }
        className={cn('group/workspace', dragging && 'cursor-grabbing bg-(--ui-sidebar-surface-background)')}
        ref={rowRef}
      >
        <SidebarRowCluster className="min-w-0 flex-1">
          {lead}
          <button
            aria-expanded={open}
            aria-label={s.projects.toggle(project.label)}
            className="flex min-w-0 flex-1 items-center gap-1 bg-transparent p-0 text-left"
            onClick={handleToggle}
            type="button"
          >
            <SidebarRowLabel
              className={cn('min-w-0 flex-1 hover:text-foreground hover:underline', isActive && 'text-foreground')}
            >
              {project.label}
            </SidebarRowLabel>
            <DisclosureCaret
              className="shrink-0 text-(--ui-text-tertiary) opacity-0 transition group-hover/workspace:opacity-100"
              open={open}
            />
          </button>
        </SidebarRowCluster>
      </SidebarRowShell>
      {open && renderRows && bodyProject.repos.length > 0 ? (
        <SidebarRowNest>
          <EnteredProjectContent
            liveSessions={liveSessions}
            onNewSession={onNewSession}
            project={bodyProject}
            removedSessionIds={removedSessionIds}
            renderRows={renderRows}
            repoWorktrees={repoWorktrees}
          />
        </SidebarRowNest>
      ) : null}
    </div>
  )
}
