import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  getAuxiliaryModels,
  getGlobalModelInfo,
  getGlobalModelOptions,
  getMoaModels,
  getRecommendedDefaultModel,
  saveHermesConfig,
  saveMoaModels,
  setEnvVar,
  setModelAssignment
} from '@/hermes'
import type {
  AuxiliaryModelsResponse,
  MoaConfigResponse,
  MoaModelSlot,
  ModelOptionProvider,
  StaleAuxAssignment
} from '@/hermes'
import { useI18n } from '@/i18n'
import { AlertTriangle, Loader2 } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { modelLabel, prepareW4yPickerProviders } from '@/lib/w4y-featured-models'
import { $visibleModels, effectiveVisibleKeys, filterActiveModels } from '@/store/model-visibility'
import { notifyError } from '@/store/notifications'
import { startManualLocalEndpoint, startManualProviderOAuth } from '@/store/onboarding'

import { invalidateHermesConfig, setHermesConfigCache, useHermesConfigRecord } from '../hooks/use-config-record'
import { useOnProfileSwitch } from '../hooks/use-on-profile-switch'

import { CONTROL_TEXT } from './constants'
import { getNested, setNested } from './helpers'
import { ListRow, Pill, SettingsGroup } from './primitives'

/**
 * Curated face: Composer owns the profile default (contract B); helper/aux slots
 * stay on auto unless Advanced resurfaces them. The APIs + handlers below stay
 * wired so we can flip this without rebuilding the system — only the Settings
 * chrome is hidden.
 */
const SHOW_DEFAULT_AND_AUX_SURFACE = false

