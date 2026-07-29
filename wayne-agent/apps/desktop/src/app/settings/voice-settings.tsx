/**
 * Settings → Voice — PME card layout (same pattern as Geral / Aparência).
 * Keeps the full STT/TTS surface; only regroups + humanizes labels.
 * Desktop voice shortcut uses the keybind store (`composer.voice`), not
 * config.yaml `voice.record_key` (CLI/TUI).
 */
import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { KbdCombo } from '@/components/ui/kbd'
import { getElevenLabsVoices, speakText } from '@/hermes'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Loader2, Volume2 } from '@/lib/icons'
import { $bindings, openKeybindPanel } from '@/store/keybinds'
import { notifyError } from '@/store/notifications'
import { applyAutoSpeakFromConfig } from '@/store/voice-prefs'
import type { ConfigFieldSchema } from '@/types/hermes'

import { useEditableHermesConfig } from '../hooks/use-editable-hermes-config'
import { PanelEmpty } from '../overlays/panel'

import { ConfigField } from './config-field'
import { EDGE_TTS_VOICE_LABELS, SECTIONS } from './constants'
import { enumOptionsFor, getNested, setNested } from './helpers'
import { ListRow, LoadingState, SettingsContent, SettingsGroup, SettingsPageTitle } from './primitives'
import { voiceFieldVisible } from './voice-field-visible'

const VOICE_SECTION = SECTIONS.find(section => section.id === 'voice')

const SPEAKING_CORE = ['voice.auto_tts', 'tts.provider'] as const
const LISTENING_CORE = ['stt.enabled', 'stt.provider'] as const
const RECORDING_CORE = ['voice.max_recording_seconds'] as const
const VOICE_KEYBIND_ACTION = 'composer.voice' as const

/** Voice / voice_id fields that can be previewed via /api/audio/speak. */
const PREVIEWABLE_VOICE_KEYS = new Set([
  'tts.edge.voice',
  'tts.openai.voice',
  'tts.elevenlabs.voice_id',
  'tts.xai.voice_id',
  'tts.minimax.voice_id',
  'tts.mistral.voice_id',
  'tts.gemini.voice',
  'tts.kittentts.voice',
  'tts.piper.voice'
])

function previewSampleForVoice(voiceId: string): string {
  if (voiceId.startsWith('pt-')) {
    return 'Olá! Esta é uma prévia da voz selecionada.'
  }

  if (voiceId.startsWith('es-')) {
    return 'Hola. Esta es una vista previa de la voz seleccionada.'
  }

  return 'Hi! This is a preview of the selected voice.'
}

interface VoiceSettingsProps {
  onConfigSaved?: () => void
}

export function VoiceSettings({ onConfigSaved }: VoiceSettingsProps) {
  const { t } = useI18n()
  const v = t.settings.voice
  const c = t.settings.config

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
    onConfigSaved,
    onSeed: applyAutoSpeakFromConfig,
    onAfterSave: applyAutoSpeakFromConfig
  })

  const [elevenLabsVoiceOptions, setElevenLabsVoiceOptions] = useState<string[] | null>(null)
  const [elevenLabsVoiceLabels, setElevenLabsVoiceLabels] = useState<Record<string, string>>({})
  const [previewingKey, setPreviewingKey] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const bindings = useStore($bindings)
  const voiceCombo = bindings[VOICE_KEYBIND_ACTION]?.[0]

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
    }
  }, [])

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

    return () => {
      cancelled = true
    }
  }, [])

  const fields = useMemo(() => {
    if (!schema || !VOICE_SECTION) {
      return [] as [string, ConfigFieldSchema][]
    }

    return VOICE_SECTION.keys.flatMap(key => (schema[key] ? [[key, schema[key]] as [string, ConfigFieldSchema]] : []))
  }, [schema])

  const visible = useMemo(() => {
    if (!config) {
      return [] as [string, ConfigFieldSchema][]
    }

    return fields.filter(([key]) => voiceFieldVisible(key, config))
  }, [config, fields])

  const byKey = useMemo(() => new Map(visible), [visible])

  const ttsExtras = visible.filter(([key]) => key.startsWith('tts.') && key !== 'tts.provider')
  const sttExtras = visible.filter(
    ([key]) => key.startsWith('stt.') && key !== 'stt.enabled' && key !== 'stt.provider'
  )

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

  if (!config || !schema) {
    return <LoadingState label={c.loading} />
  }

  const previewVoice = (key: string) => {
    const voice = String(getNested(config, key) ?? '').trim()

    if (!voice || previewingKey) {
      return
    }

    const provider = String(getNested(config, 'tts.provider') ?? 'edge').trim() || 'edge'

    setPreviewingKey(key)
    triggerHaptic('selection')

    void (async () => {
      try {
        previewAudioRef.current?.pause()
        const response = await speakText(previewSampleForVoice(voice), { provider, voice })
        const audio = new Audio(response.data_url)
        previewAudioRef.current = audio
        await audio.play()
      } catch (error) {
        notifyError(error, v.previewFailed)
      } finally {
        setPreviewingKey(null)
      }
    })()
  }

  const renderField = (key: string) => {
    const field = byKey.get(key)

    if (!field) {
      return null
    }

    const copy = v.fields[key as keyof typeof v.fields]
    const canPreview = PREVIEWABLE_VOICE_KEYS.has(key) && Boolean(String(getNested(config, key) ?? '').trim())

    const busy = previewingKey === key

    return (
      <ConfigField
        actionAccessory={
          canPreview ? (
            <Button
              aria-label={busy ? v.previewing : v.previewVoice}
              disabled={previewingKey !== null}
              onClick={() => previewVoice(key)}
              size="icon-sm"
              title={busy ? v.previewing : v.previewVoice}
              type="button"
              variant="outline"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}
            </Button>
          ) : undefined
        }
        descriptionOverride={copy?.description}
        enumOptions={
          key === 'tts.elevenlabs.voice_id'
            ? enumOptionsFor(key, getNested(config, key), config, elevenLabsVoiceOptions ?? undefined)
            : enumOptionsFor(key, getNested(config, key), config)
        }
        inset
        key={key}
        onChange={value => updateConfig(setNested(config, key, value))}
        optionLabels={
          key === 'tts.elevenlabs.voice_id'
            ? elevenLabsVoiceLabels
            : key === 'tts.edge.voice'
              ? EDGE_TTS_VOICE_LABELS
              : undefined
        }
        schema={field}
        schemaKey={key}
        titleOverride={copy?.label}
        value={getNested(config, key)}
      />
    )
  }

  return (
    <SettingsContent>
      <div className="mx-auto w-full max-w-2xl pt-1">
        <SettingsPageTitle title={v.title} />

        <SettingsGroup title={v.speaking}>
          {SPEAKING_CORE.map(renderField)}
          {ttsExtras.map(([key]) => renderField(key))}
        </SettingsGroup>

        <SettingsGroup title={v.listening}>
          {LISTENING_CORE.map(renderField)}
          {sttExtras.map(([key]) => renderField(key))}
        </SettingsGroup>

        <SettingsGroup title={v.recording}>
          <ListRow
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {voiceCombo ? (
                  <KbdCombo combo={voiceCombo} />
                ) : (
                  <span className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                    {v.shortcutUnbound}
                  </span>
                )}
                <Button
                  onClick={() => {
                    triggerHaptic('open')
                    openKeybindPanel()
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {v.manageShortcut}
                </Button>
              </div>
            }
            description={v.shortcutDesc}
            inset
            title={v.shortcut}
          />
          {RECORDING_CORE.map(renderField)}
        </SettingsGroup>
      </div>
    </SettingsContent>
  )
}
