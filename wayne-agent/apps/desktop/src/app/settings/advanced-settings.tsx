/**
 * Settings → Advanced — power knobs kept off the curated faces (General, Memory,
 * Models, Browser). Same Cursor-style groups as Browser & Network / Memory.
 */
import { useEffect, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import type { ConfigFieldSchema } from '@/types/hermes'

import { useEditableHermesConfig } from '../hooks/use-editable-hermes-config'
import { PanelEmpty } from '../overlays/panel'

import { ConfigField } from './config-field'
import { IMAGE_INPUT_MODE_LABELS, SECTIONS } from './constants'
import { enumOptionsFor, getNested, setNested } from './helpers'
import { LoadingState, SettingsContent, SettingsGroup, SettingsPageTitle } from './primitives'

const SECTION = SECTIONS.find(section => section.id === 'advanced')

/** Logical groups — order matches how power users scan the page. */
const ADVANCED_GROUPS = [
  {
    id: 'tools',
    keys: ['approvals.timeout', 'approvals.mcp_reload_confirm', 'command_allowlist']
  },
  {
    id: 'memory',
    keys: [
      'memory.memory_char_limit',
      'memory.user_char_limit',
      'context.engine',
      'compression.threshold',
      'compression.target_ratio',
      'compression.protect_last_n'
    ]
  },
  {
    id: 'workspace',
    keys: [
      'terminal.cwd',
      'code_execution.mode',
      'terminal.persistent_shell',
      'terminal.env_passthrough',
      'file_read_max_chars',
      'terminal.backend',
      'terminal.timeout',
      'terminal.docker_image',
      'terminal.singularity_image',
      'terminal.modal_image',
      'terminal.daytona_image',
      'tool_output.max_bytes',
      'tool_output.max_lines',
      'tool_output.max_line_length'
    ]
  },
  {
    id: 'agent',
    keys: [
      'checkpoints.max_snapshots',
      'agent.max_turns',
      'agent.image_input_mode',
      'agent.api_max_retries',
      'agent.service_tier',
      'agent.tool_use_enforcement',
      'delegation.max_iterations',
      'delegation.max_concurrent_children',
      'delegation.child_timeout_seconds'
    ]
  }
] as const

type AdvancedGroupId = (typeof ADVANCED_GROUPS)[number]['id']

interface AdvancedSettingsProps {
  onConfigSaved?: () => void
}

export function AdvancedSettings({ onConfigSaved }: AdvancedSettingsProps) {
  const { t } = useI18n()
  const copy = t.settings.advancedPage
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

  const byKey = useMemo(() => {
    if (!schema || !SECTION) {
      return new Map<string, ConfigFieldSchema>()
    }

    const map = new Map<string, ConfigFieldSchema>()
    for (const key of SECTION.keys) {
      if (schema[key]) map.set(key, schema[key])
    }
    return map
  }, [schema])

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

  const renderField = (key: string): ReactNode => {
    const field = byKey.get(key)
    if (!field) return null

    const labels = copy.fields[key]

    return (
      <div className="scroll-mt-6" id={`setting-field-${key}`} key={key}>
        <ConfigField
          descriptionOverride={labels?.description}
          enumOptions={enumOptionsFor(key, getNested(config, key), config)}
          inset
          onChange={value => updateConfig(setNested(config, key, value))}
          optionLabels={
            key === 'agent.image_input_mode'
              ? { ...IMAGE_INPUT_MODE_LABELS, ...t.settings.model.imageModes }
              : undefined
          }
          schema={field}
          schemaKey={key}
          titleOverride={labels?.label}
          value={getNested(config, key)}
        />
      </div>
    )
  }

  const groupTitle = (id: AdvancedGroupId) => copy.groups[id]

  return (
    <SettingsContent>
      <div className="mx-auto w-full max-w-2xl pt-1">
        <SettingsPageTitle title={copy.title} />
        <p className="mb-5 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {copy.intro}
        </p>

        {ADVANCED_GROUPS.map(group => {
          const visible = group.keys.filter(key => byKey.has(key))
          if (visible.length === 0) return null

          return (
            <SettingsGroup key={group.id} title={groupTitle(group.id)}>
              {visible.map(key => renderField(key))}
            </SettingsGroup>
          )
        })}
      </div>
    </SettingsContent>
  )
}
