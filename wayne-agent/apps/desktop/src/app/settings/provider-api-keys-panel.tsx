/**
 * BYOK API key list — shared by Settings → Models (▸ API Keys) without the
 * Providers OAuth accounts face.
 */
import { useState } from 'react'

import { SearchField } from '@/components/ui/search-field'
import { useI18n } from '@/i18n'
import { normalize } from '@/lib/text'

import { ProviderKeyRows } from './credential-key-ui'
import { useEnvCredentials } from './env-credentials'
import { buildByokProviderKeyGroups } from './provider-key-groups'
import { LoadingState } from './primitives'

export function ProviderApiKeysPanel() {
  const { t } = useI18n()
  const { rowProps, vars } = useEnvCredentials()
  const [openProvider, setOpenProvider] = useState<null | string>(null)
  const [keyQuery, setKeyQuery] = useState('')

  if (!vars) {
    return <LoadingState label={t.settings.providers.loading} />
  }

  const keyGroups = buildByokProviderKeyGroups(vars)
  const q = normalize(keyQuery)

  const visibleGroups = q
    ? keyGroups.filter(group => {
        const haystack = [group.name, group.description ?? '', group.primary[0], ...group.advanced.map(([k]) => k)]

        return haystack.some(s => s.toLowerCase().includes(q))
      })
    : keyGroups

  if (keyGroups.length === 0) {
    return (
      <div className="grid min-h-24 place-items-center px-4 py-6 text-center text-[length:var(--conversation-caption-font-size)] text-muted-foreground">
        {t.settings.model.apiKeysEmpty}
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
        {t.settings.model.apiKeysIntro}
      </p>
      <SearchField
        aria-label={t.settings.providers.searchKeys}
        containerClassName="w-full"
        onChange={setKeyQuery}
        placeholder={t.settings.providers.searchKeys}
        value={keyQuery}
      />
      {visibleGroups.length > 0 ? (
        <div className="grid gap-2">
          {visibleGroups.map(group => (
            <ProviderKeyRows
              expanded={openProvider === group.name}
              group={group}
              key={group.name}
              onExpand={() => setOpenProvider(group.name)}
              onToggle={() => setOpenProvider(prev => (prev === group.name ? null : group.name))}
              rowProps={rowProps}
            />
          ))}
        </div>
      ) : (
        <div className="grid min-h-24 place-items-center px-4 py-6 text-center text-[length:var(--conversation-caption-font-size)] text-muted-foreground">
          {t.settings.providers.noKeysMatch}
        </div>
      )}
    </div>
  )
}
