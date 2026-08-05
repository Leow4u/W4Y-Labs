import { useStore } from '@nanostores/react'
import { type ComponentProps, useEffect, useRef } from 'react'

import { AgentsPanelBody } from '@/app/agents'
import { TreeSkeleton } from '@/components/chat/skeletons'
import { ErrorBoundary } from '@/components/error-boundary'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useDelayedTrue } from '@/hooks/use-delayed-true'
import { useI18n } from '@/i18n'
import { normalizeOrLocalPreviewTarget } from '@/lib/local-preview'
import { cn } from '@/lib/utils'
import { $fileBrowserOpen, $panesFlipped, setFileBrowserOpen } from '@/store/layout'
import { notifyError } from '@/store/notifications'
import { setCurrentSessionPreviewTarget } from '@/store/preview'
import { $currentCwd } from '@/store/session'
import { $subagentsBySession, activeSubagentCount, allSubagents } from '@/store/subagents'

import { SidebarPanelLabel } from '../shell/sidebar-label'

import { BrowserPanelBody } from './browser/panel'
import { $browserSession, openHtmlInBrowserPanel } from './browser/session'
import { ProjectTree } from './files/tree'
import { useProjectTree } from './files/use-project-tree'
import {
  $rightSidebarTab,
  $terminalTakeover,
  type RightSidebarTab,
  setTerminalTakeover
} from './store'
import { TerminalPaneChrome } from './terminal/chrome'

interface RightSidebarPaneProps {
  onActivateFile: (path: string) => void
  onActivateFolder: (path: string) => void
}

export function RightSidebarPane({ onActivateFile, onActivateFolder }: RightSidebarPaneProps) {
  const { t } = useI18n()
  const r = t.rightSidebar
  const panesFlipped = useStore($panesFlipped)
  const currentCwd = useStore($currentCwd).trim()
  const fileBrowserOpen = useStore($fileBrowserOpen)
  const terminalTakeover = useStore($terminalTakeover)
  const tab = useStore($rightSidebarTab)
  const browserSession = useStore($browserSession)
  const subagentsBySession = useStore($subagentsBySession)
  const runningAgents = activeSubagentCount(allSubagents(subagentsBySession))
  const prevRunningRef = useRef(0)
  const browserBusy = browserSession.status === 'running'

  const selectTab = (next: RightSidebarTab) => {
    $rightSidebarTab.set(next)
    if (next === 'terminal') {
      setTerminalTakeover(true)
    } else if ($terminalTakeover.get()) {
      setTerminalTakeover(false)
    }
  }

  // When subagents start, open Ambiente and switch to the Agents tab.
  useEffect(() => {
    const prev = prevRunningRef.current
    prevRunningRef.current = runningAgents
    if (runningAgents > 0 && prev === 0) {
      selectTab('agents')
      if (!fileBrowserOpen) {
        setFileBrowserOpen(true)
      }
    }
  }, [fileBrowserOpen, runningAgents])

  // External openers (keybinds, agent tabs, runInTerminal) flip takeover —
  // mirror that onto the Ambiente Terminal tab and ensure the pane is open.
  useEffect(() => {
    if (terminalTakeover) {
      if ($rightSidebarTab.get() !== 'terminal') {
        $rightSidebarTab.set('terminal')
      }
      if (!$fileBrowserOpen.get()) {
        setFileBrowserOpen(true)
      }
    } else if ($rightSidebarTab.get() === 'terminal') {
      $rightSidebarTab.set('files')
    }
  }, [terminalTakeover])

  // The file tree is simply "browse the session's working directory". If the
  // session has a cwd — a repo, a sibling worktree, or any folder — show it. A
  // bare/detached chat (resolveNewSessionCwd → '') has none, so it shows the
  // empty hint instead of whatever dir Hermes happens to run from.
  const hasWorkspace = Boolean(currentCwd)

  const {
    collapseAll,
    collapseNonce,
    data,
    effectiveCwd,
    loadChildren,
    openState,
    refreshRoot,
    rootError,
    rootLoading,
    setNodeOpen
  } = useProjectTree(hasWorkspace ? currentCwd : '')

  const cwdName =
    effectiveCwd
      .split(/[\\/]+/)
      .filter(Boolean)
      .pop() ?? effectiveCwd

  const canCollapse = Object.values(openState).some(Boolean)

  const previewFile = async (path: string) => {
    try {
      const preview = await normalizeOrLocalPreviewTarget(path, effectiveCwd || undefined)

      if (!preview) {
        throw new Error(r.couldNotPreview(path))
      }

      setCurrentSessionPreviewTarget(preview, 'file-browser', path)

      // HTML / localhost → also land in Ambiente Browser (webview), not only the
      // separate Preview rail — matches “open landing.html in the Browser tab”.
      if (preview.previewKind === 'html' || preview.kind === 'url') {
        openHtmlInBrowserPanel(preview.url)
      }
    } catch (error) {
      notifyError(error, r.previewUnavailable)
    }
  }

  return (
    <aside
      aria-label={r.aria}
      className={cn(
        'before:pointer-events-none relative flex h-full w-full min-w-0 flex-col overflow-hidden border-(--ui-stroke-secondary) bg-(--ui-sidebar-surface-background) pt-(--titlebar-height) text-(--ui-text-tertiary)',
        panesFlipped
          ? 'border-r shadow-[inset_-0.0625rem_0_0_color-mix(in_srgb,white_18%,transparent)]'
          : 'border-l shadow-[inset_0.0625rem_0_0_color-mix(in_srgb,white_18%,transparent)]'
      )}
    >
      <div
        aria-label={r.panelsAria}
        className="flex h-7 shrink-0 items-center gap-0.5 border-b border-(--ui-stroke-tertiary) px-2"
        role="tablist"
      >
        <TabButton active={tab === 'files'} label={r.files} onSelect={() => selectTab('files')} />
        <TabButton
          active={tab === 'agents'}
          badge={runningAgents > 0 ? String(runningAgents) : undefined}
          label={r.agents}
          onSelect={() => selectTab('agents')}
        />
        <TabButton
          active={tab === 'browser'}
          badge={browserBusy ? '…' : undefined}
          label={r.browser.tab}
          onSelect={() => selectTab('browser')}
        />
        <TabButton active={tab === 'terminal'} label={r.terminal} onSelect={() => selectTab('terminal')} />
      </div>

      {tab === 'agents' ? (
        <AgentsPanelBody />
      ) : tab === 'browser' ? (
        <BrowserPanelBody />
      ) : tab === 'terminal' ? (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-(--ui-editor-surface-background)">
          <TerminalPaneChrome />
        </div>
      ) : (
        <FilesystemTab
          canCollapse={canCollapse}
          collapseNonce={collapseNonce}
          cwd={effectiveCwd}
          cwdName={cwdName}
          data={data}
          error={rootError}
          hasWorkspace={hasWorkspace}
          loading={rootLoading}
          onActivateFile={onActivateFile}
          onActivateFolder={onActivateFolder}
          onCollapseAll={collapseAll}
          onLoadChildren={loadChildren}
          onNodeOpenChange={setNodeOpen}
          onPreviewFile={previewFile}
          onRefresh={() => void refreshRoot()}
          openState={openState}
        />
      )}
    </aside>
  )
}

