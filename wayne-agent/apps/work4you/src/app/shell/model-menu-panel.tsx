import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { SETTINGS_ROUTE } from '@/app/routes'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  dropdownMenuRow,
  DropdownMenuSearch,
  dropdownMenuSectionLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import type { HermesGateway } from '@/hermes'
import { useAccountPlanGating } from '@/hooks/use-account-plan-gating'
import { useI18n } from '@/i18n'
import {
  isW4yAutoModel,
  rememberComposerManualModel,
  resolveComposerManualFallback
} from '@/lib/composer-auto-mode'
import { requestModelOptions } from '@/lib/model-options'
import { currentPickerSelection, displayModelName, reasoningEffortLabel } from '@/lib/model-status-label'
import { normalize } from '@/lib/text'
import { cn } from '@/lib/utils'
import { openUpgrade } from '@/lib/plans'
import {
  isW4yPickerProvider,
  modelLabel,
  prepareW4yPickerProviders,
  W4Y_AUTO_MODEL_ID,
  W4Y_CATALOG_PROVIDER
} from '@/lib/w4y-featured-models'
import { $modelPresets, applyModelPreset, modelPresetKey } from '@/store/model-presets'
import {
  $visibleModels,
  collapseModelFamilies,
  effectiveVisibleKeys,
  type ModelFamily,
  modelVisibilityKey
} from '@/store/model-visibility'
import {
  $activeSessionId,
  $currentFastMode,
  $currentModel,
  $currentProvider,
  $currentReasoningEffort
} from '@/store/session'
import type { ModelOptionProvider, ModelOptionsResponse } from '@/types/hermes'

import { ModelEditSubmenu, resolveFastControl } from './model-edit-submenu'

// Lets the host dropdown (model-pill) hand the panel a way to dismiss itself so
// clicking a model row commits + closes, while the hover-revealed edit submenu
// (reasoning/fast) stays open to play with (its items preventDefault on select).
export const ModelMenuCloseContext = createContext<() => void>(() => {})

interface ModelMenuPanelProps {
  gateway?: HermesGateway
  onSelectModel: (selection: { model: string; provider: string }) => Promise<boolean> | void
  requestGateway: <T>(method: string, params?: Record<string, unknown>) => Promise<T>
}

interface ProviderGroup {
  families: ModelFamily[]
  provider: ModelOptionProvider
}

