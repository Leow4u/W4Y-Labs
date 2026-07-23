import { Panel, PanelEmpty } from '../overlays/panel'

/**
 * Agent Studio — product entry (estrela-guia opção A).
 * F1+ lives in docs/AGENT-STUDIO.md; this overlay is the honest empty state
 * until NL→config ships. Do not build Studio on desktop-shell.
 */
export function AgentStudioView({ onClose }: { onClose: () => void }) {
  return (
    <Panel closeLabel="Close" onClose={onClose}>
      <PanelEmpty
        description="Soon: create agents in plain language, pick a template, and put them to work — without engineering jargon. Spec: docs/AGENT-STUDIO.md"
        icon="lightbulb"
        title="Agent Studio"
      />
    </Panel>
  )
}
