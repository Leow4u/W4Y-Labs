import { pathsEqual } from '@/lib/fs-path'

import type { HermesReviewFile } from '@/global'

import { $currentCwd } from './session'

/**
 * Single source of truth for "which repo path should Review / Changes / commit
 * probe?" — the live `$currentCwd`. Composer chips, the Review pane, and
 * coding-status must all read through this (or `$currentCwd` itself); never a
 * parallel remembered path.
 */
export function activeRepoCwd(): null | string {
  return $currentCwd.get()?.trim() || null
}

/** True when `cwd` is the same repo path Review is currently probing. */
export function isActiveRepoCwd(cwd: null | string | undefined): boolean {
  return pathsEqual(cwd, activeRepoCwd())
}

export interface ReviewChangeSummary {
  fileCount: number
  added: number
  removed: number
  hasChanges: boolean
}

/** Derive Changes-chip / dirty state from the Review file list — not from a
 *  second git probe that can disagree. */
export function summarizeReviewChanges(files: readonly HermesReviewFile[]): ReviewChangeSummary {
  let added = 0
  let removed = 0

  for (const file of files) {
    added += file.added
    removed += file.removed
  }

  return {
    fileCount: files.length,
    added,
    removed,
    hasChanges: files.length > 0
  }
}

/** Changes chip label keys: loading → ellipsis; dirty → changes; else clean. */
export type ChangesChipKind = 'loading' | 'changes' | 'clean' | 'diffCount' | 'untracked'

export function changesChipKind(
  summary: ReviewChangeSummary,
  opts: { loading?: boolean } = {}
): ChangesChipKind {
  if (opts.loading && !summary.hasChanges) {
    return 'loading'
  }

  if (!summary.hasChanges) {
    return 'clean'
  }

  if (summary.added > 0 || summary.removed > 0) {
    return 'diffCount'
  }

  // Untracked-only (or binary) rows can land with 0/0 line deltas.
  return summary.fileCount > 0 ? 'untracked' : 'clean'
}
