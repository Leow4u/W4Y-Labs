import { useStore } from '@nanostores/react'
import { type MouseEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { NEW_CHAT_ROUTE } from '@/app/routes'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n'
import {
  CLOUD_NOT_LOGGED_IN,
  cloudProjectCwd,
  cloudRunAvailable,
  type CloudProjectRow,
  listCloudProjects,
  probeCloudLogin
} from '@/lib/w4y-cloud-projects'
import { Check, Cloud, FolderOpen, iconSize, Plus, X } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { ensureCloudBrainActive } from '@/store/gateway'
import { $dismissedAutoProjectIds } from '@/store/layout'
import { notifyError } from '@/store/notifications'
import {
  $projectScope,
  $projectTree,
  ALL_PROJECTS,
  enterProject,
  exitProjectScope,
  openOrCreateProjectFromFolder,
  openProjectCreate
} from '@/store/projects'
import {
  $cloudProjectSlug,
  beginCloudProjectSession,
  clearCloudProjectSlug,
  setRunTarget
} from '@/store/run-target'
import { setCurrentCwd } from '@/store/session'

import { RepoModal } from './repo-modal'

/** Compact strip chip (legacy / inline). */
const CHIP =
  'flex h-6 max-w-[14rem] items-center gap-1 rounded-md px-1.5 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground'

/** Flat control for the Codex full-width context header (no chevron). */
const HEADER =
  'flex h-6 max-w-[14rem] items-center gap-1.5 rounded-md px-1.5 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground'

const RECENT_LIMIT = 8

async function signInW4Y(): Promise<void> {
  const login = window.work4youDesktop?.w4y?.login
  if (!login) throw new Error('login-unavailable')
  const res = await login()
  if (!res?.ok) throw new Error(res?.reason || 'login-failed')
}

export function ProjectChip({
  onRequestFreshSession,
  variant = 'header'
}: {
  onRequestFreshSession?: () => void
  /** `header` = Codex context rail; `chip` = compact inline. */
  variant?: 'chip' | 'header'
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const c = t.composer
  const scope = useStore($projectScope)
  const tree = useStore($projectTree)
  const cloudSlug = useStore($cloudProjectSlug)
  const dismissed = useStore($dismissedAutoProjectIds)
  const [busy, setBusy] = useState(false)
  const [cloudRows, setCloudRows] = useState<CloudProjectRow[] | null>(null)
  const [cloudError, setCloudError] = useState<null | 'signin' | 'unavailable'>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [repoOpen, setRepoOpen] = useState(false)
  const cloudOk = cloudRunAvailable()
  const cloudActive = Boolean(cloudSlug.trim())
  const hasProject = cloudActive || scope !== ALL_PROJECTS
  const triggerClass = variant === 'header' ? HEADER : CHIP

  const requestFresh = () => {
    onRequestFreshSession?.()
    navigate(NEW_CHAT_ROUTE)
  }

  const recents = useMemo(() => {
    const hidden = new Set(dismissed)

    return [...tree]
      .filter(node => !(node.isAuto && hidden.has(node.id)))
      .sort((a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0))
      .slice(0, RECENT_LIMIT)
  }, [tree, dismissed])

  const activeLabel = (() => {
    if (cloudActive) {
      const row = cloudRows?.find(p => p.slug === cloudSlug)
      return row?.name || cloudSlug
    }
    if (scope === ALL_PROJECTS) return c.projectChoose
    const fromTree = tree.find(node => node.id === scope)
    if (!fromTree) return c.projectChoose
    return fromTree.label || fromTree.path?.split(/[/\\]/).pop() || c.projectChoose
  })()

  useEffect(() => {
    if (!menuOpen || !cloudOk) return
    let alive = true
    setCloudError(null)
    void listCloudProjects()
      .then(rows => {
        if (alive) setCloudRows(rows)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setCloudRows([])
        const msg = err instanceof Error ? err.message : ''
        setCloudError(msg === CLOUD_NOT_LOGGED_IN ? 'signin' : 'unavailable')
      })
    return () => {
      alive = false
    }
  }, [menuOpen, cloudOk])

  const pickFolder = () => {
    if (busy) return
    setBusy(true)
    clearCloudProjectSlug()
    setRunTarget('local')
    void openOrCreateProjectFromFolder({
      createDirectory: true,
      title: c.projectNewFolderTitle
    })
      .catch(err => notifyError(err, c.projectOpenFolderFailed))
      .finally(() => setBusy(false))
  }

  const selectCloudProject = (row: CloudProjectRow) => {
    exitProjectScope()
    beginCloudProjectSession(row.slug)
    setCurrentCwd(cloudProjectCwd(row.slug))
    void ensureCloudBrainActive().catch(err => notifyError(err, c.runCloudUnavailable))
    requestFresh()
  }

  const selectNone = () => {
    clearCloudProjectSlug()
    setRunTarget('local')
    exitProjectScope()
    setCurrentCwd('')
  }

  const clearProject = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setMenuOpen(false)
    selectNone()
  }

  return (
    <>
      <div className="group/project-chip relative inline-flex max-w-[14rem] items-center">
        {hasProject && (
          <button
            aria-label={c.projectClearTooltip}
            className="pointer-events-none absolute left-1.5 z-10 flex size-4 items-center justify-center rounded-full bg-foreground text-background opacity-0 transition-opacity group-hover/project-chip:pointer-events-auto group-hover/project-chip:opacity-100"
            onClick={clearProject}
            title={c.projectClearTooltip}
            type="button"
          >
            <X className="size-2.5" strokeWidth={2.5} />
          </button>
        )}
        <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
          <DropdownMenuTrigger
            aria-label={c.projectChipAria}
            className={cn(triggerClass, hasProject && 'group-hover/project-chip:pl-6')}
            title={c.projectChipAria}
            type="button"
          >
            <span
              className={cn(
                'inline-flex shrink-0 items-center justify-center',
                hasProject && 'group-hover/project-chip:opacity-0'
              )}
            >
              {cloudActive ? <Cloud className={iconSize.sm} /> : <FolderOpen className={iconSize.sm} />}
            </span>
            <span className="truncate">
              {cloudActive ? (
                <>
                  <span className="mr-1 text-[0.6rem] font-semibold uppercase tracking-wide opacity-70">
                    {c.projectCloudBadge}
                  </span>
                  {activeLabel}
                </>
              ) : (
                activeLabel
              )}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64" side="bottom" sideOffset={6}>
            <DropdownMenuItem onSelect={selectNone}>
              <span className="min-w-0 flex-1 truncate">{c.projectNone}</span>
              {!cloudActive && scope === ALL_PROJECTS && <Check className={cn(iconSize.sm, 'shrink-0')} />}
            </DropdownMenuItem>

          {recents.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)">
                {c.projectRecents}
              </DropdownMenuLabel>
              {recents.map(project => (
                <DropdownMenuItem
                  key={project.id}
                  onSelect={() => {
                    clearCloudProjectSlug()
                    setRunTarget('local')
                    // Attach cwd so composer git chrome ($repoStatus) can probe.
                    enterProject(project.id, { attachCwd: true })
                  }}
                  title={project.path ?? undefined}
                >
                  <span className="min-w-0 flex-1 truncate">{project.label || projectName(project.path)}</span>
                  {!cloudActive && scope === project.id && <Check className={cn(iconSize.sm, 'shrink-0')} />}
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={busy} onSelect={pickFolder}>
            <FolderOpen className={iconSize.sm} />
            <span>{c.projectNewFolder}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              clearCloudProjectSlug()
              setRunTarget('local')
              openProjectCreate()
            }}
          >
            <Plus className={iconSize.sm} />
            <span>{c.projectNew}</span>
          </DropdownMenuItem>

          {cloudOk && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)">
                {c.projectCloudSection}
              </DropdownMenuLabel>

              {cloudError === 'signin' && (
                <DropdownMenuItem
                  onSelect={() => {
                    void signInW4Y()
                      .then(() => probeCloudLogin())
                      .then(ok => {
                        if (ok === true) {
                          setCloudError(null)
                          return listCloudProjects().then(setCloudRows)
                        }
                      })
                      .catch(err => notifyError(err, c.runCloudSignIn))
                  }}
                >
                  <Cloud className={iconSize.sm} />
                  <span>{c.runCloudSignIn}</span>
                </DropdownMenuItem>
              )}

              {cloudError === 'unavailable' && (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">{c.cloudListFailed}</span>
                </DropdownMenuItem>
              )}

              {cloudError === null && cloudRows === null && (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">{c.cloudLoading}</span>
                </DropdownMenuItem>
              )}

              {cloudError === null && cloudRows && cloudRows.length === 0 && (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">{c.cloudEmpty}</span>
                </DropdownMenuItem>
              )}

              {cloudError === null &&
                cloudRows?.map(row => (
                  <DropdownMenuItem
                    key={`cloud:${row.id}`}
                    onSelect={() => {
                      selectCloudProject(row)
                    }}
                  >
                    <Cloud className={iconSize.sm} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="mr-1.5 text-[0.6rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">
                        {c.projectCloudBadge}
                      </span>
                      {row.name}
                    </span>
                    {cloudSlug === row.slug && <Check className={cn(iconSize.sm, 'shrink-0')} />}
                  </DropdownMenuItem>
                ))}

              <DropdownMenuItem
                onSelect={() => {
                  setRepoOpen(true)
                }}
              >
                <Plus className={iconSize.sm} />
                <span>{c.cloneRepo}</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      </div>

      <RepoModal
        onOpenChange={setRepoOpen}
        onPrepared={() => {
          requestFresh()
        }}
        open={repoOpen}
      />
    </>
  )
}

function projectName(path: null | string | undefined): string {
  if (!path) return '—'
  return path.split(/[/\\]/).filter(Boolean).pop() || path
}
