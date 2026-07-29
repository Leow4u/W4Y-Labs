import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { DesktopMarketplaceSearchItem } from '@/global'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Check, Download, Loader2, Palette, Trash2 } from '@/lib/icons'
import { selectableCardClass } from '@/lib/selectable-card'
import { cn } from '@/lib/utils'
import { $embedAllowed, $embedMode, clearEmbedAllowed, type EmbedMode, setEmbedMode } from '@/store/embed-consent'
import { $toolViewMode, setToolViewMode } from '@/store/tool-view'
import { $translucency, setTranslucency } from '@/store/translucency'
import { $zoomPercent, setZoomPercent } from '@/store/zoom'
import { getBaseColors, useTheme } from '@/themes/context'
import { THEME_DEFAULT_FONT_ID } from '@/themes/fonts'
import { installVscodeThemeFromMarketplace } from '@/themes/install'
import type { DesktopTheme } from '@/themes/types'
import { $marketplaceInstalls, isUserTheme, removeUserTheme } from '@/themes/user-themes'

import { CONTROL_TEXT, MODE_OPTIONS } from './constants'
import { PetSettings } from './pet-settings'
import {
  ListRow,
  SettingsContent,
  SettingsGroup,
  SettingsGroupBody,
  SettingsPageTitle
} from './primitives'