function TabButton({
  active,
  badge,
  label,
  onSelect
}: {
  active: boolean
  badge?: string
  label: string
  onSelect: () => void
}) {
  return (
    <button
      aria-selected={active}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md px-2 text-[0.7rem] font-medium transition-colors',
        active
          ? 'bg-(--ui-control-active-background) text-foreground'
          : 'text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
      )}
      onClick={onSelect}
      role="tab"
      type="button"
    >
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="rounded bg-foreground/10 px-1 text-[0.62rem] tabular-nums text-foreground/80">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

interface FilesystemTabProps extends FileTreeBodyProps {
  canCollapse: boolean
  cwdName: string
  hasWorkspace: boolean
  onCollapseAll: () => void
  onRefresh: () => void
}

// Sidebar palette + hover-reveal: header actions stay reachable while moving
// from the project label to the action buttons.
const HEADER_ACTION_CLASS =
  'text-sidebar-foreground/70 hover:bg-sidebar-accent! hover:text-sidebar-accent-foreground! focus-visible:ring-sidebar-ring'

const HEADER_ACTION_LABEL_REVEAL = `${HEADER_ACTION_CLASS} pointer-events-none opacity-0 transition-opacity focus-visible:pointer-events-auto focus-visible:opacity-100 group-focus-within/project-header:pointer-events-auto group-focus-within/project-header:opacity-100 group-hover/project-header:pointer-events-auto group-hover/project-header:opacity-100`

