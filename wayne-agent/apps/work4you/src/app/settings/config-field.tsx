import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { ConfigFieldSchema } from '@/types/hermes'

import { CONTROL_TEXT, EMPTY_SELECT_VALUE, FIELD_DESCRIPTIONS, FIELD_LABELS } from './constants'
import { fieldCopyForSchemaKey } from './field-copy'
import { prettyName } from './helpers'
import { ListRow } from './primitives'

export function ConfigField({
  schemaKey,
  schema,
  value,
  enumOptions,
  optionLabels,
  onChange,
  descriptionExtra,
  actionAccessory,
  inset = false,
  titleOverride,
  descriptionOverride
}: {
  schemaKey: string
  schema: ConfigFieldSchema
  value: unknown
  enumOptions?: string[]
  optionLabels?: Record<string, string>
  onChange: (value: unknown) => void
  descriptionExtra?: ReactNode
  /** Sits beside the control (e.g. voice preview next to the select). */
  actionAccessory?: ReactNode
  inset?: boolean
  titleOverride?: string
  descriptionOverride?: string
}) {
  const { t } = useI18n()
  const c = t.settings.config

  const label =
    titleOverride ??
    fieldCopyForSchemaKey(t.settings.fieldLabels, schemaKey) ??
    fieldCopyForSchemaKey(FIELD_LABELS, schemaKey) ??
    prettyName(schemaKey.split('.').pop() ?? schemaKey)

  const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '')

  const rawDescription = (
    descriptionOverride ??
    fieldCopyForSchemaKey(t.settings.fieldDescriptions, schemaKey) ??
    fieldCopyForSchemaKey(FIELD_DESCRIPTIONS, schemaKey) ??
    schema.description ??
    ''
  ).trim()

  const normalizedDesc = normalize(rawDescription)

  const description =
    rawDescription && normalizedDesc !== normalize(label) && normalizedDesc !== normalize(schemaKey)
      ? rawDescription
      : undefined

  const descriptionNode: ReactNode = descriptionExtra ? (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {description}
      {descriptionExtra}
    </span>
  ) : (
    description
  )

  const withAccessory = (control: ReactNode) =>
    actionAccessory ? (
      <div className="flex items-center justify-end gap-1.5">{control}{actionAccessory}</div>
    ) : (
      control
    )

  const row = (action: ReactNode, wide = false) => (
    <ListRow action={action} description={descriptionNode} inset={inset} title={label} wide={wide} />
  )

  if (schema.type === 'boolean') {
    return row(
      withAccessory(
        <div className="flex items-center justify-end">
          <Switch checked={Boolean(value)} onCheckedChange={onChange} />
        </div>
      )
    )
  }

  const selectOptions = enumOptions ?? (schema.type === 'select' ? (schema.options ?? []).map(String) : undefined)

  if (selectOptions) {
    return row(
      withAccessory(
        <Select
          onValueChange={next => onChange(next === EMPTY_SELECT_VALUE ? '' : next)}
          value={String(value ?? '') || EMPTY_SELECT_VALUE}
        >
          <SelectTrigger className={cn('min-w-44', CONTROL_TEXT)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectOptions.map(option => (
              <SelectItem key={option || EMPTY_SELECT_VALUE} value={option || EMPTY_SELECT_VALUE}>
                {option
                  ? (optionLabels?.[option] ?? prettyName(option))
                  : (optionLabels?.[''] ??
                    (schemaKey === 'display.personality' ? c.none : c.noneParen))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    )
  }

  if (schema.type === 'number') {
    return row(
      <Input
        className={CONTROL_TEXT}
        onChange={e => {
          const raw = e.target.value
          const n = raw === '' ? 0 : Number(raw)

          if (!Number.isNaN(n)) {
            onChange(n)
          }
        }}
        placeholder={c.notSet}
        type="number"
        value={value === undefined || value === null ? '' : String(value)}
      />
    )
  }

  if (schema.type === 'list') {
    return row(
      <Input
        className={CONTROL_TEXT}
        onChange={e =>
          onChange(
            e.target.value
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          )
        }
        placeholder={c.commaSeparated}
        value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
      />
    )
  }

  if (typeof value === 'object' && value !== null) {
    return row(
      <Textarea
        className={cn('min-h-28 resize-y bg-background font-mono', CONTROL_TEXT)}
        onChange={e => {
          try {
            onChange(JSON.parse(e.target.value))
          } catch {
            /* keep last valid */
          }
        }}
        placeholder={c.notSet}
        spellCheck={false}
        value={JSON.stringify(value, null, 2)}
      />,
      true
    )
  }

  const isLong = schema.type === 'text' || String(value ?? '').length > 100

  return row(
    isLong ? (
      <Textarea
        className={cn('min-h-24 resize-y bg-background', CONTROL_TEXT)}
        onChange={e => onChange(e.target.value)}
        placeholder={c.notSet}
        value={String(value ?? '')}
      />
    ) : (
      <Input
        className={CONTROL_TEXT}
        onChange={e => onChange(e.target.value)}
        placeholder={c.notSet}
        value={String(value ?? '')}
      />
    ),
    isLong
  )
}
