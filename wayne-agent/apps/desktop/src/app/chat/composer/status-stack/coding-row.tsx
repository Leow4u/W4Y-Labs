import { useStore } from '@nanostores/react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { StatusRow } from '@/components/chat/status-row'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { DiffCount } from '@/components/ui/diff-count'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { SanitizedInput } from '@/components/ui/sanitized-input'
import type { HermesGitBranch } from '@/global'
import { useI18n } from '@/i18n'
import { copyTextToClipboard } from '@/lib/desktop-fs'
import { gitRef } from '@/lib/sanitize'
import { cn } from '@/lib/utils'
import { $repoStatus, $repoWorktrees } from '@/store/coding-status'
import { changesChipKind, summarizeReviewChanges } from '@/store/active-repo'
import { notify, notifyError } from '@/store/notifications'
import { $newWorktreeRequest } from '@/store/projects'
import { $reviewFiles, $reviewLoading, openReview } from '@/store/review'
// Tiny uppercase section header, matching the composer "+" menu's labels.
const MENU_SECTION = 'text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)'

/** Compact Cursor-style chip for the composer context header. */
const CHIP =
  'flex h-6 max-w-[12rem] items-center gap-1 rounded-md px-1.5 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground'

interface BranchActionCopy {
  branchCreateWorktree: string
  branchOpenExisting: string
  branchSwitchHome: string
}

const branchActionLabel = (branch: HermesGitBranch, copy: BranchActionCopy) => {
  if (branch.checkedOut) {
    return copy.branchOpenExisting
  }

  return branch.isDefault ? copy.branchSwitchHome : copy.branchCreateWorktree
}

interface CodingStatusRowProps {
  /** Compact Cursor-style chip for the strip below the composer. */
  variant?: 'bar' | 'chip'
  /** Branch label while status has an empty branch field (session branch / lane). */
  fallbackBranch?: string
  /** Branch the current draft off into a fresh worktree + session, based on
   *  `base` (a branch name; omitted = current HEAD). The composer owns the
   *  draft, so it supplies the orchestration; the row just collects the new
   *  branch name + base. Omitted (e.g. remote backend) hides the affordance. */
  onBranchOff?: (branch: string, base?: string) => Promise<void>
  /** Check an existing branch out into a fresh worktree + session (no new
   *  branch). Drives the dialog's "convert a branch" picker. */
  onConvertBranch?: (branch: string, path?: null | string, isDefault?: boolean) => Promise<void>
  /** List the repo's local branches for the "convert a branch" picker. */
  onListBranches?: () => Promise<HermesGitBranch[]>
  /** Open the review pane (changed files + diffs). */
  onOpen?: () => void
  /** Jump into an existing worktree (open a fresh session anchored there). */
  onOpenWorktree?: (path: string) => void
  /** Switch the current repo checkout to another branch. */
  onSwitchBranch?: (branch: string) => Promise<void>
}

/**
 * Coding-context row for the composer status stack: current branch, dirty
 * summary (+/-), and ahead/behind. Chip variant: branch beside Local; Changes
 * on the right opens Review (Commit & PR live only in that pane).
 */