// Skeleton mirror of the Model settings cards while the catalog loads.
export function ModelSettingsSkeleton() {
  if (!SHOW_DEFAULT_AND_AUX_SURFACE) {
    return (
      <div className="grid gap-5" data-slot="model-settings-skeleton">
        <Skeleton className="h-3 w-80 max-w-full" />
        <section>
          <Skeleton className="mb-1.5 h-3 w-40" />
          <div className="overflow-hidden rounded-xl bg-(--ui-bg-tertiary)/70 px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-28" />
            </div>
            <div className="mt-3 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="grid gap-5" data-slot="model-settings-skeleton">
      <section>
        <Skeleton className="mb-1.5 h-3 w-24" />
        <div className="overflow-hidden rounded-xl bg-(--ui-bg-tertiary)/70 px-3.5 py-3">
          <Skeleton className="mb-3 h-3 w-72 max-w-full" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-60 max-w-full" />
            <Skeleton className="h-8 w-16" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
      </section>
      <section>
        <Skeleton className="mb-1.5 h-3 w-32" />
        <div className="overflow-hidden rounded-xl bg-(--ui-bg-tertiary)/70">
          {[0, 1, 2, 3].map(row => (
            <div className="flex items-center justify-between gap-3 border-b border-(--ui-stroke-tertiary)/80 px-3.5 py-3 last:border-b-0" key={row}>
              <div className="min-w-0 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-52 max-w-full" />
              </div>
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// Hermes' reasoning levels (VALID_REASONING_EFFORTS); `none` = thinking off.
// Empty config = Hermes default (medium), shown as Medium.
const EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

// agent.service_tier stores "fast"/"priority"/"on" for fast; anything else is
// normal (mirrors tui_gateway _load_service_tier).
const isFastTier = (tier: unknown): boolean =>
  ['fast', 'priority', 'on'].includes(
    String(tier ?? '')
      .trim()
      .toLowerCase()
  )

// Reuse the composer's effort labels (`xhigh` shows as "Max", else 1:1).
const effortLabelKey = (v: string) => (v === 'xhigh' ? 'max' : v) as 'high' | 'low' | 'max' | 'medium' | 'minimal'

// A provider row is "ready" to pick a model from when it reports models. The
// backend now surfaces the full `hermes model` universe (every canonical
// provider), so unconfigured providers come back with `authenticated:false`
// and an empty `models` list — those need a setup step before a model exists.
function isProviderReady(p?: ModelOptionProvider): boolean {
  return !!p && (p.authenticated !== false || (p.models?.length ?? 0) > 0)
}

// Mirrors `_AUX_TASK_SLOTS` in hermes_cli/web_server.py. Friendly labels and
// hints make the assignments readable; raw task keys (vision, mcp, …) are
// opaque to most users.
interface AuxTaskMeta {
  key: string
}

const AUX_TASKS: readonly AuxTaskMeta[] = [
  { key: 'vision' },
  { key: 'web_extract' },
  { key: 'compression' },
  { key: 'skills_hub' },
  { key: 'approval' },
  { key: 'mcp' },
  { key: 'title_generation' },
  { key: 'curator' }
]

const NO_PROVIDERS: readonly ModelOptionProvider[] = [{ name: '—', slug: '', models: [] }]

/** Curated council slots always bind to the unified catalog (OpenRouter under the hood). */
const MOA_CATALOG_PROVIDER = 'openrouter'

// Radix <Select> renders a blank trigger when `value` matches no <SelectItem>.
// A custom model (e.g. one added via config that isn't in the provider's
// curated list) would vanish — surface the active value so it stays selectable.
export const withActive = (models: readonly string[], active: string): readonly string[] =>
  active && !models.includes(active) ? [active, ...models] : models

interface StaleAuxWarningProps {
  applying: boolean
  onReset: () => void
  slots: readonly StaleAuxAssignment[]
  taskLabel: (key: string) => string
}

// Shared notice: auxiliary tasks still pinned to a provider that isn't the
// current main. Surfaces the silent credit-burn path (e.g. aux pinned to a
// $0-balance provider after switching main away from it) and offers the
// existing one-click reset rather than auto-clearing legitimate pins.
function StaleAuxWarning({ applying, onReset, slots, taskLabel }: StaleAuxWarningProps) {
  if (!slots.length) {
    return null
  }

  const provider = slots[0].provider
  const allSameProvider = slots.every(slot => slot.provider === provider)
  const names = slots.map(slot => taskLabel(slot.task)).join(', ')

  const { t } = useI18n()
  const m = t.settings.model

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-200">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="grow">
        {m.staleAuxWarning(slots.length, names, allSameProvider ? provider : m.otherProviders)}
      </span>
      <Button disabled={applying} onClick={onReset} size="sm" variant="textStrong">
        {m.resetAllToMain}
      </Button>
    </div>
  )
}

interface ModelSettingsProps {
  /** When true, skip the page intro (Models page owns the chrome). */
  embed?: boolean
  /** Notified after the main model is applied, so live UI stores can sync. */
  onMainModelChanged?: (provider: string, model: string) => void
}

export function ModelSettings({ embed = false, onMainModelChanged }: ModelSettingsProps) {
  const { t } = useI18n()
  const m = t.settings.model
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mainModel, setMainModel] = useState<{ model: string; provider: string } | null>(null)
  const [providers, setProviders] = useState<ModelOptionProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [auxiliary, setAuxiliary] = useState<AuxiliaryModelsResponse | null>(null)
  const [moa, setMoa] = useState<MoaConfigResponse | null>(null)
  // agent.* defaults round-trip through the shared config cache (read → write
  // back the whole record), so a save here shows in the MCP/config surfaces.
  const { data: config } = useHermesConfigRecord()
  const setConfig = setHermesConfigCache
  const storedVisible = useStore($visibleModels)
  const [applying, setApplying] = useState(false)
  const [editingAuxTask, setEditingAuxTask] = useState<null | string>(null)
  const [auxDraft, setAuxDraft] = useState<{ model: string; provider: string }>({ model: '', provider: '' })
  // Aux slots reported stale by the backend immediately after a main-model
  // switch (provider differs from the new main). Cleared on next switch/reset.
  const [switchStaleAux, setSwitchStaleAux] = useState<StaleAuxAssignment[]>([])
  // Inline API-key entry for picking an unconfigured `api_key` provider in
  // place — mirrors the onboarding ApiKeyForm but scoped to the model picker.
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [activating, setActivating] = useState(false)

  // Every profile-scoped async here captures this and bails before writing back,
  // so a request in flight when the user switches profiles can't paint profile
  // A's models/providers into profile B (or fire onMainModelChanged for A).
  const profileEpoch = useRef(0)

  const refresh = useCallback(async (opts?: { fullCatalog?: boolean }) => {
    const epoch = profileEpoch.current
    setLoading(true)
    setError('')

    try {
      if (SHOW_DEFAULT_AND_AUX_SURFACE) {
        // Critical path: paint primary + aux without waiting for MoA.
        const [modelInfo, modelOptions, auxiliaryModels] = await Promise.all([
          getGlobalModelInfo(),
          getGlobalModelOptions(),
          getAuxiliaryModels()
        ])

        if (profileEpoch.current !== epoch) {
          return
        }

        setMainModel({ model: modelInfo.model, provider: modelInfo.provider })
        setProviders(modelOptions.providers || [])
        setSelectedProvider(prev => prev || modelInfo.provider)
        setSelectedModel(prev => prev || modelInfo.model)
        setAuxiliary(auxiliaryModels)
        setLoading(false)

        // MoA is power-user surface — load after first paint.
        void getMoaModels()
          .then(moaModels => {
            if (profileEpoch.current !== epoch) return
          setMoa(moaModels)
        })
        .catch(() => {
          if (profileEpoch.current === epoch) setMoa(null)
        })
      } else {
        // Curated page is MoA-only: catalog for slot pickers + MoA config together.
        const [modelOptions, moaModels] = await Promise.all([getGlobalModelOptions(), getMoaModels()])

        if (profileEpoch.current !== epoch) {
          return
        }

        setProviders(modelOptions.providers || [])
        setMoa(moaModels)
        setLoading(false)
      }

      if (opts?.fullCatalog) {
        void invalidateHermesConfig()
      }
    } catch (err) {
      if (profileEpoch.current === epoch) {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A profile switch swaps the backend under the mounted panel — reload for the
  // new profile (bumping the epoch first so any in-flight A request is discarded).
  useOnProfileSwitch(() => {
    profileEpoch.current += 1
    void refresh()
  })

  const providerOptions = useMemo(() => {
    const filtered = prepareW4yPickerProviders(providers)
    return filtered.length ? filtered : NO_PROVIDERS
  }, [providers])

  const visibilityProviders = useMemo(
    () => prepareW4yPickerProviders(providers).filter(provider => (provider.models ?? []).length > 0),
    [providers]
  )
  const visibleKeys = useMemo(
    () => effectiveVisibleKeys(storedVisible, visibilityProviders),
    [storedVisible, visibilityProviders]
  )

  // MoA reference/aggregator slots must never be the moa virtual provider —
  // that would create a recursive MoA tree (the backend rejects it on save).
  // Curated council: unified catalog filtered to Settings → Models toggles.
  const moaCatalogModels = useMemo(() => {
    const row = providers.find(provider => (provider.slug || '').toLowerCase() === MOA_CATALOG_PROVIDER)
    return filterActiveModels(row?.models ?? [], MOA_CATALOG_PROVIDER, visibleKeys)
  }, [providers, visibleKeys])

  const selectedProviderRow = useMemo(
    () => providers.find(provider => provider.slug === selectedProvider),
    [providers, selectedProvider]
  )

  const selectedProviderModels = useMemo(
    () => filterActiveModels(selectedProviderRow?.models ?? [], selectedProvider, visibleKeys),
    [selectedProvider, selectedProviderRow, visibleKeys]
  )

  // An unconfigured provider was picked: no credentials yet, so there are no
  // models to choose. `api_key` providers can be activated inline (paste key);
  // OAuth / external flows hand off to the onboarding sign-in.
  const needsSetup = !!selectedProvider && !isProviderReady(selectedProviderRow)
  const setupIsApiKey = needsSetup && selectedProviderRow?.auth_type === 'api_key' && !!selectedProviderRow?.key_env

  // Clear any half-typed key when switching provider so it can't leak across.
  useEffect(() => {
    setApiKeyDraft('')
  }, [selectedProvider])

  const auxDraftProviderModels = useMemo(
    () =>
      filterActiveModels(
        providers.find(provider => provider.slug === auxDraft.provider)?.models ?? [],
        auxDraft.provider,
        visibleKeys
      ),
    [auxDraft.provider, providers, visibleKeys]
  )

  const currentMoaPresetName = useMemo(() => {
    if (!moa) {
      return ''
    }

    if (moa.default_preset && moa.presets[moa.default_preset]) {
      return moa.default_preset
    }

    return Object.keys(moa.presets)[0] || ''
  }, [moa])

  const currentMoaPreset = useMemo(() => {
    if (!moa || !currentMoaPresetName) {
      return null
    }

    return moa.presets[currentMoaPresetName] || null
  }, [moa, currentMoaPresetName])

  const updateMoaPreset = useCallback(
    (updater: (preset: NonNullable<typeof currentMoaPreset>) => NonNullable<typeof currentMoaPreset>) => {
      setMoa(prev => {
        if (!prev || !currentMoaPresetName || !prev.presets[currentMoaPresetName]) {
          return prev
        }

        return {
          ...prev,
          presets: {
            ...prev.presets,
            [currentMoaPresetName]: updater(prev.presets[currentMoaPresetName])
          }
        }
      })
    },
    [currentMoaPresetName]
  )

  const updateMoaSlot = useCallback((slot: MoaModelSlot, patch: Partial<MoaModelSlot>): MoaModelSlot => {
    const next = { ...slot, ...patch }

    if (patch.provider && patch.model === undefined) {
      next.model = ''
    }

    return next
  }, [])

  const setCouncilModel = useCallback(
    (kind: 'aggregator' | 'reference', model: string, index = 0) => {
      updateMoaPreset(prev => {
        if (kind === 'aggregator') {
          return {
            ...prev,
            aggregator: updateMoaSlot(prev.aggregator, { provider: MOA_CATALOG_PROVIDER, model })
          }
        }

        return {
          ...prev,
          reference_models: prev.reference_models.map((slot, i) =>
            i === index ? updateMoaSlot(slot, { provider: MOA_CATALOG_PROVIDER, model }) : slot
          )
        }
      })
    },
    [updateMoaPreset, updateMoaSlot]
  )

  const saveMoa = useCallback(async (next: MoaConfigResponse) => {
    const epoch = profileEpoch.current
    setApplying(true)
    setError('')

    // Curated face locks every seat to the catalog provider before persist.
    const presets = Object.fromEntries(
      Object.entries(next.presets).map(([name, preset]) => [
        name,
        {
          ...preset,
          aggregator: { ...preset.aggregator, provider: MOA_CATALOG_PROVIDER },
          reference_models: preset.reference_models.map(slot => ({
            ...slot,
            provider: MOA_CATALOG_PROVIDER
          }))
        }
      ])
    )

    try {
      const saved = await saveMoaModels({ ...next, presets })

      if (profileEpoch.current !== epoch) {
        return
      }

      setMoa(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }, [])

  const auxiliaryTaskLabel = useCallback((key: string) => m.tasks[key]?.label ?? key, [m.tasks])

  // Persistent mismatch: any aux slot pinned to a provider different from the
  // current main, regardless of whether the user just switched. Catches the
  // "I pinned aux months ago and forgot, now it bills a dead provider" case.
  const persistentStaleAux = useMemo<StaleAuxAssignment[]>(() => {
    const mainProvider = (mainModel?.provider ?? '').toLowerCase()

    if (!mainProvider || !auxiliary) {
      return []
    }

    return auxiliary.tasks
      .filter(entry => {
        const p = (entry.provider ?? '').toLowerCase()

        return p && p !== 'auto' && p !== mainProvider
      })
      .map(entry => ({ task: entry.task, provider: entry.provider, model: entry.model }))
  }, [auxiliary, mainModel])

  // Capabilities of the APPLIED main model — gates the profile-default
  // reasoning/speed controls the same way the composer picker gates per-model
  // edits (reasoning defaults on, fast defaults off when unreported).
  const mainCaps = useMemo(() => {
    const row = providers.find(provider => provider.slug === mainModel?.provider)

    return mainModel ? row?.capabilities?.[mainModel.model] : undefined
  }, [providers, mainModel])

  const reasoningSupported = mainCaps?.reasoning ?? true
  const fastSupported = mainCaps?.fast ?? false

  // Hand-written `reasoning_effort: false`/`off` reaches us as boolean false
  // ("false" once stringified) — show it as Off, not an empty select.
  const rawEffort = String(getNested(config ?? {}, 'agent.reasoning_effort') ?? '')
    .trim()
    .toLowerCase()

  const effortValue = rawEffort === 'false' || rawEffort === 'disabled' ? 'none' : rawEffort || 'medium'

  const fastOn = isFastTier(getNested(config ?? {}, 'agent.service_tier'))

  // Persist a single agent.* default by round-tripping the whole config record
  // (PUT /api/config replaces it) — optimistic, with rollback on failure.
  const writeAgentDefault = useCallback(
    async (key: string, value: string) => {
      if (!config) {
        return
      }

      const prev = config
      const next = setNested(config, key, value)
      setConfig(next)

      try {
        await saveHermesConfig(next)
      } catch (err) {
        setConfig(prev)
        notifyError(err, m.defaultsFailed)
      }
    },
    [config, m.defaultsFailed]
  )

  // Paste an API key for the selected `api_key` provider, persist it, then
  // refresh so the now-authenticated provider's models populate. Auto-selects
  // the recommended default model so the user can Apply in one more click.
  const activateApiKeyProvider = useCallback(async () => {
    const keyEnv = selectedProviderRow?.key_env
    const slug = selectedProviderRow?.slug

    if (!keyEnv || !slug || !apiKeyDraft.trim()) {
      return
    }

    const epoch = profileEpoch.current
    setActivating(true)
    setError('')

    try {
      await setEnvVar(keyEnv, apiKeyDraft.trim())
      setApiKeyDraft('')

      // Pick a sensible default for the freshly-activated provider (mirrors
      // `hermes model` curation). Best-effort — fall through to the refreshed
      // model list if it fails.
      let nextModel = ''

      try {
        const rec = await getRecommendedDefaultModel(slug)
        nextModel = rec.model || ''
      } catch {
        nextModel = ''
      }

      const options = await getGlobalModelOptions()

      if (profileEpoch.current !== epoch) {
        return
      }

      setProviders(options.providers || [])
      const refreshedRow = options.providers?.find(p => p.slug === slug)
      const fallbackModel = refreshedRow?.models?.[0] ?? ''
      setSelectedModel(nextModel || fallbackModel)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setActivating(false)
    }
  }, [apiKeyDraft, selectedProviderRow])

  // OAuth / external providers can't be activated with a pasted key — hand off
  // to the shared onboarding flow scoped to this provider's real sign-in. The
  // custom / local endpoint is NOT an OAuth provider, so it gets the dedicated
  // local-endpoint form (URL + optional API key) instead of being dead-ended
  // on the OAuth picker (the original "booted back to the first screen" loop).
  const startProviderSetup = useCallback(() => {
    const slug = selectedProviderRow?.slug

    if (!slug) {
      return
    }

    const lower = slug.toLowerCase()

    if (lower === 'custom' || lower === 'local' || lower.startsWith('custom:')) {
      startManualLocalEndpoint()
    } else {
      startManualProviderOAuth(slug)
    }
  }, [selectedProviderRow])

  const applyMainModel = useCallback(async () => {
    if (!selectedProvider || !selectedModel) {
      return
    }

    const epoch = profileEpoch.current
    setApplying(true)
    setError('')

    try {
      const result = await setModelAssignment({ model: selectedModel, provider: selectedProvider, scope: 'main' })

      if (profileEpoch.current !== epoch) {
        return
      }

      const provider = result.provider || selectedProvider
      const model = result.model || selectedModel
      setMainModel({ provider, model })
      setSwitchStaleAux(result.stale_aux ?? [])
      onMainModelChanged?.(provider, model)
      // Aux slots may have changed server-side; skip full MoA/catalog wait.
      const auxiliaryModels = await getAuxiliaryModels()
      if (profileEpoch.current === epoch) {
        setAuxiliary(auxiliaryModels)
      }
      void invalidateHermesConfig()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }, [onMainModelChanged, selectedModel, selectedProvider])

  const setAuxiliaryToMain = useCallback(
    async (task: string) => {
      if (!mainModel) {
        return
      }

      setApplying(true)
      setError('')

      try {
        await setModelAssignment({ model: mainModel.model, provider: mainModel.provider, scope: 'auxiliary', task })
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setApplying(false)
      }
    },
    [mainModel, refresh]
  )

  const applyAuxiliaryDraft = useCallback(
    async (task: string) => {
      if (!auxDraft.provider || !auxDraft.model) {
        return
      }

      setApplying(true)
      setError('')

      try {
        await setModelAssignment({ model: auxDraft.model, provider: auxDraft.provider, scope: 'auxiliary', task })
        setEditingAuxTask(null)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setApplying(false)
      }
    },
    [auxDraft, refresh]
  )

  const beginAuxiliaryEdit = useCallback(
    (task: string) => {
      const current = auxiliary?.tasks.find(entry => entry.task === task)

      const initialProvider =
        current?.provider && current.provider !== 'auto' ? current.provider : (mainModel?.provider ?? '')

      const initialModel = current?.model || mainModel?.model || ''
      setAuxDraft({ provider: initialProvider, model: initialModel })
      setEditingAuxTask(task)
    },
    [auxiliary, mainModel]
  )

  const resetAuxiliaryModels = useCallback(async () => {
    if (!mainModel) {
      return
    }

    setApplying(true)
    setError('')

    try {
      await setModelAssignment({
        model: mainModel.model,
        provider: mainModel.provider,
        scope: 'auxiliary',
        task: '__reset__'
      })
      setSwitchStaleAux([])
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }, [mainModel, refresh])

  if (loading) {
    return <ModelSettingsSkeleton />
  }

  return (
    <div className="grid gap-0">
      {!SHOW_DEFAULT_AND_AUX_SURFACE && !embed && (
        <p className="mb-4 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {m.pageIntro}
        </p>
      )}

      {SHOW_DEFAULT_AND_AUX_SURFACE && (
      <>
      <SettingsGroup
        footer={
          <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {m.appliesDesc}
          </p>
        }
        title={m.defaultGroup}
      >
        <div className="px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select onValueChange={setSelectedProvider} value={selectedProvider}>
              <SelectTrigger className={cn('min-w-40', CONTROL_TEXT)}>
                <SelectValue placeholder={m.provider} />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map(provider => (
                  <SelectItem key={provider.slug || 'none'} value={provider.slug || 'none'}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsSetup ? (
              setupIsApiKey ? (
                <>
                  <Input
                    autoComplete="off"
                    className={cn('min-w-60 flex-1', CONTROL_TEXT)}
                    onChange={event => setApiKeyDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        void activateApiKeyProvider()
                      }
                    }}
                    placeholder={m.pasteApiKey(selectedProviderRow?.key_env ?? 'API key')}
                    type="password"
                    value={apiKeyDraft}
                  />
                  <Button
                    disabled={!apiKeyDraft.trim() || activating}
                    onClick={() => void activateApiKeyProvider()}
                    size="sm"
                  >
                    {activating && <Loader2 className="size-3.5 animate-spin" />}
                    {activating ? m.activating : m.activate}
                  </Button>
                </>
              ) : (
                <Button onClick={startProviderSetup} size="sm" variant="textStrong">
                  {m.setupProvider(selectedProviderRow?.name ?? m.provider)}
                </Button>
              )
            ) : (
              <>
                <Select onValueChange={setSelectedModel} value={selectedModel}>
                  <SelectTrigger className={cn('min-w-60', CONTROL_TEXT)}>
                    <SelectValue placeholder={m.model} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedProviderModels.map(model => (
                      <SelectItem key={model} value={model}>
                        {modelLabel(model)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!selectedProvider || !selectedModel || applying}
                  onClick={() => void applyMainModel()}
                  size="sm"
                >
                  {applying && <Loader2 className="size-3.5 animate-spin" />}
                  {applying ? m.applying : t.common.apply}
                </Button>
              </>
            )}
          </div>
          {needsSetup && !setupIsApiKey && (
            <p className="mt-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
              {selectedProviderRow?.auth_type === 'api_key'
                ? m.setupNeedsKey(selectedProviderRow?.name ?? m.provider)
                : m.setupNeedsBrowser(selectedProviderRow?.name ?? m.provider)}
            </p>
          )}
          {config && mainModel && (reasoningSupported || fastSupported) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                {m.defaultsLabel}
              </span>
              {reasoningSupported && (
                <div className="flex items-center gap-2 text-[length:var(--conversation-caption-font-size)]">
                  {m.reasoning}
                  <Select
                    onValueChange={value => void writeAgentDefault('agent.reasoning_effort', value)}
                    value={effortValue}
                  >
                    <SelectTrigger className={cn('min-w-28', CONTROL_TEXT)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EFFORT_VALUES.map(value => (
                        <SelectItem key={value} value={value}>
                          {value === 'none' ? m.reasoningOff : t.shell.modelOptions[effortLabelKey(value)]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {fastSupported && (
                <label className="flex items-center gap-2 text-[length:var(--conversation-caption-font-size)]">
                  {t.shell.modelOptions.fast}
                  <Switch
                    checked={fastOn}
                    onCheckedChange={checked => void writeAgentDefault('agent.service_tier', checked ? 'fast' : 'normal')}
                    size="xs"
                  />
                </label>
              )}
            </div>
          )}
          {error && <div className="mt-2 text-xs text-destructive">{error}</div>}
          {switchStaleAux.length > 0 && (
            <div className="mt-2">
              <StaleAuxWarning
                applying={applying}
                onReset={() => void resetAuxiliaryModels()}
                slots={switchStaleAux}
                taskLabel={auxiliaryTaskLabel}
              />
            </div>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
              {m.auxiliaryDesc}
            </p>
            <Button
              disabled={!mainModel || applying}
              onClick={() => void resetAuxiliaryModels()}
              size="sm"
              variant="textStrong"
            >
              {m.resetAllToMain}
            </Button>
          </div>
        }
        title={m.auxiliaryTitle}
      >
        {switchStaleAux.length === 0 && persistentStaleAux.length > 0 && (
          <div className="border-b border-(--ui-stroke-tertiary)/80 px-3.5 py-2.5">
            <StaleAuxWarning
              applying={applying}
              onReset={() => void resetAuxiliaryModels()}
              slots={persistentStaleAux}
              taskLabel={auxiliaryTaskLabel}
            />
          </div>
        )}
        {AUX_TASKS.map(meta => {
          const copy = m.tasks[meta.key] ?? { label: meta.key, hint: meta.key }
          const current = auxiliary?.tasks.find(entry => entry.task === meta.key)
          const isAuto = !current || !current.provider || current.provider === 'auto'
          const isEditing = editingAuxTask === meta.key

          return (
            <ListRow
              action={
                !isEditing && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      disabled={!mainModel || applying}
                      onClick={() => void setAuxiliaryToMain(meta.key)}
                      size="sm"
                      variant="text"
                    >
                      {m.setToMain}
                    </Button>
                    <Button
                      disabled={!providers.length || applying}
                      onClick={() => beginAuxiliaryEdit(meta.key)}
                      size="sm"
                      variant="textStrong"
                    >
                      {m.change}
                    </Button>
                  </div>
                )
              }
              below={
                isEditing && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pt-1">
                    <Select
                      onValueChange={value => setAuxDraft(prev => ({ ...prev, provider: value, model: '' }))}
                      value={auxDraft.provider}
                    >
                      <SelectTrigger className={cn('min-w-32', CONTROL_TEXT)}>
                        <SelectValue placeholder={m.provider} />
                      </SelectTrigger>
                      <SelectContent>
                        {providerOptions.map(provider => (
                          <SelectItem key={provider.slug || 'none'} value={provider.slug || 'none'}>
                            {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      onValueChange={value => setAuxDraft(prev => ({ ...prev, model: value }))}
                      value={auxDraft.model}
                    >
                      <SelectTrigger className={cn('min-w-48', CONTROL_TEXT)}>
                        <SelectValue placeholder={m.model} />
                      </SelectTrigger>
                      <SelectContent>
                        {auxDraftProviderModels.map(model => (
                          <SelectItem key={model} value={model}>
                            {modelLabel(model)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      disabled={!auxDraft.provider || !auxDraft.model || applying}
                      onClick={() => void applyAuxiliaryDraft(meta.key)}
                      size="sm"
                    >
                      {applying ? m.applying : t.common.apply}
                    </Button>
                    <Button onClick={() => setEditingAuxTask(null)} size="sm" variant="ghost">
                      {t.common.cancel}
                    </Button>
                  </div>
                )
              }
              description={
                <span className="font-mono text-[0.68rem]">
                  {isAuto ? m.autoUseMain : `${current.provider} · ${current.model || m.providerDefault}`}
                </span>
              }
              inset
              key={meta.key}
              title={
                <span className="flex items-baseline gap-2">
                  {copy.label}
                  <Pill>{copy.hint}</Pill>
                </span>
              }
            />
          )
        })}
      </SettingsGroup>
      </>
      )}

      {moa && currentMoaPreset ? (
        <>
          <SettingsGroup
            footer={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
                  {m.moaDesc}
                </p>
                <Button disabled={applying} onClick={() => void saveMoa(moa)} size="sm" variant="textStrong">
                  {applying ? m.applying : t.common.save}
                </Button>
              </div>
            }
            title={m.moaTitle}
          >
            <div className="px-3.5 py-3">
              <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
                {m.moaIntro}
              </p>
            </div>
          </SettingsGroup>

          <SettingsGroup
            footer={
              <Button
                disabled={applying}
                onClick={() =>
                  updateMoaPreset(prev => ({
                    ...prev,
                    reference_models: [
                      ...prev.reference_models,
                      { provider: MOA_CATALOG_PROVIDER, model: prev.aggregator.model || '' }
                    ]
                  }))
                }
                size="sm"
                variant="textStrong"
              >
                {m.moaAddReference}
              </Button>
            }
            title={m.moaAdvisorsSection}
          >
            {currentMoaPreset.reference_models.map((slot, index) => (
              <ListRow
                action={
                  <Button
                    disabled={currentMoaPreset.reference_models.length <= 1 || applying}
                    onClick={() =>
                      updateMoaPreset(prev => ({
                        ...prev,
                        reference_models: prev.reference_models.filter((_, i) => i !== index)
                      }))
                    }
                    size="sm"
                    variant="ghost"
                  >
                    {t.common.remove}
                  </Button>
                }
                below={
                  <div className="mt-2 pt-1">
                    <Select onValueChange={value => setCouncilModel('reference', value, index)} value={slot.model}>
                      <SelectTrigger className={cn('w-full min-w-48', CONTROL_TEXT)}>
                        <SelectValue placeholder={m.model} />
                      </SelectTrigger>
                      <SelectContent>
                        {moaCatalogModels.map(model => (
                          <SelectItem key={model} value={model}>
                            {modelLabel(model)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                }
                description={m.moaAdvisorHint}
                inset
                key={`advisor-${index}-${slot.model}`}
                title={m.moaReference(index + 1)}
              />
            ))}
          </SettingsGroup>

          <SettingsGroup title={m.moaChairSection}>
            <ListRow
              below={
                <div className="mt-2 pt-1">
                  <Select
                    onValueChange={value => setCouncilModel('aggregator', value)}
                    value={currentMoaPreset.aggregator.model}
                  >
                    <SelectTrigger className={cn('w-full min-w-48', CONTROL_TEXT)}>
                      <SelectValue placeholder={m.model} />
                    </SelectTrigger>
                    <SelectContent>
                      {moaCatalogModels.map(model => (
                        <SelectItem key={model} value={model}>
                          {modelLabel(model)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
              description={m.moaChairHint}
              inset
              title={m.moaAggregator}
            />
          </SettingsGroup>
        </>
      ) : !loading ? (
        <SettingsGroup title={m.moaTitle}>
          <p className="px-3.5 py-3 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
            {m.moaUnavailable}
          </p>
        </SettingsGroup>
      ) : null}
      {error && !SHOW_DEFAULT_AND_AUX_SURFACE && (
        <div className="mt-2 text-xs text-destructive">{error}</div>
      )}
    </div>
  )
}
