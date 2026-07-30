import type { ReactNode } from 'react'

import { SearchField } from '@/components/ui/search-field'
import { ResponsiveTabs } from '@/components/ui/tab-dropdown'
import { cn } from '@/lib/utils'

// Tabs are data, not nodes: the shell owns their presentation so every page
// gets the same behavior — a centered TextTab row on wide viewports that
// collapses into a dropdown when the header can't fit both search and tabs.
export interface PageShellTab {
  id: string
  label: string
  /** Count badge. `null` = still loading (renders a skeleton); `undefined` = no badge. */
  meta?: string | number | null
}

interface PageSearchShellProps extends React.ComponentProps<'section'> {
  children: ReactNode
  tabs?: PageShellTab[]
  activeTab?: string
  onTabChange?: (id: string) => void
  /** Secondary filters shown full-width on their own row below (expands). */
  filters?: ReactNode
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  /** Data-derived rotating placeholder nudges (see SearchField.hints). */
  searchHints?: string[]
  searchValue: string
  /** Hide the search field when there's nothing to search (empty dataset). */
  searchHidden?: boolean
  /** Right-aligned control in the header's trailing cell (e.g. a refresh button)
   *  so mouse users get a visible affordance for the refresh hotkey. */
  searchTrailingAction?: ReactNode
  /**
   * `customize` = Cursor Customize layout: search + primary action on one
   * centered row, pill tabs on the next, content in a soft card.
   * Default keeps the legacy 3-column header used by other pages.
   */
  variant?: 'default' | 'customize'
  /** Shown before pill tabs in `customize` (Cursor identity / scope chip). */
  tabLeading?: ReactNode
}

function ShellTabs({
  tabs,
  activeTab,
  onTabChange,
  pill,
  leading
}: {
  tabs: PageShellTab[]
  activeTab?: string
  onTabChange?: (id: string) => void
  pill?: boolean
  /** Cursor Customize: identity / scope pill before category tabs. */
  leading?: ReactNode
}) {
  if (pill) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {leading}
        {tabs.map(tab => {
          const active = tab.id === (activeTab ?? tabs[0]?.id)
          return (
            <button
              className={cn(
                'inline-flex h-8 items-center rounded-full px-3.5 text-[0.8125rem] font-medium transition-colors',
                active
                  ? 'bg-muted text-foreground'
                  : 'bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              type="button"
            >
              {tab.label}
              {typeof tab.meta === 'number' ? (
                <span className="ml-1.5 text-[0.7rem] font-normal text-muted-foreground">{tab.meta}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <ResponsiveTabs
      onChange={id => onTabChange?.(id)}
      tabs={tabs}
      value={activeTab ?? tabs[0]?.id ?? ''}
      wideClassName="justify-center"
    />
  )
}

export function PageSearchShell({
  children,
  className,
  tabs,
  activeTab,
  onTabChange,
  filters,
  onSearchChange,
  searchPlaceholder,
  searchHints,
  searchValue,
  searchHidden = false,
  searchTrailingAction,
  variant = 'default',
  tabLeading,
  ...props
}: PageSearchShellProps) {
  const hasTabs = (tabs?.length ?? 0) > 0
  const customize = variant === 'customize'

  if (customize) {
    return (
      <section
        {...props}
        className={cn('flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)', className)}
      >
        <div className="shrink-0 px-8 pt-[calc(var(--titlebar-height)+1.25rem)]">
          {(!searchHidden || searchTrailingAction) && (
            <div className="mx-auto flex w-full max-w-[34rem] items-center gap-2.5">
              {!searchHidden && (
                <SearchField
                  appearance="pill"
                  containerClassName="min-w-0 flex-1"
                  onChange={onSearchChange}
                  placeholder={searchPlaceholder}
                  value={searchValue}
                />
              )}
              {searchTrailingAction ? <div className="shrink-0">{searchTrailingAction}</div> : null}
            </div>
          )}
          {hasTabs ? (
            <div className="mx-auto mt-5 flex w-full max-w-[48rem] justify-center">
              <ShellTabs
                activeTab={activeTab}
                leading={tabLeading}
                onTabChange={onTabChange}
                pill
                tabs={tabs!}
              />
            </div>
          ) : null}
          {filters ? <div className="mx-auto mt-2 flex w-full max-w-[48rem] flex-wrap justify-center gap-2">{filters}</div> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-8 pb-8 pt-5">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[40rem] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-[0_0_0_1px_rgba(0,0,0,0.02)]">
            {children}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      {...props}
      className={cn('flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)', className)}
    >
      {/*
        IMPORTANT: do NOT put `-webkit-app-region: drag` on this header. It spans
        full width over the band where the floating titlebar icon clusters live,
        and an overlapping OS drag region eats their clicks at the compositor
        level (pointer-events / no-drag carve-outs across separate stacking
        contexts don't reliably fix it on macOS). The shell already supplies a
        draggable titlebar strip that is `calc()`'d around the icon clusters
        (see app-shell.tsx), so window dragging still works here.
      */}
      <div className="shrink-0">
        {(hasTabs || !searchHidden) && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 pb-2 pt-[calc(var(--titlebar-height)+0.5rem)]">
            <div className="flex min-w-0 items-center justify-start">
              {!searchHidden && (
                <SearchField
                  containerClassName="max-w-[45vw]"
                  hints={searchHints}
                  onChange={onSearchChange}
                  placeholder={searchPlaceholder}
                  value={searchValue}
                />
              )}
            </div>
            {hasTabs ? <ShellTabs activeTab={activeTab} onTabChange={onTabChange} tabs={tabs!} /> : <span />}
            <div className="flex min-w-0 items-center justify-end">{searchTrailingAction}</div>
          </div>
        )}
        {filters ? <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2">{filters}</div> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-(--ui-chat-surface-background)">{children}</div>
    </section>
  )
}