export const CodingStatusRow = memo(function CodingStatusRow({
  variant = 'bar',
  fallbackBranch = '',
  onBranchOff,
  onConvertBranch,
  onListBranches,
  onOpen,
  onOpenWorktree,
  onSwitchBranch
}: CodingStatusRowProps) {
  const { t } = useI18n()
  const s = t.statusStack.coding
  const p = t.sidebar.projects
  const status = useStore($repoStatus)
  const worktrees = useStore($repoWorktrees)
  const reviewFiles = useStore($reviewFiles)
  const reviewLoading = useStore($reviewLoading)
  // Changes chip + Review pane share `$reviewFiles` — never a parallel
  // `$repoStatus` dirty story that can say Limpo while the pane has diffs.
  const reviewSummary = summarizeReviewChanges(reviewFiles)
  const chipKind = changesChipKind(reviewSummary, { loading: reviewLoading })

  const [branchOpen, setBranchOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [branchBase, setBranchBase] = useState<string | undefined>(undefined)
  const [branchPending, setBranchPending] = useState(false)
  const [convertMode, setConvertMode] = useState(false)
  const [branches, setBranches] = useState<HermesGitBranch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)

  const loadBranches = useCallback(async () => {
    if (!onListBranches) {
      return
    }

    setBranchesLoading(true)

    try {
      setBranches(await onListBranches())
    } catch {
      setBranches([])
    } finally {
      setBranchesLoading(false)
    }
  }, [onListBranches])

  // Open the name dialog for a chosen base. Deferred so the dropdown finishes
  // closing before the dialog grabs focus (Radix focus-trap handoff races
  // otherwise).
  const startBranch = (base: string | undefined) => {
    setBranchBase(base)
    setBranchName('')
    setConvertMode(false)
    setTimeout(() => setBranchOpen(true), 0)
  }

  const startConvert = () => {
    setBranchBase(undefined)
    setBranchName('')
    setConvertMode(true)
    void loadBranches()
    setTimeout(() => setBranchOpen(true), 0)
  }

  const enterConvert = () => {
    setConvertMode(true)
    void loadBranches()
  }

  const convertBranch = async (branch: HermesGitBranch) => {
    if (branchPending || !branch || !onConvertBranch) {
      return
    }

    setBranchPending(true)

    try {
      await onConvertBranch(branch.name, branch.worktreePath, branch.isDefault)
      setBranchOpen(false)
    } catch (err) {
      notifyError(err, p.startWorkFailed)
    } finally {
      setBranchPending(false)
    }
  }

  // Global ⌘⇧B (workspace.newWorktree): open the name dialog for a worktree off
  // current HEAD. The rail only renders inside a repo, so the hotkey naturally
  // no-ops elsewhere. Guarded by a token ref so it fires on the keypress, not on
  // mount or unrelated re-renders.
  const worktreeReq = useStore($newWorktreeRequest)
  const lastWorktreeReqRef = useRef(worktreeReq)

  useEffect(() => {
    if (worktreeReq === lastWorktreeReqRef.current) {
      return
    }

    lastWorktreeReqRef.current = worktreeReq

    if (!onBranchOff) {
      return
    }

    setBranchBase(undefined)
    setBranchName('')
    setConvertMode(false)
    setBranchOpen(true)
  }, [onBranchOff, worktreeReq])

  const submitBranch = async () => {
    const branch = branchName.trim()

    if (branchPending || !branch || !onBranchOff) {
      return
    }

    setBranchPending(true)

    try {
      await onBranchOff(branch, branchBase)
      setBranchOpen(false)
      setBranchName('')
    } catch (err) {
      notifyError(err, p.startWorkFailed)
    } finally {
      setBranchPending(false)
    }
  }

  const switchToBranch = async (branch: string) => {
    if (!onSwitchBranch) {
      return
    }

    try {
      await onSwitchBranch(branch)
    } catch (err) {
      notifyError(err, s.switchFailed(branch))
    }
  }

  const copyBranchName = async (name?: string) => {
    const branch = (name || status?.branch || '').trim()

    if (!branch || status?.detached) {
      return
    }

    try {
      await copyTextToClipboard(branch)
      notify({ kind: 'success', message: s.branchCopied(branch), durationMs: 2_000 })
    } catch (err) {
      notifyError(err, t.common.copyFailed)
    }
  }

  const openReviewPane = () => {
    if (onOpen) {
      onOpen()
    } else {
      openReview()
    }
  }

  // Wait for a real repo probe — never paint optimistic master/Limpo/Commit.
  if (!status) {
    return null
  }

  const branchLabel = status.detached ? s.detached : status.branch || fallbackBranch.trim() || s.noBranch
  // The kebab offers branching off the trunk and/or the current branch. The
  // worktree-add bases the new branch on `base` (a branch name; undefined =
  // current HEAD). We dedupe so "on main" shows a single trunk entry, and fall
  // back to a plain off-HEAD branch when no trunk is detected.
  const current = status.detached ? null : status.branch
  const branchTargets: { base: string | undefined; label: string }[] = []

  // Current branch first (the 99% "branch off where I am"), then the trunk just
  // below it ("New branch from main"), deduped when they're the same.
  if (current) {
    branchTargets.push({ base: current, label: s.branchOffFrom(current) })
  }

  if (status.defaultBranch && status.defaultBranch !== current) {
    branchTargets.push({ base: status.defaultBranch, label: s.branchOffFrom(status.defaultBranch) })
  }

  if (branchTargets.length === 0) {
    branchTargets.push({ base: undefined, label: s.newBranch })
  }

  const switchTarget =
    onSwitchBranch && current && status.defaultBranch && status.defaultBranch !== current ? status.defaultBranch : null

  // Other worktrees to jump into — everything except the one we're already in
  // (matched by its checked-out branch) and the bare/main placeholder entry.
  const otherWorktrees = onOpenWorktree
    ? worktrees.filter(w => w.path && !w.detached && w.branch && w.branch !== current)
    : []

  const hasLineDelta = reviewSummary.added > 0 || reviewSummary.removed > 0
  // Untracked-only rows can carry 0/0 line deltas — still dirty for the chip.
  const untrackedOnly = !hasLineDelta && reviewSummary.hasChanges
  const hasChanges = reviewSummary.hasChanges

  const branchMenu = onBranchOff ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={s.newBranch}
          className={cn(
            'size-4 shrink-0 text-muted-foreground/60 hover:text-foreground',
            variant === 'chip'
              ? 'opacity-70'
              : 'pointer-events-none opacity-0 transition group-hover/status-row:pointer-events-auto group-hover/status-row:opacity-100 group-focus-within/status-row:pointer-events-auto group-focus-within/status-row:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100'
          )}
          onClick={event => event.stopPropagation()}
          onKeyDown={event => {
            // The row's onActivate also fires on Enter/Space; keep it from
            // opening the review pane when the kebab is the focus target.
            if (event.key === 'Enter' || event.key === ' ') {
              event.stopPropagation()
            }
          }}
          size="icon-xs"
          variant="ghost"
        >
          <Codicon name="kebab-vertical" size="0.8rem" />
        </Button>
      </DropdownMenuTrigger>
      {/* The row sits at the bottom of the screen (above the composer),
          so the menu opens upward. */}
      <DropdownMenuContent align="end" className="w-60" side="top" sideOffset={6}>
        <DropdownMenuLabel className={MENU_SECTION}>{s.newBranch}</DropdownMenuLabel>
        {branchTargets.map(target => (
          <DropdownMenuItem key={target.base ?? '__head__'} onSelect={() => startBranch(target.base)}>
            <span className="truncate">{target.label}</span>
          </DropdownMenuItem>
        ))}

        {switchTarget && (
          <DropdownMenuItem onSelect={() => void switchToBranch(switchTarget)}>
            <span className="truncate">{s.switchTo(switchTarget)}</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className={MENU_SECTION}>{s.worktrees}</DropdownMenuLabel>
        {otherWorktrees.map(worktree => (
          <DropdownMenuItem key={worktree.path} onSelect={() => onOpenWorktree?.(worktree.path)}>
            <span className="truncate">{worktree.branch}</span>
          </DropdownMenuItem>
        ))}
        {/* Create a fresh worktree off the current HEAD (the generic
            "spin up a worktree here", mirroring the sidebar's + button). */}
        <DropdownMenuItem onSelect={() => startBranch(undefined)}>
          <span className="truncate">{p.startWork}</span>
        </DropdownMenuItem>
        {/* Check an EXISTING branch out into a worktree (no new branch). */}
        {onConvertBranch && (
          <DropdownMenuItem onSelect={() => startConvert()}>
            <span className="truncate">{p.convertBranch}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  const branchDialog = (
    <Dialog onOpenChange={open => !branchPending && setBranchOpen(open)} open={branchOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{convertMode ? p.convertBranchTitle : p.newWorktreeTitle}</DialogTitle>
          <DialogDescription>
            {convertMode ? p.convertBranchDesc : p.newWorktreeDesc}
            {!convertMode && branchBase && (
              <span className="mt-1 block text-(--ui-text-secondary)">{s.branchOffFrom(branchBase)}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {convertMode ? (
          <Command
            className="rounded-md border border-(--ui-stroke-tertiary)"
            // The branch name is the authoritative key; filter on it directly.
            filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
          >
            <CommandInput autoFocus disabled={branchPending} placeholder={p.convertBranchPlaceholder} />
            <CommandList className="max-h-64">
              <CommandEmpty>{branchesLoading ? p.branchesLoading : p.noBranches}</CommandEmpty>
              <CommandGroup>
                {branches.map(branch => (
                  <CommandItem
                    disabled={branchPending}
                    key={branch.name}
                    onSelect={() => void convertBranch(branch)}
                    value={branch.name}
                  >
                    <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="git-branch" size="0.8rem" />
                    <span className="truncate">{branch.name}</span>
                    <span className="ml-auto shrink-0 text-[0.625rem] text-(--ui-text-tertiary)">
                      {branchActionLabel(branch, p)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <SanitizedInput
            autoFocus
            disabled={branchPending}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submitBranch()
              } else if (event.key === 'Escape') {
                setBranchOpen(false)
              }
            }}
            onValueChange={setBranchName}
            placeholder={p.branchPlaceholder}
            sanitize={gitRef}
            value={branchName}
          />
        )}

        {convertMode ? (
          <DialogFooter className="sm:justify-start">
            <Button
              className="px-0 text-(--ui-text-secondary) hover:text-foreground"
              disabled={branchPending}
              onClick={() => setConvertMode(false)}
              type="button"
              variant="link"
            >
              {t.common.cancel}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="sm:justify-between">
            {onConvertBranch ? (
              <Button
                className="px-0 text-(--ui-text-secondary) hover:text-foreground"
                disabled={branchPending}
                onClick={enterConvert}
                type="button"
                variant="link"
              >
                {p.convertBranchInstead}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button disabled={branchPending} onClick={() => setBranchOpen(false)} type="button" variant="ghost">
                {t.common.cancel}
              </Button>
              <Button
                disabled={branchPending || !branchName.trim()}
                onClick={() => void submitBranch()}
                type="button"
              >
                {p.startWork}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )

  // Chip variant: branch beside Local (left); Changes on the right opens Review.
  // Commit & PR live only in the Review ship bar — not duplicated here.
  if (variant === 'chip') {
    return (
      <>
        <div
          className="flex min-w-0 flex-1 items-center justify-between gap-1"
          data-slot="coding-status-chips"
        >
          <div className={cn(CHIP, 'group/branch-chip max-w-[14rem]')}>
            <button
              aria-label={s.copyBranch}
              className="flex min-w-0 flex-1 items-center gap-1 bg-transparent text-left"
              onClick={() => void copyBranchName()}
              title={branchLabel}
              type="button"
            >
              <Codicon className="shrink-0 text-(--ui-green)" name="git-branch" size="0.8rem" />
              <span className="min-w-0 truncate">{branchLabel}</span>
              {(status.ahead > 0 || status.behind > 0) && (
                <span className="flex shrink-0 items-center gap-1 text-[0.65rem] tabular-nums text-muted-foreground/75">
                  {status.ahead > 0 && <span title={s.ahead(status.ahead)}>↑{status.ahead}</span>}
                  {status.behind > 0 && <span title={s.behind(status.behind)}>↓{status.behind}</span>}
                </span>
              )}
            </button>
            {branchMenu}
          </div>

          <button
            aria-label={s.changes}
            className={CHIP}
            onClick={openReviewPane}
            title={s.openChanges}
            type="button"
          >
            {chipKind === 'loading' ? (
              <span>…</span>
            ) : hasLineDelta ? (
              <DiffCount
                added={reviewSummary.added}
                className="text-[0.7rem] leading-4"
                removed={reviewSummary.removed}
              />
            ) : untrackedOnly ? (
              <span className="text-amber-500/90">{s.changed(reviewSummary.fileCount)}</span>
            ) : (
              <span>{hasChanges ? s.changes : s.clean}</span>
            )}
          </button>
        </div>
        {branchDialog}
      </>
    )
  }

  return (
    <>
      <StatusRow
        // Bar: full-width coding rail on the composer surface (legacy).
        className="coding-status-bar min-h-7 rounded-t-[inherit] rounded-b-none border-b border-(--ui-stroke-tertiary) px-3.5 py-1.5 hover:bg-transparent"
        // Static branch glyph — never the loading spinner. This row only renders
        // once `status` exists, so a spinner here only ever fired on *refreshes*
        // of an already-loaded repo (window focus, turn settle), reading as an
        // annoying icon "blip" with no first-load value. Refreshes are silent.
        leading={<Codicon className="text-(--ui-green)" name="git-branch" size="0.8rem" />}
        onActivate={onOpen}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span
            className="min-w-0 truncate text-xs font-normal text-muted-foreground/92 transition-colors group-hover/status-row:text-foreground/90"
            title={branchLabel}
          >
            {branchLabel}
          </span>
          {branchMenu}
        </div>

        {(status.ahead > 0 || status.behind > 0) && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[0.68rem] leading-4 text-muted-foreground/75 tabular-nums">
            {status.ahead > 0 && (
              <span className="flex items-center gap-0.5" title={s.ahead(status.ahead)}>
                <span aria-hidden>↑</span>
                {status.ahead}
              </span>
            )}
            {status.behind > 0 && (
              <span className="flex items-center gap-0.5" title={s.behind(status.behind)}>
                <span aria-hidden>↓</span>
                {status.behind}
              </span>
            )}
          </span>
        )}

        {hasLineDelta ? (
          <DiffCount
            added={reviewSummary.added}
            className={`text-[0.72rem] leading-4 ${status.ahead === 0 && status.behind === 0 ? 'ml-auto' : ''}`}
            removed={reviewSummary.removed}
          />
        ) : untrackedOnly ? (
          <span
            className={`shrink-0 text-[0.72rem] leading-4 text-amber-500/90 ${status.ahead === 0 && status.behind === 0 ? 'ml-auto' : ''}`}
          >
            {s.changed(reviewSummary.fileCount)}
          </span>
        ) : null}
      </StatusRow>

      {branchDialog}
    </>
  )
})
