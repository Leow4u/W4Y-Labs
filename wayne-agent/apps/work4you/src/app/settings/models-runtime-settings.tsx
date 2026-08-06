/**
 * Settings → Models — subagent model/effort + context/fallback overrides.
 * Product copy never names the catalog provider (OpenRouter under the hood).
 */
import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getGlobalModelOptions } from '@/hermes'
import { useAccountPlanGating } from '@/hooks/use-account-plan-gating'
import { useI18n } from '@/i18n'
import { filterModelsForPlan } from '@/lib/plan-model-gating'
import { openUpgrade } from '@/lib/plans'
import { X } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { modelLabel, prepareW4yPickerProviders } from '@/lib/w4y-featured-models'
import {
  $visibleModels,
  effectiveVisibleKeys,
  modelVisibilityKey
} from '@/store/model-visibility'
import type { ConfigFieldSchema, HermesConfigRecord, ModelOptionProvider } from '@/types/hermes'

import { useEditableHermesConfig } from '../hooks/use-editable-hermes-config'
import { PanelEmpty } from '../overlays/panel'

import { ConfigField } from './config-field'
import { CONTROL_TEXT, EMPTY_SELECT_VALUE } from './constants'
import { enumOptionsFor, getNested, setNested } from './helpers'
import { ListRow, SettingsGroup } from './primitives'

interface ModelsRuntimeSettingsProps {
  onConfigSaved?: () => void
}

interface ActiveModelOption {
  key: string
  label: string
  model: string
  provider: string
}

interface FallbackEntry {
  model: string
  provider: string
}

function activeModelOptions(providers: readonly ModelOptionProvider[], visible: Set<string>): ActiveModelOption[] {
  const options: ActiveModelOption[] = []
  const seenModels = new Set<string>()

  for (const provider of providers) {
    for (const model of provider.models ?? []) {
      const key = modelVisibilityKey(provider.slug, model)
      if (!visible.has(key)) continue
      // Same model id can appear under multiple provider rows; show once.
      if (seenModels.has(model)) continue
      seenModels.add(model)
      options.push({
        key,
        provider: provider.slug,
        model,
        label: modelLabel(model)
      })
    }
  }

  return options
}

function parseFallbackEntries(raw: unknown): FallbackEntry[] {
  if (!Array.isArray(raw)) return []
  const out: FallbackEntry[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const provider = String((entry as FallbackEntry).provider ?? '').trim()
    const model = String((entry as FallbackEntry).model ?? '').trim()
    if (!provider || !model) continue
    out.push({ provider, model })
  }
  return out
}

function useActiveModels() {
  const stored = useStore($visibleModels)
  const { plan, isLocked } = useAccountPlanGating()
  const modelOptions = useQuery({
    queryKey: ['model-options', 'settings-models'],
    queryFn: () => getGlobalModelOptions()
  })
  const providers = useMemo(
    () => prepareW4yPickerProviders(modelOptions.data?.providers).filter(p => (p.models ?? []).length > 0),
    [modelOptions.data]
  )
  const visible = useMemo(() => effectiveVisibleKeys(stored, providers, plan), [plan, providers, stored])
  const options = useMemo(() => activeModelOptions(providers, visible), [providers, visible])
  return { isLocked, options }
}

