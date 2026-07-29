/**
 * Settings → Browser & Network — Cursor-style surface for private-network /
 * browser access. Product differentiator; keep out of Advanced.
 */
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import type { ConfigFieldSchema } from '@/types/hermes'

import { useEditableHermesConfig } from '../hooks/use-editable-hermes-config'
import { PanelEmpty } from '../overlays/panel'

import { ConfigField } from './config-field'
import { SECTIONS } from './constants'
import { enumOptionsFor, getNested, setNested } from './helpers'
import { LoadingState, SettingsContent, SettingsGroup, SettingsPageTitle } from './primitives'

const SECTION = SECTIONS.find(section => section.id === 'browser-network')

const NETWORK_KEYS = [
  'security.allow_private_urls',
  'browser.allow_private_urls',
  'browser.auto_local_for_private_urls'
] as const

interface BrowserNetworkSettingsProps {
  onConfigSaved?: () => void
}

export function BrowserNetworkSettings({ onConfigSaved }: BrowserNetworkSettingsProps) {
  const { t } = useI18n()
  const copy = t.settings.browserNetwork
  const fieldCopy = t.settings.safety.fields
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

  const fields = useMemo(() => {
    if (!schema || !SECTION) {
      return [] as [string, ConfigFieldSchema][]
    }

    return SECTION.keys.flatMap(key => (schema[key] ? [[key, schema[key]] as [string, ConfigFieldSchema]] : []))
  }, [schema])

  const byKey = useMemo(() => new Map(fields), [fields])

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
          title={copy.network}
        >
          {NETWORK_KEYS.map(key => {
            const field = byKey.get(key)
            if (!field) return null
            const labels = fieldCopy[key]

            return (
              <ConfigField
                descriptionOverride={labels?.description}
                enumOptions={enumOptionsFor(key, getNested(config, key), config)}
                inset
                key={key}
                onChange={value => updateConfig(setNested(config, key, value))}
                schema={field}
                schemaKey={key}
                titleOverride={labels?.label}
                value={getNested(config, key)}
              />
            )
          })}
        </SettingsGroup>
      </div>
    </SettingsContent>
  )
}
