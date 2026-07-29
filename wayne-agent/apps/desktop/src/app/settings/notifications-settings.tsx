/**
 * Settings → Notifications — curated card layout (same pattern as Geral / Voz).
 * Native OS alerts + completion sound; prefs stay device-local.
 */
import { useStore } from '@nanostores/react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import { COMPLETION_SOUND_VARIANTS, playCompletionSound, previewCompletionSound } from '@/lib/completion-sound'
import { triggerHaptic } from '@/lib/haptics'
import { Bell, Play } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $completionSoundVariantId, setCompletionSoundVariantId } from '@/store/completion-sound'
import {
  $nativeNotifyPrefs,
  NATIVE_NOTIFICATION_KINDS,
  sendTestNativeNotification,
  setNativeNotifyEnabled,
  setNativeNotifyKind
} from '@/store/native-notifications'
import { notify } from '@/store/notifications'

import { CONTROL_TEXT } from './constants'
import { ListRow, SettingsContent, SettingsGroup, SettingsPageTitle } from './primitives'

function ToggleRow(props: {
  checked: boolean
  description: string
  disabled?: boolean
  label: string
  onChange: (on: boolean) => void
}) {
  return (
    <ListRow
      action={
        <Switch
          aria-label={props.label}
          checked={props.checked}
          disabled={props.disabled}
          onCheckedChange={on => {
            triggerHaptic('selection')
            props.onChange(on)
          }}
        />
      }
      description={props.description}
      inset
      title={props.label}
    />
  )
}

export function NotificationsSettings() {
  const { t } = useI18n()
  const prefs = useStore($nativeNotifyPrefs)
  const completionSoundVariantId = useStore($completionSoundVariantId)
  const copy = t.settings.notifications

  const runTest = async () => {
    triggerHaptic('open')
    // Banner = OS notification (silent); cue = in-app completion preset.
    playCompletionSound()
    const ok = await sendTestNativeNotification(copy.testTitle, copy.testBody)
    notify({ kind: ok ? 'info' : 'error', message: ok ? copy.testSent : copy.testUnsupported })
  }

  return (
    <SettingsContent>
      <div className="mx-auto w-full max-w-2xl pt-1">
        <SettingsPageTitle title={copy.title} />

        <SettingsGroup
          footer={
            <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
              {copy.intro}
            </p>
          }
          title={copy.alerts}
        >
          <ToggleRow
            checked={prefs.enabled}
            description={copy.enableAllDesc}
            label={copy.enableAll}
            onChange={setNativeNotifyEnabled}
          />

          {NATIVE_NOTIFICATION_KINDS.map(kind => (
            <ToggleRow
              checked={prefs.enabled && prefs.kinds[kind]}
              description={copy.kinds[kind].description}
              disabled={!prefs.enabled}
              key={kind}
              label={copy.kinds[kind].label}
              onChange={on => setNativeNotifyKind(kind, on)}
            />
          ))}
        </SettingsGroup>

        <SettingsGroup title={copy.sound}>
          <ListRow
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Select
                  onValueChange={value => {
                    const variantId = Number.parseInt(value, 10)

                    setCompletionSoundVariantId(variantId)
                    previewCompletionSound(variantId)
                    triggerHaptic('selection')
                  }}
                  value={String(completionSoundVariantId)}
                >
                  <SelectTrigger className={cn('min-w-44', CONTROL_TEXT)}>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {COMPLETION_SOUND_VARIANTS.map(variant => (
                      <SelectItem key={variant.id} value={String(variant.id)}>
                        {copy.completionSoundNames[String(variant.id)] ?? variant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  aria-label={copy.completionSoundPreview}
                  className="gap-1.5"
                  onClick={() => {
                    previewCompletionSound()
                    triggerHaptic('crisp')
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Play className="size-3.5" />
                  {copy.completionSoundPreview}
                </Button>
              </div>
            }
            description={copy.completionSoundDesc}
            inset
            title={copy.completionSoundTitle}
          />
        </SettingsGroup>

        <SettingsGroup
          footer={
            <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
              {copy.focusedHint}
            </p>
          }
          title={copy.testGroup}
        >
          <ListRow
            action={
              <Button onClick={() => void runTest()} size="sm" type="button" variant="outline">
                <Bell className="size-3.5" />
                {copy.test}
              </Button>
            }
            description={copy.testDesc}
            inset
            title={copy.testRow}
          />
        </SettingsGroup>
      </div>
    </SettingsContent>
  )
}
