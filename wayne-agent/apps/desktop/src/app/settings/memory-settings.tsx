/**
 * Settings → Memory & Context — Codex-style PME surface: intent toggles,
 * storage provider, summarize long chats, manage / reset, import.
 * Fine budgets / compression ratios stay under Advanced.
 */
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Switch } from '@/components/ui/switch'
import { resetMemory } from '@/hermes'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { ChevronRight } from '@/lib/icons'
import { notify, notifyError } from '@/store/notifications'

import { useEditableHermesConfig } from '../hooks/use-editable-hermes-config'
import { PanelEmpty } from '../overlays/panel'

import { ConfigField } from './config-field'
import { SECTIONS } from './constants'
import { enumOptionsFor, getNested, prettyName, setNested } from './helpers'
import { MemoryConnect } from './memory/connect'
import { ImportMemoryDialog } from './memory/import-dialog'
import { ManageMemoryDialog } from './memory/manage-dialog'
import { ListRow, LoadingState, SettingsContent, SettingsGroup, SettingsPageTitle } from './primitives'
import { ProviderConfigPanel } from './provider-config-panel'

const SECTION = SECTIONS.find(section => section.id === 'memory')

const TOGGLE_KEYS = ['memory.memory_enabled', 'memory.user_profile_enabled'] as const

interface MemorySettingsProps {
  onConfigSaved?: () => void
}

export function MemorySettings({ onConfigSaved }: MemorySettingsProps) {
  const { t } = useI18n()
  const copy = t.settings.memoryPage
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
    onConfigSaved
  })

  const [manageOpen, setManageOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

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

  if (!config || !schema || !SECTION) {
    return <LoadingState label={c.loading} />
  }

  const profileEnabled = Boolean(getNested(config, 'memory.user_profile_enabled'))
  const providerField = schema['memory.provider']
  const compressionField = schema['compression.enabled']
  const providerValue = getNested(config, 'memory.provider')

  return (
    <SettingsContent>
      <div className="mx-auto w-full max-w-2xl pt-1">
        <SettingsPageTitle title={copy.title} />

        <SettingsGroup
          footer={
            <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
              {copy.memoryIntro}
            </p>
          }
          title={copy.memory}
        >
          {TOGGLE_KEYS.map(key => {
            const field = schema[key]
            if (!field) return null
            const labels = copy.fields[key]
            const checked = Boolean(getNested(config, key))
            return (
              <ListRow
                action={
                  <Switch
                    aria-label={labels?.label ?? key}
                    checked={checked}
                    onCheckedChange={on => updateConfig(setNested(config, key, on))}
                  />
                }
                description={labels?.description}
                inset
                key={key}
                title={labels?.label ?? key}
              />
            )
          })}

          {providerField ? (
            <>
              <ConfigField
                descriptionExtra={
                  providerValue ? <MemoryConnect provider={String(providerValue)} /> : undefined
                }
                descriptionOverride={copy.fields['memory.provider']?.description}
                enumOptions={enumOptionsFor('memory.provider', providerValue, config)}
                inset
                onChange={value => updateConfig(setNested(config, 'memory.provider', value))}
                optionLabels={
                  Object.fromEntries(
                    (enumOptionsFor('memory.provider', providerValue, config) ?? [])
                      .filter(Boolean)
                      .map(option => [option, copy.providers[option] ?? prettyName(option)])
                  ) as Record<string, string>
                }
                schema={providerField}
                schemaKey="memory.provider"
                titleOverride={copy.fields['memory.provider']?.label}
                value={providerValue}
              />
              {typeof providerValue === 'string' && providerValue ? (
                <ProviderConfigPanel provider={String(providerValue)} />
              ) : null}
            </>
          ) : null}

          {compressionField ? (
            <ConfigField
              descriptionOverride={copy.fields['compression.enabled']?.description}
              inset
              onChange={value => updateConfig(setNested(config, 'compression.enabled', value))}
              schema={compressionField}
              schemaKey="compression.enabled"
              titleOverride={copy.fields['compression.enabled']?.label}
              value={getNested(config, 'compression.enabled')}
            />
          ) : null}

          <button
            className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-(--chrome-action-hover)/60"
            onClick={() => {
              triggerHaptic('selection')
              setManageOpen(true)
            }}
            type="button"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[length:var(--conversation-text-font-size)] font-medium text-foreground">
                {copy.manageRow}
              </div>
              <div className="mt-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                {copy.manageRowDesc}
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-(--ui-text-tertiary)" />
          </button>

          <ListRow
            action={
              <Button
                onClick={() => {
                  triggerHaptic('warning')
                  setResetOpen(true)
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {copy.resetAction}
              </Button>
            }
            description={copy.resetDesc}
            inset
            title={copy.resetRow}
          />
        </SettingsGroup>

        <SettingsGroup title={copy.importGroup}>
          <ListRow
            action={
              <Button
                onClick={() => {
                  triggerHaptic('selection')
                  setImportOpen(true)
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {copy.importAction}
              </Button>
            }
            description={copy.importRowDesc}
            inset
            title={copy.importRow}
          />
        </SettingsGroup>
      </div>

      <ManageMemoryDialog onOpenChange={setManageOpen} open={manageOpen} />

      <ImportMemoryDialog
        onEnableProfile={() => updateConfig(setNested(config, 'memory.user_profile_enabled', true))}
        onOpenChange={setImportOpen}
        open={importOpen}
        profileEnabled={profileEnabled}
      />

      <ConfirmDialog
        confirmLabel={copy.resetConfirm}
        description={copy.resetConfirmDesc}
        destructive
        onClose={() => setResetOpen(false)}
        onConfirm={async () => {
          await resetMemory('all')
          triggerHaptic('success')
          notify({ kind: 'success', title: copy.resetDone, message: copy.resetDoneDesc })
        }}
        open={resetOpen}
        title={copy.resetRow}
      />
    </SettingsContent>
  )
}