function FilesystemTab({
  canCollapse,
  collapseNonce,
  cwd,
  cwdName,
  data,
  error,
  hasWorkspace,
  loading,
  onActivateFile,
  onActivateFolder,
  onCollapseAll,
  onLoadChildren,
  onNodeOpenChange,
  onPreviewFile,
  onRefresh,
  openState
}: FilesystemTabProps) {
  const { t } = useI18n()
  const r = t.rightSidebar

  // No working directory (a bare/detached chat) → no tree, just a terse hint.
  // Switching workspace is a project/worktree action, never a raw folder picker.
  if (!hasWorkspace) {
    return <PaneEmptyState label={r.noProjectOpen} />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RightSidebarSectionHeader>
        <div className="flex min-w-0 flex-1">
          <SidebarPanelLabel>{cwdName}</SidebarPanelLabel>
        </div>
        <Button
          aria-label={r.refreshTree}
          className={HEADER_ACTION_LABEL_REVEAL}
          disabled={loading}
          onClick={onRefresh}
          size="icon-xs"
          title={r.refreshTree}
          variant="ghost"
        >
          <Codicon name="refresh" size="0.8125rem" spinning={loading} />
        </Button>
        <Button
          aria-label={r.collapseAll}
          className={cn(HEADER_ACTION_CLASS, !canCollapse && 'pointer-events-none opacity-0')}
          disabled={!canCollapse}
          onClick={onCollapseAll}
          size="icon-xs"
          title={r.collapseAll}
          variant="ghost"
        >
          <Codicon name="collapse-all" size="0.8125rem" />
        </Button>
      </RightSidebarSectionHeader>
      <FileTreeBody
        collapseNonce={collapseNonce}
        cwd={cwd}
        data={data}
        error={error}
        loading={loading}
        onActivateFile={onActivateFile}
        onActivateFolder={onActivateFolder}
        onLoadChildren={onLoadChildren}
        onNodeOpenChange={onNodeOpenChange}
        onPreviewFile={onPreviewFile}
        onRetry={onRefresh}
        openState={openState}
      />
    </div>
  )
}

export function RightSidebarSectionHeader({ children, className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('group/project-header flex h-7 shrink-0 items-center px-2.5', className)} {...props}>
      {children}
    </div>
  )
}

interface FileTreeBodyProps {
  collapseNonce: number
  cwd: string
  data: ReturnType<typeof useProjectTree>['data']
  error: string | null
  loading: boolean
  onActivateFile: (path: string) => void
  onActivateFolder: (path: string) => void
  onLoadChildren: (id: string) => void | Promise<void>
  onNodeOpenChange: (id: string, open: boolean) => void
  onPreviewFile?: (path: string) => void
  /** Force-reload the root. The hook also auto-retries while errored, so this
   *  is the impatient-user path. */
  onRetry?: () => void
  openState: ReturnType<typeof useProjectTree>['openState']
}

function FileTreeBody({
  collapseNonce,
  cwd,
  data,
  error,
  loading,
  onActivateFile,
  onActivateFolder,
  onLoadChildren,
  onNodeOpenChange,
  onPreviewFile,
  onRetry,
  openState
}: FileTreeBodyProps) {
  const { t } = useI18n()
  const r = t.rightSidebar
  // Stay blank for a beat, then skeleton — so a fast project switch doesn't
  // flash a jarring loading state.
  const showSkeleton = useDelayedTrue(loading && data.length === 0)

  if (!cwd) {
    return <EmptyState body={r.noProjectBody} title={r.noProjectTitle} />
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <EmptyState body={r.unreadableBody(error)} title={r.unreadableTitle} />
        {onRetry && (
          <button
            className="text-[0.68rem] font-medium text-muted-foreground transition hover:text-foreground"
            onClick={onRetry}
            type="button"
          >
            {r.tryAgain}
          </button>
        )}
      </div>
    )
  }

  if (loading && data.length === 0) {
    return showSkeleton ? <FileTreeLoadingState /> : <div className="min-h-0 flex-1" />
  }

  if (data.length === 0) {
    return <EmptyState body={r.emptyBody} title={r.emptyTitle} />
  }

  return (
    <ErrorBoundary
      fallback={({ reset }) => (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <EmptyState body={r.treeErrorBody} title={r.treeErrorTitle} />
          <button
            className="text-[0.68rem] font-medium text-muted-foreground transition hover:text-foreground"
            onClick={reset}
            type="button"
          >
            {r.tryAgain}
          </button>
        </div>
      )}
      key={cwd}
      label="file-tree"
    >
      <ProjectTree
        collapseNonce={collapseNonce}
        cwd={cwd}
        data={data}
        onActivateFile={onActivateFile}
        onActivateFolder={onActivateFolder}
        onLoadChildren={onLoadChildren}
        onNodeOpenChange={onNodeOpenChange}
        onPreviewFile={onPreviewFile}
        openState={openState}
      />
    </ErrorBoundary>
  )
}

function FileTreeLoadingState() {
  const { t } = useI18n()

  return (
    <div aria-label={t.rightSidebar.loadingTree} className="min-h-0 flex-1" role="status">
      <TreeSkeleton />
    </div>
  )
}

// Terse pane empty state ("No files" / "No diffs"): the panel label itself —
// same uppercase/tracking + dither dot — just muted instead of theme-primary,
// centered. Shared by the file tree and review panes so both read identically.
export function PaneEmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4">
      <SidebarPanelLabel className="pl-0 text-(--ui-text-quaternary)">{label}</SidebarPanelLabel>
    </div>
  )
}

// Richer empty/error state (title + body) for the file tree's read failures.
export function EmptyState({ body, title }: { body: string; title?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
      {title && (
        <div className="text-[0.7rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground/75">{title}</div>
      )}
      <div className="text-[0.68rem] leading-relaxed text-muted-foreground/65">{body}</div>
    </div>
  )
}