export function ModelMenuPanel({ gateway, onSelectModel, requestGateway }: ModelMenuPanelProps) {
  const { t } = useI18n()
  const copy = t.shell.modelMenu
  const pickerCopy = t.modelPicker
  const closeMenu = useContext(ModelMenuCloseContext)
  const navigate = useNavigate()
  const { plan, gratisGating, isLocked } = useAccountPlanGating()
  const [search, setSearch] = useState('')
  // Reactive session state is read from the stores here (not drilled in), so
  // toggling effort/fast/model re-renders this panel in place without forcing
  // the parent to rebuild the menu content (which would close the dropdown).
  const activeSessionId = useStore($activeSessionId)
  const currentFastMode = useStore($currentFastMode)
  const currentModel = useStore($currentModel)
  const currentProvider = useStore($currentProvider)
  const currentReasoningEffort = useStore($currentReasoningEffort)
  const modelPresets = useStore($modelPresets)
  const visibleModels = useStore($visibleModels)

  const modelOptions = useQuery({
    queryKey: ['model-options', activeSessionId || 'global'],
    // Gateway-first even with no session yet: a connected (possibly remote)
    // gateway owns the model catalog, including virtual providers like `moa`
    // that the local REST fallback can't know about (#53817).
    queryFn: (): Promise<ModelOptionsResponse> => requestModelOptions({ gateway, sessionId: activeSessionId })
  })

  const { model: optionsModel, provider: optionsProvider } = currentPickerSelection(
    !!activeSessionId,
    { model: currentModel, provider: currentProvider },
    modelOptions.data
  )

  const loading = modelOptions.isPending && !modelOptions.data

  const error = modelOptions.error
    ? modelOptions.error instanceof Error
      ? modelOptions.error.message
      : String(modelOptions.error)
    : null

  const providers = modelOptions.data?.providers

  // The catalog carries MoA presets as a virtual `moa` provider row. Render
  // them in their dedicated section below and keep the row out of the main
  // provider groups so presets don't show up twice.
  const moaPresets = useMemo(
    () => providers?.find(provider => provider.slug.toLowerCase() === 'moa')?.models ?? [],
    [providers]
  )

  const pickerProviders = useMemo(() => prepareW4yPickerProviders(providers), [providers])

  const effectiveVisibleModels = useMemo(
    () => effectiveVisibleKeys(visibleModels, pickerProviders, plan),
    [visibleModels, pickerProviders, plan]
  )

  // Contract B: Composer sticky write-through. selectModel pins the live
  // session (when any) and persists the active profile's model.default so
  // Settings / cron / new chats share the same SSOT — without mutating shared
  // process env (Hermes multi-session isolation).
  const switchTo = (model: string, provider: string) => onSelectModel({ model, provider })

  // Selecting a model row restores that model's remembered preset onto the
  // session (effort/fast), gated by capability. Unset → Hermes defaults.
  // Cursor pattern: picking a specific model leaves Auto.
  const selectFamily = async (family: ModelFamily, provider: ModelOptionProvider) => {
    const caps = provider.capabilities?.[family.id]
    const preset = modelPresets[modelPresetKey(provider.slug, family.id)] ?? {}

    // Variant-fast models (no speed param) express "fast" as a separate `-fast`
    // id, so honor the saved preset by selecting that sibling. Param-fast is
    // applied via applyModelPreset below instead.
    const variantFast = !(caps?.fast ?? false) && !!family.fastId
    const targetId = variantFast && preset.fast === true ? family.fastId! : family.id

    rememberComposerManualModel(targetId, provider.slug)

    if ((await switchTo(targetId, provider.slug)) === false) {
      return
    }

    await applyModelPreset(
      {
        effort: (caps?.reasoning ?? true) ? (preset.effort ?? 'medium') : undefined,
        fast: (caps?.fast ?? false) ? (preset.fast ?? false) : undefined
      },
      { failMessage: t.shell.modelOptions.updateFailed, request: requestGateway, sessionId: activeSessionId }
    )
  }

  // Selecting a MoA preset uses the same write-through path as real providers
  // (session pin + profile default via selectModel). Previously this dispatched
  // the one-shot `/moa` command, which ran a single turn through MoA and then
  // silently reverted (#54670).
  const selectMoaPreset = async (preset: string) => {
    rememberComposerManualModel(preset, 'moa')

    if ((await switchTo(preset, 'moa')) === false) {
      return
    }

    closeMenu()
  }

  // Auto is a toggle (Cursor), not a selectable model row. Active when the
  // catalog auto-router is the live model — that preference persists via the
  // sticky composer model key.
  const isAutoMode = isW4yAutoModel(optionsModel)

  const groups = useMemo(
    () =>
      groupModels(pickerProviders, search, effectiveVisibleModels, /* excludeAutoRouter */ true),
    [pickerProviders, search, effectiveVisibleModels]
  )

  const openAddModels = () => {
    closeMenu()
    navigate(`${SETTINGS_ROUTE}?tab=config:model`)
  }

  // Cursor Auto toggle: ON → openrouter/auto; OFF → last manual / featured.
  // Keep the menu open so the switch feels like a control, not a commit.
  const setAutoMode = (on: boolean) => {
    if (on && gratisGating) {
      openUpgrade('essencial')
      return
    }

    if (on) {
      if (!isAutoMode) {
        rememberComposerManualModel(optionsModel, optionsProvider)
        void switchTo(W4Y_AUTO_MODEL_ID, W4Y_CATALOG_PROVIDER)
      }
      return
    }

    if (!isAutoMode) {
      return
    }

    const fallback = resolveComposerManualFallback()
    void switchTo(fallback.model, fallback.provider)
  }

  return (
    <>
      <DropdownMenuSearch aria-label={copy.search} onValueChange={setSearch} placeholder={copy.search} value={search} />

      <DropdownMenuSeparator className="mx-0" />

      {loading ? (
        <DropdownMenuGroup className="py-1">
          {Array.from({ length: 4 }, (_, index) => (
            <DropdownMenuItem
              className={dropdownMenuRow}
              disabled
              key={index}
              onSelect={event => event.preventDefault()}
            >
              <Skeleton className="h-4 w-full" />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      ) : error ? (
        <DropdownMenuItem className={dropdownMenuRow} disabled>
          {error}
        </DropdownMenuItem>
      ) : (
        <div className="max-h-[max(150px,30dvh)] overflow-y-auto py-0.5">
          {/* Cursor-style Auto toggle — pinned under Search, never a ✓ model row.
              When Auto is ON, hide the specific-model list + MoA (Cursor pattern). */}
          <DropdownMenuGroup className="py-0.5">
            <DropdownMenuItem
              className={cn(
                dropdownMenuRow,
                'cursor-default',
                isAutoMode ? 'h-auto items-start py-1.5' : 'items-center',
                gratisGating && !isAutoMode && 'opacity-60'
              )}
              onSelect={event => event.preventDefault()}
            >
              <div className="min-w-0 flex-1 pr-2">
                <div className="truncate font-medium">{copy.autoMode}</div>
                {isAutoMode ? (
                  <div className="mt-0.5 text-[11px] leading-snug whitespace-normal text-(--ui-text-tertiary)">
                    {copy.autoModeHint}
                  </div>
                ) : gratisGating ? (
                  <div className="mt-0.5 text-[11px] leading-snug whitespace-normal text-(--ui-text-tertiary)">
                    {pickerCopy.planGatedHint}
                  </div>
                ) : null}
              </div>
              <Switch
                aria-label={copy.autoMode}
                checked={isAutoMode}
                className={cn('shrink-0', isAutoMode && 'mt-0.5')}
                disabled={gratisGating && !isAutoMode}
                onCheckedChange={checked => setAutoMode(checked)}
                size="xs"
              />
            </DropdownMenuItem>
            {!isAutoMode ? (
              <DropdownMenuLabel className={cn(dropdownMenuSectionLabel, 'mt-1')}>
                {copy.specificModel}
              </DropdownMenuLabel>
            ) : null}
          </DropdownMenuGroup>
          {!isAutoMode ? (
            groups.length === 0 ? (
              <DropdownMenuItem className={dropdownMenuRow} disabled>
                {copy.noModels}
              </DropdownMenuItem>
            ) : (
              groups.map(group => (
              <DropdownMenuGroup className="py-0.5" key={group.provider.slug}>
                {group.provider.slug !== W4Y_CATALOG_PROVIDER ? (
                  <DropdownMenuLabel className={dropdownMenuSectionLabel}>{group.provider.name}</DropdownMenuLabel>
                ) : null}
                {group.families.map(family => {
                  // The active id may be the base or its -fast sibling; either
                  // way this one family row represents both.
                  const activeId =
                    group.provider.slug === optionsProvider &&
                    (optionsModel === family.id || optionsModel === family.fastId)
                      ? optionsModel
                      : null

                  const isCurrent = activeId !== null
                  const name = modelLabel(family.id)
                  // Capabilities are looked up against the active/base id; the
                  // -fast variant carries the same param support as its base.
                  const caps = group.provider.capabilities?.[family.id]

                  // Effective settings for this row: live session state when it's
                  // the active model, otherwise its remembered preset (Hermes
                  // defaults when unset). Row label AND submenu read from these so
                  // they never disagree.
                  const preset = modelPresets[modelPresetKey(group.provider.slug, family.id)] ?? {}
                  const effEffort = isCurrent ? currentReasoningEffort : (preset.effort ?? '')
                  const effFast = isCurrent ? currentFastMode : (preset.fast ?? false)

                  const fastControl = resolveFastControl(
                    activeId ?? family.id,
                    group.provider.models ?? [],
                    caps?.fast ?? false,
                    effFast
                  )

                  const isAutoRouter = isW4yAutoModel(family.id)
                  const planLocked = isLocked(family.id)
                  const meta = isAutoRouter
                    ? ''
                    : [
                        fastControl.kind !== 'none' && fastControl.on ? copy.fast : null,
                        (caps?.reasoning ?? true) ? reasoningEffortLabel(effEffort) || copy.medium : null
                      ]
                        .filter(Boolean)
                        .join(' ')

                  // Every row is a hover-Edit submenu trigger. Activating it
                  // (pointer or keyboard) switches to the family's base model and
                  // restores its preset; the Fast toggle inside swaps to the -fast
                  // sibling (or flips the speed param). The sub-trigger has no
                  // `onSelect`, so wire both click and Enter/Space for keyboard parity.
                  // Clicking the row commits the model and closes the picker; the
                  // edit submenu (reasoning/fast) is reached by HOVER, so you can
                  // still tweak those without the click dismissing everything.
                  const activate = () => {
                    if (planLocked) {
                      openUpgrade('essencial')
                      closeMenu()
                      return
                    }

                    if (!isCurrent) {
                      void selectFamily(family, group.provider)
                    }

                    closeMenu()
                  }

                  return (
                    <DropdownMenuSub key={`${group.provider.slug}:${family.id}`}>
                      <DropdownMenuSubTrigger
                        className={cn(dropdownMenuRow, planLocked && 'cursor-not-allowed opacity-45')}
                        hideChevron
                        onClick={activate}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            activate()
                          }
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {name}
                          {meta ? <span className="text-(--ui-text-tertiary)"> {meta}</span> : null}
                        </span>
                        {planLocked ? (
                          <span className="ml-auto shrink-0 text-[0.62rem] uppercase tracking-wide opacity-80">
                            {pickerCopy.upgrade}
                          </span>
                        ) : isCurrent ? (
                          <Codicon className="ml-auto text-foreground" name="check" size="0.75rem" />
                        ) : null}
                      </DropdownMenuSubTrigger>
                      {/* Auto-routing models have no per-request effort/fast knobs. */}
                      {!isAutoRouter && (
                        <ModelEditSubmenu
                          effort={effEffort}
                          fastControl={fastControl}
                          isActive={isCurrent}
                          model={family.id}
                          onSelectModel={nextModel => switchTo(nextModel, group.provider.slug)}
                          provider={group.provider.slug}
                          reasoning={caps?.reasoning ?? true}
                          requestGateway={requestGateway}
                        />
                      )}
                    </DropdownMenuSub>
                  )
                })}
              </DropdownMenuGroup>
            ))
            )
          ) : null}
        </div>
      )}

      <DropdownMenuSeparator className="mx-0" />

      {!isAutoMode && moaPresets.length > 0 ? (
        <>
          <DropdownMenuLabel className={dropdownMenuSectionLabel}>MoA presets</DropdownMenuLabel>
          {moaPresets.map(preset => {
            const isCurrentMoa = optionsProvider === 'moa' && optionsModel === preset
            const planLocked = gratisGating

            return (
              <DropdownMenuItem
                className={cn(dropdownMenuRow, planLocked && 'cursor-not-allowed opacity-45')}
                key={`moa:${preset}`}
                onSelect={event => {
                  event.preventDefault()
                  if (planLocked) {
                    openUpgrade('essencial')
                    return
                  }
                  void selectMoaPreset(preset)
                }}
              >
                <span className="min-w-0 flex-1 truncate">MoA: {preset}</span>
                {planLocked ? (
                  <span className="ml-auto shrink-0 text-[0.62rem] uppercase tracking-wide opacity-80">
                    {pickerCopy.upgrade}
                  </span>
                ) : isCurrentMoa ? (
                  <Codicon className="ml-auto text-foreground" name="check" size="0.75rem" />
                ) : null}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator className="mx-0" />
        </>
      ) : null}

      <DropdownMenuItem className={cn(dropdownMenuRow, 'text-(--ui-text-tertiary)')} onSelect={openAddModels}>
        <Codicon name="settings-gear" size="0.75rem" />
        {copy.addModels}
      </DropdownMenuItem>
    </>
  )
}

// Show only Settings → Models toggles (or curated defaults). Search narrows
// within that active set — never resurfaces hidden catalog rows. Turning a
// toggle off removes the model from pickers immediately.

function groupModels(
  providers: ModelOptionProvider[],
  search: string,
  visible: Set<string>,
  excludeAutoRouter = false
): ProviderGroup[] {
  const q = normalize(search)
  const groups: ProviderGroup[] = []

  for (const provider of providers) {
    if (!isW4yPickerProvider(provider)) {
      continue
    }

    const allFamilies = collapseModelFamilies(provider.models ?? [])

    if (allFamilies.length === 0) {
      continue
    }

    const matches = (family: ModelFamily) =>
      `${family.id} ${family.fastId ?? ''} ${displayModelName(family.id)}`.toLowerCase().includes(q)

    const isAutoRouterFamily = (family: ModelFamily) => isW4yAutoModel(family.id)

    const families = allFamilies.filter(
      family =>
        visible.has(modelVisibilityKey(provider.slug, family.id)) &&
        (!q || matches(family)) &&
        !(excludeAutoRouter && isAutoRouterFamily(family))
    )

    if (families.length > 0) {
      groups.push({ families, provider })
    }
  }

  // Stable, logical group order: alphabetical by provider name. (The backend
  // floats the current provider first, which would reshuffle on every switch.)
  groups.sort((a, b) => a.provider.name.localeCompare(b.provider.name))

  return groups
}
