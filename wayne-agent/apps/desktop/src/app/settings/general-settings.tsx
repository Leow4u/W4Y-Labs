/**
 * Settings → General — the default face's entry point. Composes everyday prefs plus
 * Permissions (approval mode, hide secrets, checkpoints). Visual theme lives
 * under Appearance; Browser & Network is its own nav item.
 */
import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { saveHermesConfig, type HermesConfigRecord } from '@/hermes'
import { useI18n } from '@/i18n'
import { COMPLETION_SOUND_VARIANTS, previewCompletionSound } from '@/lib/completion-sound'
import { triggerHaptic } from '@/lib/haptics'
import { Loader2, RefreshCw } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { disarmSessionYolo } from '@/lib/yolo-session'
import { $completionSoundVariantId, setCompletionSoundVariantId } from '@/store/completion-sound'
import {
  $showReasoning,
  applyShowReasoningFromConfig,
  setShowReasoning
} from '@/store/display-prefs'
import { $nativeNotifyPrefs, setNativeNotifyEnabled } from '@/store/native-notifications'
import { notifyError } from '@/store/notifications'
import {
  $desktopVersion,
  $updateApply,
  $updateChecking,
  $updateStatus,
  checkUpdates,
  openUpdatesWindow,
  refreshDesktopVersion,
  startActiveUpdate
} from '@/store/updates'
import { $autoSpeakReplies, applyAutoSpeakFromConfig, setAutoSpeakReplies } from '@/store/voice-prefs'

import { peekHermesConfig, setHermesConfigCache, useHermesConfigRecord } from '../hooks/use-config-record'
import { useHermesConfigSchema } from '../hooks/use-config-schema'

import { ConfigField } from './config-field'
import { CONTROL_TEXT, GENERAL_PERMISSION_KEYS } from './constants'
import { DefaultProjectDirSetting } from './default-project-dir-setting'
import { enumOptionsFor, getNested, prettyName, setNested } from './helpers'
import { ListRow, SettingsContent, SettingsGroup, SettingsPageTitle } from './primitives'

const EMPTY_SELECT = '__none__'
const APPROVAL_MODE_KEYS = ['manual', 'smart', 'off'] as const

interface GeneralSettingsProps {
  onOpenAbout: () => void
  onOpenNotifications: () => void
  onConfigSaved?: () => void
}