function ThemePreview({ name, mode }: { name: string; mode: 'light' | 'dark' }) {
  const c = getBaseColors(name, mode)

  return (
    <div
      className="h-16 overflow-hidden rounded-lg border shadow-xs"
      style={{ backgroundColor: c.background, borderColor: c.border }}
    >
      <div className="flex h-full">
        <div
          className="w-10 border-r"
          style={{
            backgroundColor: c.sidebarBackground ?? c.muted,
            borderColor: c.sidebarBorder ?? c.border
          }}
        />
        <div className="flex flex-1 flex-col gap-1.5 p-2.5">
          <div className="h-2 w-14 rounded-full" style={{ backgroundColor: c.foreground }} />
          <div className="h-1.5 w-20 rounded-full" style={{ backgroundColor: c.mutedForeground }} />
          <div className="mt-auto flex justify-end">
            <div
              className="h-4 w-12 rounded-full border"
              style={{
                backgroundColor: c.userBubble ?? c.muted,
                borderColor: c.userBubbleBorder ?? c.border
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const UI_SCALE_PRESETS = ['90', '100', '110', '125', '150', '175'] as const

type UiScalePreset = (typeof UI_SCALE_PRESETS)[number]

function matchUiScalePreset(percent: number): UiScalePreset | null {
  return UI_SCALE_PRESETS.find(preset => Number(preset) === percent) ?? null
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs)

    return () => clearTimeout(handle)
  }, [value, delayMs])

  return debounced
}

const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

function MarketplaceThemeResults({
  query,
  installs,
  onInstalled
}: {
  query: string
  installs: ReadonlyMap<string, DesktopTheme>
  onInstalled: (name: string) => void
}) {
  const { t } = useI18n()
  const a = t.settings.appearance
  const installCopy = t.commandCenter.installTheme
  const debounced = useDebounced(query.trim(), 300)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const search = useQuery({
    queryFn: async () => {
      const searchMarketplace = window.hermesDesktop?.themes?.searchMarketplace

      if (!searchMarketplace) {
        throw new Error(a.marketplaceError)
      }

      return searchMarketplace(debounced)
    },
    queryKey: ['marketplace-themes-settings', debounced],
    staleTime: 5 * 60 * 1000
  })

  const select = (item: DesktopMarketplaceSearchItem) => {
    const owned = installs.get(item.extensionId)

    if (owned) {
      triggerHaptic('crisp')
      onInstalled(owned.name)

      return
    }

    void install(item)
  }

  const install = async (item: DesktopMarketplaceSearchItem) => {
    if (installingId) {
      return
    }

    setInstallingId(item.extensionId)
    setError(null)

    try {
      const theme = await installVscodeThemeFromMarketplace(item.extensionId)

      triggerHaptic('crisp')
      onInstalled(theme.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : a.marketplaceError)
    } finally {
      setInstallingId(null)
    }
  }

  if (search.isLoading) {
    return (
      <p className="flex items-center gap-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
        <Loader2 className="size-3.5 animate-spin" />
        {a.marketplaceLoading}
      </p>
    )
  }

  if (search.isError) {
    return <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-red)">{a.marketplaceError}</p>
  }

  const results = search.data ?? []

  if (results.length === 0) {
    return (
      <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
        {a.marketplaceEmpty}
      </p>
    )
  }

  return (
    <>
      {error && <p className="mb-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-red)">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {results.map(item => {
          const busy = installingId === item.extensionId
          const done = installs.has(item.extensionId)

          return (
            <button
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 text-left disabled:opacity-60',
                selectableCardClass({ prominent: done })
              )}
              disabled={Boolean(installingId) && !busy}
              key={item.extensionId}
              onClick={() => select(item)}
              type="button"
            >
              <Palette className="size-4 shrink-0 text-(--ui-text-tertiary)" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[length:var(--conversation-text-font-size)] font-medium">
                  {item.displayName}
                </span>
                <span className="block truncate text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                  {item.publisher}
                  {item.installs > 0
                    ? ` · ${installCopy.installs(compactNumber.format(item.installs))}`
                    : ''}
                </span>
              </span>
              <span className="shrink-0 text-(--ui-text-tertiary)">
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : done ? (
                  <Check className="size-4 text-(--ui-green)" />
                ) : (
                  <Download aria-label={installCopy.install} className="size-4" />
                )}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

export function AppearanceSettings() {
  const { t } = useI18n()
  const { themeName, mode, resolvedMode, availableThemes, setTheme, setMode, fontId, fontChoices, setFont } =
    useTheme()
  const toolViewMode = useStore($toolViewMode)
  const zoomPercent = useStore($zoomPercent)
  const embedMode = useStore($embedMode)
  const embedAllowed = useStore($embedAllowed)
  const translucency = useStore($translucency)
  const installs = useStore($marketplaceInstalls)
  const a = t.settings.appearance

  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryQuery, setGalleryQuery] = useState('')

  const themes = availableThemes
    .slice()
    .sort((left, right) => Number(right.name === themeName) - Number(left.name === themeName))

  const modeOptions = MODE_OPTIONS.map(({ id, icon }) => ({ icon, id, label: t.settings.modeOptions[id].label }))

  const toolOptions = [
    { id: 'product', label: a.product },
    { id: 'technical', label: a.technical }
  ] as const

  const embedOptions = [
    { id: 'ask', label: a.embedsAsk },
    { id: 'always', label: a.embedsAlways },
    { id: 'off', label: a.embedsOff }
  ] as const satisfies readonly { id: EmbedMode; label: string }[]

  const uiScaleOptions = UI_SCALE_PRESETS.map(preset => ({ id: preset, label: `${preset}%` }))

  const matchedScalePreset = matchUiScalePreset(zoomPercent)

  return (
    <SettingsContent>
      <div className="mx-auto w-full max-w-2xl pt-1">
        <SettingsPageTitle title={a.title} />

        <SettingsGroup title={a.themeTitle}>
          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('crisp')
                  setMode(id)
                }}
                options={modeOptions}
                value={mode}
              />
            }
            description={a.colorModeDesc}
            inset
            title={a.colorMode}
          />
          <SettingsGroupBody>
            <div className="max-h-[28rem] overflow-y-auto pr-1">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {themes.map(theme => {
                  const active = themeName === theme.name
                  const removable = isUserTheme(theme.name)

                  return (
                    <div className="group relative" key={theme.name}>
                      <button
                        className={cn('w-full p-2 text-left', selectableCardClass({ active, prominent: true }))}
                        onClick={() => {
                          triggerHaptic('crisp')
                          setTheme(theme.name)
                        }}
                        type="button"
                      >
                        <ThemePreview mode={resolvedMode} name={theme.name} />
                        <div className="mt-2 px-0.5">
                          <div className="truncate text-[length:var(--conversation-text-font-size)] font-medium">
                            {theme.label}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
                            {theme.description}
                          </div>
                        </div>
                      </button>
                      {removable && (
                        <button
                          aria-label={a.removeTheme}
                          className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-(--ui-bg-elevated)/80 text-(--ui-text-tertiary) opacity-0 backdrop-blur-sm transition hover:text-(--ui-red) focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={() => {
                            triggerHaptic('crisp')
                            removeUserTheme(theme.name)

                            if (active) {
                              setTheme(theme.name)
                            }
                          }}
                          title={a.removeTheme}
                          type="button"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-3">
              <Button
                onClick={() => {
                  triggerHaptic('crisp')
                  setGalleryOpen(open => {
                    if (open) {
                      setGalleryQuery('')
                    }

                    return !open
                  })
                }}
                size="sm"
                type="button"
                variant="textStrong"
              >
                {galleryOpen ? a.findMoreThemesClose : a.findMoreThemes}
              </Button>
            </div>

            {galleryOpen ? (
              <div className="mt-3 space-y-3 border-t border-(--ui-stroke-tertiary) pt-3">
                <input
                  autoFocus
                  className="w-full rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-1.5 text-[length:var(--conversation-caption-font-size)] outline-none placeholder:text-(--ui-text-tertiary) focus:border-(--ui-stroke-secondary)"
                  onChange={event => setGalleryQuery(event.target.value)}
                  placeholder={a.gallerySearchPlaceholder}
                  spellCheck={false}
                  value={galleryQuery}
                />
                <div className="max-h-72 overflow-y-auto pr-1">
                  <MarketplaceThemeResults
                    installs={installs}
                    onInstalled={name => setTheme(name)}
                    query={galleryQuery}
                  />
                </div>
              </div>
            ) : null}
          </SettingsGroupBody>
        </SettingsGroup>

        <SettingsGroup title={a.fontTitle}>
          <ListRow
            action={
              <Select
                onValueChange={id => {
                  triggerHaptic('selection')
                  setFont(id)
                }}
                value={fontId}
              >
                <SelectTrigger className={cn('min-w-48', CONTROL_TEXT)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={THEME_DEFAULT_FONT_ID}>{a.fontThemeDefault}</SelectItem>
                  {fontChoices.map(font => (
                    <SelectItem key={font.id} value={font.id}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            description={a.fontDesc}
            inset
            title={a.fontTitle}
          />
        </SettingsGroup>

        <SettingsGroup title={a.displayGroup}>
          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setZoomPercent(Number(id))
                }}
                options={uiScaleOptions}
                value={matchedScalePreset ?? ('' as UiScalePreset)}
              />
            }
            description={a.uiScaleDesc(zoomPercent)}
            inset
            title={a.uiScaleTitle}
          />
          <ListRow
            action={
              <div className="flex items-center gap-3">
                <input
                  aria-label={a.translucencyTitle}
                  className="h-1 w-36 cursor-pointer appearance-none rounded-full bg-(--ui-stroke-tertiary)"
                  max={100}
                  min={0}
                  onChange={event => {
                    triggerHaptic('selection')
                    setTranslucency(Number(event.target.value))
                  }}
                  step={5}
                  style={{ accentColor: 'var(--dt-primary)' }}
                  type="range"
                  value={translucency}
                />
                <span className="w-9 text-right text-[length:var(--conversation-caption-font-size)] tabular-nums text-(--ui-text-tertiary)">
                  {translucency}%
                </span>
              </div>
            }
            description={a.translucencyDesc}
            inset
            title={a.translucencyTitle}
          />
          <ListRow
            action={
              <SegmentedControl
                onChange={id => {
                  triggerHaptic('selection')
                  setToolViewMode(id)
                }}
                options={toolOptions}
                value={toolViewMode}
              />
            }
            description={a.toolViewDesc}
            inset
            title={a.toolViewTitle}
          />
          <ListRow
            action={
              <div className="flex flex-col items-end gap-1.5">
                <SegmentedControl
                  onChange={id => {
                    triggerHaptic('selection')
                    setEmbedMode(id)
                  }}
                  options={embedOptions}
                  value={embedMode}
                />
                {embedAllowed.length > 0 && (
                  <Button
                    onClick={() => {
                      triggerHaptic('selection')
                      clearEmbedAllowed()
                    }}
                    size="inline"
                    variant="text"
                  >
                    {a.embedsReset(embedAllowed.length)}
                  </Button>
                )}
              </div>
            }
            description={a.embedsDesc}
            inset
            title={a.embedsTitle}
          />
        </SettingsGroup>

        <PetSettings />
      </div>
    </SettingsContent>
  )
}
