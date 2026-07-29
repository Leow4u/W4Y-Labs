/**
 * Settings → Models — Cursor-style curated toggles, inline More…,
 * full catalog page (+ Add more LLM), hover info cards, BYOK + MoA.
 */
import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { getGlobalModelOptions } from '@/hermes'
import { useI18n } from '@/i18n'
import { ChevronRight } from '@/lib/icons'
import { displayModelName } from '@/lib/model-status-label'
import { normalize } from '@/lib/text'
import { cn } from '@/lib/utils'
import {
  featuredBySection,
  formatContextWindow,
  prepareW4yPickerProviders,
  W4Y_CATALOG_PROVIDER,
  W4Y_FEATURED_MODELS,
  type FeaturedModel
} from '@/lib/w4y-featured-models'
import {
  $visibleModels,
  collapseModelFamilies,
  effectiveVisibleKeys,
  modelVisibilityKey,
  setVisibleModels,
  toggleModelVisibility
} from '@/store/model-visibility'
import type { ModelOptionProvider, ModelOptionsResponse } from '@/types/hermes'

import { ModelSettings } from './model-settings'
import { ModelsRuntimeSettings } from './models-runtime-settings'
import { ProviderApiKeysPanel } from './provider-api-keys-panel'
import { ListRow, SettingsContent, SettingsGroup, SettingsPageTitle } from './primitives'

const MODEL_SECTIONS = ['', 'keys', 'moa', 'catalog'] as const
type ModelSection = (typeof MODEL_SECTIONS)[number]

interface ModelsSettingsProps {
  onConfigSaved?: () => void
  onMainModelChanged?: (provider: string, model: string) => void
}

function SettingsDisclosure({
  children,
  open,
  onOpenChange,
  title
}: {
  children: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
}) {
  return (
    <section className="mb-5">
      <button
        className="mb-1.5 flex w-full items-center gap-1 px-0.5 text-left text-[0.75rem] font-medium text-(--ui-text-tertiary) hover:text-foreground"
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
        <span>{title}</span>
      </button>
      {open ? <div className="overflow-hidden rounded-xl bg-(--ui-bg-tertiary)/70 px-3.5 py-3">{children}</div> : null}
    </section>
  )
}

function ModelHoverCard({ model }: { model: FeaturedModel }) {
  const { t } = useI18n()
  const m = t.settings.model
  const card = m.featuredCards[model.id]
  const title = card?.title || model.title || model.label
  const description = card?.description || model.description
  const versionText = model.version ? m.featuredVersions[model.version] : undefined

  return (
    <div className="max-w-[260px] space-y-2 p-0.5 text-left">
      <div className="text-[0.8125rem] font-semibold leading-tight text-foreground">{title}</div>
      <p className="text-[0.6875rem] leading-snug text-(--ui-text-secondary)">{description}</p>
      <p className="text-[0.6875rem] text-(--ui-text-tertiary)">
        {m.featuredContextWindow(formatContextWindow(model.contextWindow))}
      </p>
      {versionText ? (
        <p className="text-[0.6875rem] text-(--ui-text-tertiary)">{m.featuredVersionLine(versionText)}</p>
      ) : null}
    </div>
  )
}

function ModelToggleRow({
  checked,
  model,
  onToggle
}: {
  checked: boolean
  model: FeaturedModel
  onToggle: () => void
}) {
  return (
    <ListRow
      action={<Switch checked={checked} onCheckedChange={() => onToggle()} />}
      inset
      title={
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default outline-none">{model.label}</span>
          </TooltipTrigger>
          <TooltipContent
            align="start"
            className="w-fit max-w-[280px] rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) px-3 py-2.5 text-left font-normal text-foreground shadow-lg [font-family:inherit]"
            side="left"
            sideOffset={12}
          >
            <ModelHoverCard model={model} />
          </TooltipContent>
        </Tooltip>
      }
    />
  )
}

function CatalogToggleRow({
  checked,
  label,
  onToggle
}: {
  checked: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <ListRow
      action={<Switch checked={checked} onCheckedChange={() => onToggle()} />}
      inset
      title={label}
    />
  )
}

