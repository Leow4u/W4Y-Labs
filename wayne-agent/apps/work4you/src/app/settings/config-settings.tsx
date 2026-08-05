import type { ChangeEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { getElevenLabsVoices } from '@/hermes'
import { useI18n } from '@/i18n'
import { notify, notifyError } from '@/store/notifications'
import type { ConfigFieldSchema } from '@/types/hermes'

import { useEditableHermesConfig } from '../hooks/use-editable-hermes-config'
import { PanelEmpty } from '../overlays/panel'

import { ConfigField } from './config-field'
import { EDGE_TTS_VOICE_LABELS, IMAGE_INPUT_MODE_LABELS, SECTIONS } from './constants'
import { enumOptionsFor, getNested, prettyName, setNested } from './helpers'
import { MemoryConnect } from './memory/connect'
import { EmptyState, LoadingState, SettingsContent } from './primitives'
import { ProviderConfigPanel } from './provider-config-panel'
import { voiceFieldVisible } from './voice-field-visible'

export { voiceFieldVisible } from './voice-field-visible'

export function ConfigSettings({
  activeSectionId,
  onConfigSaved,
  importInputRef
}: {
  activeSectionId: string
  onConfigSaved?: () => void
  importInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { t } = useI18n()
  const c = t.settings.config
  // Draft + autosave via shared hook (sync-seeds from RQ cache when warm).
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
    hapticOnUpdate: false,
    onConfigSaved
  })

  const [elevenLabsVoiceOptions, setElevenLabsVoiceOptions] = useState<string[] | null>(null)
  const [elevenLabsVoiceLabels, setElevenLabsVoiceLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    getElevenLabsVoices()
      .then(result => {
        if (cancelled || !result.available) {
          return
        }

        setElevenLabsVoiceOptions(result.voices.map(voice => voice.voice_id))
        setElevenLabsVoiceLabels(Object.fromEntries(result.voices.map(voice => [voice.voice_id, voice.label])))
      })
      .catch(() => {
        if (!cancelled) {
          setElevenLabsVoiceOptions(null)
          setElevenLabsVoiceLabels({})
        }
      })

    return () => void (cancelled = true)
  }, [])

  const sectionFields = useMemo(() => {
    if (!schema) {
      return new Map<string, [string, ConfigFieldSchema][]>()
    }

    return new Map(
      SECTIONS.map(s => [s.id, s.keys.flatMap(k => (schema[k] ? [[k, schema[k]] as [string, ConfigFieldSchema]] : []))])
    )
  }, [schema])

  const fields = sectionFields.get(activeSectionId) ?? []

  // Deep-link target from the command palette (?field=<key>): scroll the row
  // into view and flash it, then drop the param so it doesn't re-fire.
  const [searchParams, setSearchParams] = useSearchParams()
  const targetField = searchParams.get('field')

  useEffect(() => {
    if (!targetField || !config || !schema) {
      return
    }

    const element = document.getElementById(`setting-field-${targetField}`)

    if (!element) {
      return
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element.classList.add('setting-field-highlight')

    const timeout = window.setTimeout(() => element.classList.remove('setting-field-highlight'), 1600)

    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous)
        next.delete('field')

        return next
      },
      { replace: true }
    )

    return () => window.clearTimeout(timeout)
  }, [config, schema, setSearchParams, targetField])

  function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      try {
        updateConfig(JSON.parse(String(reader.result)))
        notify({ kind: 'success', title: c.imported, message: t.common.saving })
      } catch (err) {
        notifyError(err, c.invalidJson)
      }
    }

    reader.readAsText(file)
    e.target.value = ''
  }

  if (!config || !schema) {
    // A failed config/schema fetch must surface a retry, not spin forever.
    if ((configLoadFailed && !config) || (schemaFailed && !schema)) {
      return (
        <div className="flex h-full min-h-0 flex-1">
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
        </div>
      )
    }

    return <LoadingState label={c.loading} />
  }

  const visibleFields = activeSectionId === 'voice' ? fields.filter(([key]) => voiceFieldVisible(key, config)) : fields

  return (
    <SettingsContent>
      {visibleFields.length === 0 ? (
        <EmptyState description={c.emptyDesc} title={c.emptyTitle} />
      ) : (
        <div className="grid gap-1">
          {visibleFields.map(([key, field]) => (
            <div className="scroll-mt-6 rounded-lg" id={`setting-field-${key}`} key={key}>
              <ConfigField
                descriptionExtra={
                  key === 'memory.provider' && Boolean(getNested(config, key)) ? (
                    <MemoryConnect provider={String(getNested(config, key))} />
                  ) : undefined
                }
                descriptionOverride={
                  t.settings.memoryPage.fields[key]?.description ?? t.settings.safety.fields[key]?.description
                }
                enumOptions={
                  key === 'tts.elevenlabs.voice_id'
                    ? enumOptionsFor(key, getNested(config, key), config, elevenLabsVoiceOptions ?? undefined)
                    : enumOptionsFor(key, getNested(config, key), config)
                }
                onChange={value => updateConfig(setNested(config, key, value))}
                optionLabels={
                  key === 'tts.elevenlabs.voice_id'
                    ? elevenLabsVoiceLabels
                    : key === 'tts.edge.voice'
                      ? EDGE_TTS_VOICE_LABELS
                      : key === 'agent.image_input_mode'
                        ? {
                            ...IMAGE_INPUT_MODE_LABELS,
                            ...c.imageModes
                          }
                        : key === 'display.personality'
                          ? (t.settings.general.personalities as Record<string, string>)
                          : key === 'memory.provider'
                            ? (Object.fromEntries(
                                (enumOptionsFor(key, getNested(config, key), config) ?? [])
                                  .filter(Boolean)
                                  .map(option => [
                                    option,
                                    t.settings.memoryPage.providers[option] ?? prettyName(option)
                                  ])
                              ) as Record<string, string>)
                            : undefined
                }
                schema={field}
                schemaKey={key}
                titleOverride={t.settings.memoryPage.fields[key]?.label ?? t.settings.safety.fields[key]?.label}
                value={getNested(config, key)}
              />
              {key === 'memory.provider' && typeof getNested(config, key) === 'string' && getNested(config, key) ? (
                <ProviderConfigPanel provider={String(getNested(config, key))} />
              ) : null}
            </div>
          ))}
        </div>
      )}
      <input
        accept=".json,application/json"
        className="hidden"
        onChange={handleImport}
        ref={importInputRef}
        type="file"
      />
    </SettingsContent>
  )
}
