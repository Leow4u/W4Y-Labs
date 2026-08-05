import { AppSpinner } from '@/components/ui/app-spinner'

/**
 * Shown while a lazy route chunk loads. Replaces the blank `fallback={null}`
 * flash with a centered loader so switching screens reads as "loading", not
 * "frozen". Fills the main pane.
 */
export function ViewFallback() {
  return (
    <div
      aria-hidden
      className="flex min-h-0 flex-1 items-center justify-center bg-(--ui-chat-surface-background)"
    >
      <AppSpinner className="size-6 opacity-70" />
    </div>
  )
}

/**
 * Full-screen variant for lazy overlays (settings, command center, …), which
 * paint over the whole window rather than filling a pane.
 */
export function OverlayFallback() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-50 grid place-items-center bg-(--ui-chat-surface-background)"
    >
      <AppSpinner className="size-6 opacity-70" />
    </div>
  )
}