export function ModelsSettings({ onConfigSaved, onMainModelChanged }: ModelsSettingsProps) {
  const { t } = useI18n()
  const m = t.settings.model
  const { hash, pathname, search } = useLocation()
  const navigate = useNavigate()
  const stored = useStore($visibleModels)
  const [moreOpen, setMoreOpen] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')

  const sectionParam = useMemo((): ModelSection => {
    const raw = new URLSearchParams(search).get('msection')
    return raw && MODEL_SECTIONS.includes(raw as ModelSection) ? (raw as ModelSection) : ''
  }, [search])

  const [keysOpen, setKeysOpen] = useState(sectionParam === 'keys')
  const [moaOpen, setMoaOpen] = useState(sectionParam === 'moa')
  const catalogOpen = sectionParam === 'catalog'

  useEffect(() => {
    if (sectionParam === 'keys') {
      setKeysOpen(true)
    }
    if (sectionParam === 'moa') {
      setMoaOpen(true)
    }
  }, [sectionParam])

  const setSection = (next: ModelSection) => {
    const params = new URLSearchParams(search)
    params.set('tab', 'config:model')
    if (!next) {
      params.delete('msection')
    } else {
      params.set('msection', next)
    }
    const qs = params.toString()
    navigate({ hash, pathname, search: qs ? `?${qs}` : '' }, { replace: true })
  }

  const modelOptions = useQuery({
    queryKey: ['model-options', 'settings-models'],
    queryFn: (): Promise<ModelOptionsResponse> => getGlobalModelOptions()
  })

  const catalogProvider = useMemo((): ModelOptionProvider | null => {
    const providers = prepareW4yPickerProviders(modelOptions.data?.providers)
    return (
      providers.find(p => p.slug === W4Y_CATALOG_PROVIDER && (p.models ?? []).length > 0) ??
      providers.find(p => (p.models ?? []).length > 0) ??
      null
    )
  }, [modelOptions.data])

  const providersForVisibility = useMemo(
    () => prepareW4yPickerProviders(modelOptions.data?.providers).filter(p => (p.models ?? []).length > 0),
    [modelOptions.data]
  )

  const availableIds = useMemo(() => new Set(catalogProvider?.models ?? []), [catalogProvider])

  // Prefer live catalog intersection; if the curated roster isn't online yet,
  // still show the full PME list so Settings isn't empty on a stale cache.
  const pinnedModels = useMemo(() => {
    const pinned = featuredBySection('pinned')
    const live = pinned.filter(e => availableIds.has(e.id))
    return live.length > 0 ? live : pinned
  }, [availableIds])

  const moreModels = useMemo(() => {
    const more = featuredBySection('more')
    const live = more.filter(e => availableIds.has(e.id))
    return live.length > 0 ? live : more
  }, [availableIds])

  const visible = effectiveVisibleKeys(stored, providersForVisibility)
  const providerSlug = catalogProvider?.slug || W4Y_CATALOG_PROVIDER

  const toggle = (modelId: string) => {
    if (providersForVisibility.length === 0) {
      // Seed a synthetic provider so toggles still persist before catalog loads.
      const synthetic: ModelOptionProvider = {
        name: 'Catalog',
        slug: providerSlug,
        models: W4Y_FEATURED_MODELS.map(e => e.id)
      }
      setVisibleModels(toggleModelVisibility($visibleModels.get(), [synthetic], providerSlug, modelId))
      return
    }
    setVisibleModels(toggleModelVisibility($visibleModels.get(), providersForVisibility, providerSlug, modelId))
  }

  const isOn = (modelId: string) => visible.has(modelVisibilityKey(providerSlug, modelId))

  const catalogFamilies = useMemo(() => {
    const families = collapseModelFamilies(catalogProvider?.models ?? [])
    const q = normalize(catalogSearch)
    if (!q) {
      return families
    }
    return families.filter(family => {
      const label = displayModelName(family.id)
      return `${family.id} ${label}`.toLowerCase().includes(q)
    })
  }, [catalogProvider, catalogSearch])

  if (catalogOpen) {
    return (
      <SettingsContent>
        <div className="mx-auto w-full max-w-2xl pt-1">
          <button
            className="mb-3 flex items-center gap-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) hover:text-foreground"
            onClick={() => setSection('')}
            type="button"
          >
            <ChevronRight className="size-3.5 -rotate-180" />
            {m.backToModels}
          </button>
          <SettingsPageTitle title={m.addMoreTitle} />
          <p className="mb-4 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {m.addMoreIntro}
          </p>

          <div className="mb-3">
            <input
              autoFocus
              className="h-9 w-full rounded-lg border border-(--ui-stroke-tertiary)/80 bg-(--ui-bg-tertiary)/50 px-3 text-[length:var(--conversation-text-font-size)] text-foreground placeholder:text-(--ui-text-tertiary) focus:outline-none focus:ring-1 focus:ring-primary/40"
              onChange={e => setCatalogSearch(e.target.value)}
              placeholder={m.addMoreSearch}
              type="search"
              value={catalogSearch}
            />
          </div>

          <SettingsGroup title={m.pickerGroup}>
            {modelOptions.isPending ? (
              <div className="flex justify-center px-3.5 py-8">
                <GlyphSpinner className="text-sm" />
              </div>
            ) : catalogFamilies.length === 0 ? (
              <div className="px-3.5 py-6 text-center text-[length:var(--conversation-caption-font-size)] text-muted-foreground">
                {m.noCatalogModels}
              </div>
            ) : (
              catalogFamilies.map(family => (
                <CatalogToggleRow
                  checked={isOn(family.id)}
                  key={family.id}
                  label={displayModelName(family.id)}
                  onToggle={() => toggle(family.id)}
                />
              ))
            )}
          </SettingsGroup>
        </div>
      </SettingsContent>
    )
  }

  return (
    <SettingsContent>
      <div className="mx-auto w-full max-w-2xl pt-1">
        <SettingsPageTitle title={m.title} />
        <p className="mb-4 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {m.composerIntro}
        </p>

        <TooltipProvider delayDuration={280}>
          <SettingsGroup title={m.pickerGroup}>
            {modelOptions.isPending && pinnedModels.length === 0 ? (
              <div className="flex justify-center px-3.5 py-8">
                <GlyphSpinner className="text-sm" />
              </div>
            ) : pinnedModels.length === 0 ? (
              <div className="px-3.5 py-6 text-center text-[length:var(--conversation-caption-font-size)] text-muted-foreground">
                {m.noCatalogModels}
              </div>
            ) : (
              pinnedModels.map(entry => (
                <ModelToggleRow
                  checked={isOn(entry.id)}
                  key={entry.id}
                  model={entry}
                  onToggle={() => toggle(entry.id)}
                />
              ))
            )}

            {moreOpen
              ? moreModels.map(entry => (
                  <ModelToggleRow
                    checked={isOn(entry.id)}
                    key={entry.id}
                    model={entry}
                    onToggle={() => toggle(entry.id)}
                  />
                ))
              : null}

            {moreModels.length > 0 ? (
              <div className="border-t border-(--ui-stroke-tertiary)/80 px-3.5 py-2.5">
                <Button onClick={() => setMoreOpen(v => !v)} size="inline" type="button" variant="textStrong">
                  {moreOpen ? m.showLessModels : m.moreModels}
                </Button>
              </div>
            ) : null}

            <div className={cn('px-3.5 py-2.5', moreModels.length === 0 && 'border-t border-(--ui-stroke-tertiary)/80')}>
              <Button onClick={() => setSection('catalog')} size="inline" type="button" variant="textStrong">
                {m.addMoreModels}
              </Button>
            </div>
          </SettingsGroup>
        </TooltipProvider>

        <ModelsRuntimeSettings onConfigSaved={onConfigSaved} />

        <SettingsDisclosure
          onOpenChange={open => {
            setKeysOpen(open)
            setSection(open ? 'keys' : moaOpen ? 'moa' : '')
          }}
          open={keysOpen}
          title={m.apiKeysDisclosure}
        >
          <ProviderApiKeysPanel />
        </SettingsDisclosure>

        <SettingsDisclosure
          onOpenChange={open => {
            setMoaOpen(open)
            setSection(open ? 'moa' : keysOpen ? 'keys' : '')
          }}
          open={moaOpen}
          title={m.moaDisclosure}
        >
          <ModelSettings embed onMainModelChanged={onMainModelChanged} />
        </SettingsDisclosure>
      </div>
    </SettingsContent>
  )
}
