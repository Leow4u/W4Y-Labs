import { useEffect, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { useI18n } from '@/i18n'
import { useProductRuntime } from '@/adapters'
import { fetchPluginJson } from '@/lib/dashboard-plugins'

import { Panel, PanelBody, PanelEmpty, PanelHeader } from '../overlays/panel'

interface KanbanTask {
  id: string
  title: string
  status?: string
  assignee?: string | null
}

interface KanbanColumn {
  name: string
  tasks: KanbanTask[]
}

interface KanbanBoardPayload {
  columns?: KanbanColumn[]
}

export function KanbanView({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const copy = t.kanbanView
  const runtime = useProductRuntime()
  const [data, setData] = useState<KanbanBoardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void fetchPluginJson<KanbanBoardPayload>('kanban', '/board')
      .then(payload => {
        if (!alive) return
        if (!payload) {
          setError(copy.loadFailed)
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

  const columnList = data?.columns ?? []

  return (
    <Panel closeLabel={copy.close} onClose={onClose}>
      <PanelHeader subtitle={copy.subtitle} title={copy.title} />
      <PanelBody className="min-h-0 flex-1 overflow-x-auto px-4 pb-4">
        {error ? (
          <PanelEmpty description={error} icon="warning" title={copy.loadFailed} />
        ) : loading ? (
          <PageLoader aria-label={copy.loading} className="min-h-[12rem]" />
        ) : !columnList.length ? (
          <PanelEmpty description={copy.emptyDesc} icon="package" title={copy.emptyTitle} />
        ) : (
          <div className="flex min-h-[14rem] gap-3">
            {columnList.map(col => (
              <section
                className="min-w-[12rem] flex-1 rounded-lg border border-(--ui-border-subtle) bg-(--ui-control-background)/40 p-2"
                key={col.name}
              >
                <h3 className="mb-2 px-1 text-[0.65rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">
                  {copy.column(col.name)} ({col.tasks?.length ?? 0})
                </h3>
                <ul className="space-y-2">
                  {(col.tasks ?? []).map(task => (
                    <li className="rounded-md bg-(--ui-control-background) px-2 py-1.5 text-sm" key={task.id}>
                      <p className="font-medium text-foreground">{task.title || task.id}</p>
                      {task.assignee ? (
                        <p className="text-[0.65rem] text-(--ui-text-tertiary)">{task.assignee}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </PanelBody>
      <p className="px-4 pb-3 text-[0.65rem] text-(--ui-text-tertiary)">
        {copy.cliHint}{' '}
        <a className="underline" href={`${runtime.platformOrigin}/documentacao`} rel="noreferrer" target="_blank">
          {copy.docsLink}
        </a>
      </p>
    </Panel>
  )
}
