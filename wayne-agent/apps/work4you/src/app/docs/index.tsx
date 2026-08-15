import { useI18n } from '@/i18n'
import { useProductRuntime } from '@/adapters'

import { Panel, PanelBody, PanelHeader } from '../overlays/panel'

export function DocsView({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const copy = t.docsView
  const runtime = useProductRuntime()
  const src = `${runtime.platformOrigin}/documentacao`

  return (
    <Panel closeLabel={copy.close} contentClassName="flex min-h-0 flex-1 flex-col" onClose={onClose}>
      <PanelHeader subtitle={copy.subtitle} title={copy.title} />
      <PanelBody className="min-h-0 flex-1 p-0">
        <iframe className="h-full min-h-[70vh] w-full border-0 bg-background" src={src} title={copy.title} />
      </PanelBody>
    </Panel>
  )
}