export function GeneralSettings({ onOpenAbout, onOpenNotifications, onConfigSaved }: GeneralSettingsProps) {
  const { t, isSavingLocale } = useI18n()
  const g = t.settings.general
  const n = t.settings.notifications
  const a = t.settings.about
  const c = t.settings.config
  const safety = t.settings.safety

  const prefs = useStore($nativeNotifyPrefs)
  const completionSoundVariantId = useStore($completionSoundVariantId)
  const autoSpeak = useStore($autoSpeakReplies)
  const showThinking = useStore($showReasoning)
  const version = useStore($desktopVersion)
  const status = useStore($updateStatus)
  const apply = useStore($updateApply)
  const checking = useStore($updateChecking)

  const [config, setConfig] = useState<HermesConfigRecord | null>(() => peekHermesConfig())
  const [savingPersonality, setSavingPersonality] = useState(false)
  const { data: loadedConfig } = useHermesConfigRecord()
  const { data: schemaResponse } = useHermesConfigSchema()
  const schema = schemaResponse?.fields ?? null
  const configSeeded = useRef(config != null)

  useEffect(() => {
    void refreshDesktopVersion()
    if (config) {
      applyAutoSpeakFromConfig(config)
      applyShowReasoningFromConfig(config)
    }
    // Seed-once prefs from cache peek; later edits own the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loadedConfig || configSeeded.current) return
    configSeeded.current = true
    setConfig(loadedConfig)
    applyAutoSpeakFromConfig(loadedConfig)
    applyShowReasoningFromConfig(loadedConfig)
  }, [loadedConfig])

  const personality = String(getNested(config ?? {}, 'display.personality') ?? '')
  const personalityOptions = config ? (enumOptionsFor('display.personality', personality, config) ?? ['']) : ['']

  const behind = status?.behind ?? 0
  const supported = status?.supported !== false
  const applying = apply.applying || apply.stage === 'restart'

  const approvalModeLabels = useMemo(
    () => Object.fromEntries(APPROVAL_MODE_KEYS.map(key => [key, safety.approvalModes[key]])) as Record<string, string>,
    [safety.approvalModes]
  )

  const savePersonality = async (next: string) => {
    if (!config) return
    setSavingPersonality(true)
    try {
      const updated = setNested(config, 'display.personality', next)
      await saveHermesConfig(updated)
      setConfig(updated)
      setHermesConfigCache(updated)
      onConfigSaved?.()
      triggerHaptic('selection')
    } catch (error) {
      notifyError(error, t.settings.config.autosaveFailed)
    } finally {
      setSavingPersonality(false)
    }
  }

  const savePermission = async (key: string, value: unknown) => {
    if (!config) return
    try {
      const updated = setNested(config, key, value)
      setConfig(updated)
      await saveHermesConfig(updated)
      setHermesConfigCache(updated)

      // config.yaml is not the whole story: `/yolo` and the composer chip arm a
      // session-scoped bypass that outranks it. Writing "ask every time" here
      // while that flag stayed set left the page describing a prompt the
      // running chat would never show. The chip already drops it; so does this.
      if (key === 'approvals.mode' && value !== 'off') {
        await disarmSessionYolo().catch(error => notifyError(error, safety.yoloDisarmFailed))
      }

      onConfigSaved?.()
      triggerHaptic('selection')
    } catch (error) {
      notifyError(error, t.settings.config.autosaveFailed)
    }
  }

  let updateLine = a.tapCheck
  if (!supported) updateLine = status?.message ?? a.cantUpdate
  else if (status?.error) updateLine = a.cantReach
  else if (applying) updateLine = a.installing
  else if (behind > 0) updateLine = a.updateReady(behind)
  else if (status) updateLine = a.onLatest

  return (
    <SettingsContent>
      <div className="mx-auto w-full max-w-2xl pt-1">
        <SettingsPageTitle title={g.title} />

        <SettingsGroup title={g.preferences}>
          <ListRow
            action={<LanguageSwitcher />}
            description={isSavingLocale ? t.language.saving : t.language.description}
            inset
            title={t.language.label}
          />
          <ListRow
            action={
              <Select
                disabled={!config || savingPersonality}
                onValueChange={value => void savePersonality(value === EMPTY_SELECT ? '' : value)}
                value={personality || EMPTY_SELECT}
              >
                <SelectTrigger className={cn('min-w-40', CONTROL_TEXT)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {personalityOptions.map(option => (
                    <SelectItem key={option || EMPTY_SELECT} value={option || EMPTY_SELECT}>
                      {option ? (g.personalities[option] ?? prettyName(option)) : c.none}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            description={g.personalityDesc}
            inset
            title={g.personality}
          />
          <ListRow
            action={
              <Switch
                aria-label={g.readAloud}
                checked={autoSpeak}
                onCheckedChange={on => {
                  triggerHaptic('selection')
                  void setAutoSpeakReplies(on).catch(error => notifyError(error, t.settings.config.autosaveFailed))
                }}
              />
            }
            description={g.readAloudDesc}
            inset
            title={g.readAloud}
          />
          <ListRow
            action={
              <Switch
                aria-label={g.showThinking}
                checked={showThinking}
                onCheckedChange={on => {
                  triggerHaptic('selection')
                  void setShowReasoning(on)
                    .then(() => onConfigSaved?.())
                    .catch(error => notifyError(error, t.settings.config.autosaveFailed))
                }}
              />
            }
            description={g.showThinkingDesc}
            inset
            title={g.showThinking}
          />
        </SettingsGroup>

        <SettingsGroup title={g.workspace}>
          <DefaultProjectDirSetting />
        </SettingsGroup>

        {config && schema ? (
          <SettingsGroup title={g.permissions}>
            {GENERAL_PERMISSION_KEYS.map(key => {
              const field = schema[key]
              if (!field) return null
              const labels = safety.fields[key]

              return (
                <ConfigField
                  descriptionOverride={labels?.description}
                  enumOptions={enumOptionsFor(key, getNested(config, key), config)}
                  inset
                  key={key}
                  onChange={value => void savePermission(key, value)}
                  optionLabels={key === 'approvals.mode' ? approvalModeLabels : undefined}
                  schema={field}
                  schemaKey={key}
                  titleOverride={labels?.label}
                  value={getNested(config, key)}
                />
              )
            })}
          </SettingsGroup>
        ) : null}

        <SettingsGroup
          footer={
            <Button
              className="h-auto px-0 py-0 text-[length:var(--conversation-caption-font-size)]"
              onClick={() => {
                triggerHaptic('open')
                onOpenNotifications()
              }}
              type="button"
              variant="textStrong"
            >
              {g.manageAlerts}
            </Button>
          }
          title={g.alerts}
        >
          <ListRow
            action={
              <Switch
                aria-label={n.enableAll}
                checked={prefs.enabled}
                onCheckedChange={on => {
                  triggerHaptic('selection')
                  setNativeNotifyEnabled(on)
                }}
              />
            }
            description={n.enableAllDesc}
            inset
            title={n.enableAll}
          />
          <ListRow
            action={
              <Select
                onValueChange={value => {
                  const variantId = Number.parseInt(value, 10)
                  setCompletionSoundVariantId(variantId)
                  previewCompletionSound(variantId)
                  triggerHaptic('selection')
                }}
                value={String(completionSoundVariantId)}
              >
                <SelectTrigger className={cn('min-w-40', CONTROL_TEXT)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLETION_SOUND_VARIANTS.map(variant => (
                    <SelectItem key={variant.id} value={String(variant.id)}>
                      {n.completionSoundNames[String(variant.id)] ?? variant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            description={n.completionSoundDesc}
            inset
            title={n.completionSoundTitle}
          />
        </SettingsGroup>

        <SettingsGroup
          footer={
            <Button
              className="h-auto px-0 py-0 text-[length:var(--conversation-caption-font-size)]"
              onClick={() => {
                triggerHaptic('open')
                onOpenAbout()
              }}
              type="button"
              variant="textStrong"
            >
              {g.openAbout}
            </Button>
          }
          title={g.app}
        >
          <ListRow
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  disabled={checking || applying || !supported}
                  onClick={() => void checkUpdates()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  {checking ? a.checking : a.checkNow}
                </Button>
                {behind > 0 && supported && !applying ? (
                  <Button onClick={() => startActiveUpdate()} size="sm" type="button">
                    {a.updateNow}
                  </Button>
                ) : null}
                {behind > 0 && supported && !applying ? (
                  <Button onClick={() => openUpdatesWindow()} size="sm" type="button" variant="textStrong">
                    {a.seeWhatsNew}
                  </Button>
                ) : null}
              </div>
            }
            description={updateLine}
            inset
            title={version?.appVersion ? a.version(version.appVersion) : a.versionUnavailable}
          />
        </SettingsGroup>
      </div>
    </SettingsContent>
  )
}
