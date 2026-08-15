import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { useI18n } from '@/i18n'
import { fetchPluginJson } from '@/lib/dashboard-plugins'
import { cn } from '@/lib/utils'

import { Panel, PanelBody, PanelEmpty, PanelHeader } from '../overlays/panel'

interface AchievementRow {
  id: string
  title: string
  description?: string
  unlocked?: boolean
  state?: string
  progress_pct?: number
  tier?: string | null
}

interface AchievementsPayload {
  achievements?: AchievementRow[]
  unlocked_count?: number
  total_count?: number
  scan_meta?: { status?: { state?: string } }
  is_stale?: boolean
}

export function AchievementsView({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const copy = t.achievements
  const [data, setData] = useState<AchievementsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    void fetchPluginJson<AchievementsPayload>('wayne-achievements', '/achievements')
      .then(payload => {
        if (!alive) return
        if (!payload) {
          setError(copy.loadFailed)
          setData(null)
          return
        }
        setData(payload)
      })
      .catch(err => {
        if (!alive) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [copy.loadFailed])

  const rows = data?.achievements ?? []
  const unlocked = data?.unlocked_count ?? rows.filter(r => r.unlocked).length
  const total = data?.total_count ?? rows.length

  return (
    <Panel closeLabel={copy.close} onClose={onClose}>
      <PanelHeader
        subtitle={copy.subtitle(unlocked, total)}
        title={copy.title}
      />
      <PanelBody className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {error ? (
          <PanelEmpty description={error} icon="warning" title={copy.loadFailed} />
        ) : loading && !rows.length ? (
          <PageLoader aria-label={copy.loading} className="min-h-[12rem]" />
        ) : !rows.length ? (
          <PanelEmpty description={copy.emptyDesc} icon="star" title={copy.emptyTitle} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rows.map(row => (
              <li
                className={cn(
                  'rounded-lg border border-(--ui-border-subtle) bg-(--ui-control-background) p-3',
                  row.unlocked && 'border-(--ui-accent)/40'
                )}
                key={row.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{row.title}</p>
                  <span className="text-[0.65rem] uppercase tracking-wide text-(--ui-text-tertiary)">
                    {row.unlocked ? copy.unlocked : row.state === 'secret' ? copy.secret : copy.locked}
                  </span>
                </div>
                {row.description ? (
                  <p className="mt-1 text-xs text-(--ui-text-secondary)">{row.description}</p>
                ) : null}
                {!row.unlocked && typeof row.progress_pct === 'number' ? (
                  <p className="mt-2 text-[0.65rem] text-(--ui-text-tertiary)">
                    {copy.progress(row.progress_pct)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  )
}
