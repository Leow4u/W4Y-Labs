import { cn } from '@/lib/utils'

/**
 * The composer surface and the status/queue stack paint ONE shared
 * opaque `--composer-fill` var (set in styles.css on `[data-slot='composer-root']`).
 */
export const composerFill = 'bg-(--composer-fill)'

/** Soft saturate/blur accent — fill underneath is opaque so transcript never bleeds. */
export const composerSurfaceGlass = cn(
  'backdrop-blur-[0.75rem] backdrop-saturate-[1.12] [-webkit-backdrop-filter:blur(0.75rem)_saturate(1.12)]',
  'transition-[background-color] duration-150 ease-out'
)

const composerDockEdge = (edge: 'bottom' | 'top') =>
  cn('border border-border/65', edge === 'top' ? 'rounded-t-2xl border-b-0' : 'rounded-b-2xl border-t-0')

/** Docked card — the status stack / queue. Paints the SAME opaque
 *  `--composer-fill` as the composer surface. */
export const composerDockCard = (edge: 'bottom' | 'top' = 'top') =>
  cn(composerDockEdge(edge), composerFill, composerSurfaceGlass)

/** Floating composer panel skin — the `/`·`@`·`?` completion drawer and the
 *  attach (`+`) menu. Opaque card, hairline border, full radius, soft nous
 *  shadow. Uses an explicit fill (not `--composer-fill`) so it renders
 *  identically whether mounted inside the composer or portaled out of it.
 *  Visual skin only — consumers add their own size/position/padding. */
export const composerPanelCard = cn(
  'rounded-2xl border border-border/65 shadow-nous text-[length:var(--conversation-tool-font-size)]',
  'bg-[color-mix(in_srgb,var(--dt-card)_96%,var(--dt-background))]',
  composerSurfaceGlass
)