function SubagentModelPicker({
  config,
  onChange
}: {
  config: HermesConfigRecord
  onChange: (next: HermesConfigRecord) => void
}) {
  const { t } = useI18n()
  const m = t.settings.model
  const fieldCopy = t.settings.advancedPage.fields['delegation.model']
  const { isLocked, options } = useActiveModels()

  const currentProvider = String(getNested(config, 'delegation.provider') ?? '').trim()
  const currentModel = String(getNested(config, 'delegation.model') ?? '').trim()

  const currentKey = useMemo(() => {
    if (!currentModel) return ''
    if (currentProvider) {
      const exact = modelVisibilityKey(currentProvider, currentModel)
      if (options.some(o => o.key === exact)) return exact
    }
    const byModel = options.find(o => o.model === currentModel)
    if (byModel) return byModel.key
    return currentProvider ? modelVisibilityKey(currentProvider, currentModel) : currentModel
  }, [currentModel, currentProvider, options])

  const orphanOption =
    currentModel && !options.some(o => o.key === currentKey)
      ? {
          key: currentKey,
          label: modelLabel(currentModel),
          model: currentModel,
          provider: currentProvider
        }
      : null

  const allOptions = orphanOption ? [orphanOption, ...options] : options

  return (
    <ListRow
      action={
        <Select
          onValueChange={next => {
            if (next === EMPTY_SELECT_VALUE) {
              let nextConfig = setNested(config, 'delegation.model', '')
              nextConfig = setNested(nextConfig, 'delegation.provider', '')
              onChange(nextConfig)
              return
            }
            const picked = allOptions.find(o => o.key === next)
            if (!picked) return
            if (isLocked(picked.model)) {
              openUpgrade('essencial')
              return
            }
            let nextConfig = setNested(config, 'delegation.model', picked.model)
            nextConfig = setNested(nextConfig, 'delegation.provider', picked.provider)
            onChange(nextConfig)
          }}
          value={currentKey || EMPTY_SELECT_VALUE}
        >
          <SelectTrigger className={cn('min-w-44 max-w-64', CONTROL_TEXT)}>
            <SelectValue placeholder={m.inheritFromParent} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_SELECT_VALUE}>{m.inheritFromParent}</SelectItem>
            {allOptions.map(option => (
              <SelectItem
                disabled={isLocked(option.model) && option.key !== currentKey}
                key={option.key}
                value={option.key}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      description={fieldCopy?.description ?? m.subagentsIntro}
      inset
      title={fieldCopy?.label ?? m.subagentsGroup}
    />
  )
}

function ContextLimitRow({
  config,
  onChange
}: {
  config: HermesConfigRecord
  onChange: (next: HermesConfigRecord) => void
}) {
  const { t } = useI18n()
  const m = t.settings.model
  const raw = getNested(config, 'model_context_length')
  const tokens = typeof raw === 'number' ? raw : Number(raw) || 0
  const isAuto = tokens <= 0

  return (
    <ListRow
      action={
        <div className="flex flex-col items-stretch gap-2 @2xl:items-end">
          <Select
            onValueChange={next => {
              if (next === 'auto') {
                onChange(setNested(config, 'model_context_length', 0))
                return
              }
              onChange(setNested(config, 'model_context_length', tokens > 0 ? tokens : 128_000))
            }}
            value={isAuto ? 'auto' : 'custom'}
          >
            <SelectTrigger className={cn('min-w-44 max-w-72', CONTROL_TEXT)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{m.contextLimitAuto}</SelectItem>
              <SelectItem value="custom">{m.contextLimitCustom}</SelectItem>
            </SelectContent>
          </Select>
          {!isAuto ? (
            <Input
              className={cn('w-36', CONTROL_TEXT)}
              inputMode="numeric"
              onChange={e => {
                const n = Number(e.target.value.replace(/[^\d]/g, ''))
                if (!Number.isNaN(n)) {
                  onChange(setNested(config, 'model_context_length', Math.max(0, n)))
                }
              }}
              placeholder={m.contextLimitTokensPlaceholder}
              type="text"
              value={tokens > 0 ? String(tokens) : ''}
            />
          ) : null}
        </div>
      }
      description={m.contextLimitDesc}
      inset
      title={m.contextLimitLabel}
    />
  )
}

function FallbackModelsRow({
  config,
  onChange
}: {
  config: HermesConfigRecord
  onChange: (next: HermesConfigRecord) => void
}) {
  const { t } = useI18n()
  const m = t.settings.model
  const [addNonce, setAddNonce] = useState(0)
  const { options } = useActiveModels()
  const selected = parseFallbackEntries(getNested(config, 'fallback_providers'))
  const selectedKeys = new Set(selected.map(e => modelVisibilityKey(e.provider, e.model)))
  const availableToAdd = options.filter(o => !selectedKeys.has(o.key))

  const setChain = (next: FallbackEntry[]) => {
    onChange(setNested(config, 'fallback_providers', next))
  }

  const removeAt = (index: number) => {
    setChain(selected.filter((_, i) => i !== index))
  }

  const addModel = (key: string) => {
    const picked = options.find(o => o.key === key)
    if (!picked || selectedKeys.has(picked.key)) return
    setChain([...selected, { provider: picked.provider, model: picked.model }])
    setAddNonce(n => n + 1)
  }

  return (
    <div className="scroll-mt-6 border-t border-border/40 px-3.5 py-2.5 first:border-t-0">
      <div className="min-w-0">
        <div className="text-[length:var(--conversation-text-font-size)] font-medium text-foreground">
          {m.fallbackLabel}
        </div>
        <div className="mt-0.5 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {m.fallbackDesc}
        </div>
      </div>

      {selected.length > 0 ? (
        <ol className="mt-2.5 space-y-1.5">
          {selected.map((entry, index) => (
            <li
              className="flex items-center gap-2 rounded-lg bg-background/70 px-2.5 py-1.5"
              key={`${entry.provider}::${entry.model}::${index}`}
            >
              <span className="w-4 shrink-0 text-center text-[0.7rem] tabular-nums text-(--ui-text-tertiary)">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[length:var(--conversation-text-font-size)] text-foreground">
                {modelLabel(entry.model)}
              </span>
              <Button
                aria-label={m.fallbackRemove}
                className="shrink-0"
                onClick={() => removeAt(index)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
          {m.fallbackEmpty}
        </p>
      )}

      {availableToAdd.length > 0 ? (
        <div className="mt-2.5">
          <Select key={addNonce} onValueChange={addModel}>
            <SelectTrigger className={cn('w-full max-w-xs', CONTROL_TEXT)}>
              <SelectValue placeholder={m.fallbackAdd} />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.map(option => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  )
}

export function ModelsRuntimeSettings({ onConfigSaved }: ModelsRuntimeSettingsProps) {
  const { t } = useI18n()
  const m = t.settings.model
  const c = t.settings.config
  const fieldCopy = t.settings.advancedPage.fields

  const {
    config,
    schema,
    updateConfig,
    configLoadFailed,
    schemaFailed,
    refetchConfig,
    refetchSchema
  } = useEditableHermesConfig({
    autosaveFailedMessage: c.autosaveFailed,
    onConfigSaved
  })

  const byKey = useMemo(() => {
    const map = new Map<string, ConfigFieldSchema>()
    if (!schema) return map
    if (schema['delegation.reasoning_effort']) {
      map.set('delegation.reasoning_effort', schema['delegation.reasoning_effort'])
    }
    return map
  }, [schema])

  if ((configLoadFailed && !config) || (schemaFailed && !schema)) {
    return (
      <PanelEmpty
        action={
          <Button
            onClick={() => {
              void refetchConfig()
              void refetchSchema()
            }}
            size="sm"
          >
            {t.skills.refresh}
          </Button>
        }
        icon="error"
        title={c.failedLoad}
      />
    )
  }

  // Don't replace the Models page with a full LoadingState — featured toggles
  // above stay interactive while runtime fields warm from cache/network.
  if (!config || !schema) {
    return null
  }

  const reasoningField = byKey.get('delegation.reasoning_effort')
  const subagentVisible = Boolean(schema['delegation.model'] || reasoningField)
  const overrideVisible = Boolean(schema.model_context_length || schema.fallback_providers)

  if (!subagentVisible && !overrideVisible) {
    return null
  }

  return (
    <>
      {subagentVisible ? (
        <SettingsGroup
          footer={
            <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
              {m.subagentsIntro}
            </p>
          }
          title={m.subagentsGroup}
        >
          {schema['delegation.model'] ? (
            <SubagentModelPicker config={config} onChange={updateConfig} />
          ) : null}

          {reasoningField ? (
            <ConfigField
              descriptionOverride={fieldCopy['delegation.reasoning_effort']?.description}
              enumOptions={enumOptionsFor(
                'delegation.reasoning_effort',
                getNested(config, 'delegation.reasoning_effort'),
                config
              )}
              inset
              onChange={value => updateConfig(setNested(config, 'delegation.reasoning_effort', value))}
              optionLabels={{ '': m.inheritFromParent }}
              schema={reasoningField}
              schemaKey="delegation.reasoning_effort"
              titleOverride={fieldCopy['delegation.reasoning_effort']?.label}
              value={getNested(config, 'delegation.reasoning_effort')}
            />
          ) : null}
        </SettingsGroup>
      ) : null}

      {overrideVisible ? (
        <SettingsGroup
          footer={
            <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
              {m.overridesIntro}
            </p>
          }
          title={m.overridesGroup}
        >
          {schema.model_context_length ? <ContextLimitRow config={config} onChange={updateConfig} /> : null}
          {schema.fallback_providers ? <FallbackModelsRow config={config} onChange={updateConfig} /> : null}
        </SettingsGroup>
      ) : null}
    </>
  )
}
