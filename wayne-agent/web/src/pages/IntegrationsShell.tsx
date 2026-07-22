/**
 * IntegrationsShell — "Integrações" com abas internas (Fase 10 · Onda A2).
 *
 * Um único item de sidebar (sem dropdown, PR-1) abre este shell; as três
 * famílias vivem em ABAS DENTRO da tela (decisão anti-dropdown, Fase 5):
 *   Conectores  (/integrations?tab=connectors)  → ConnectorsPage
 *   Habilidades (/integrations?tab=skills)       → SkillsPage
 *   Canais      (/integrations?tab=channels)     → ChannelsPage
 *
 * A aba ativa vive em `?tab=` (deep-linkável; os redirects de /mcp, /skills e
 * /channels caem aqui — ver App.tsx). Cada página segue sendo o mesmo
 * componente self-contained que já existia; só uma monta por vez, então o
 * page-header (title/end via usePageHeader) nunca conflita.
 */
import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import ConnectorsPage from "@/pages/ConnectorsPage";
import SkillsPage from "@/pages/SkillsPage";
import ChannelsPage from "@/pages/ChannelsPage";

const TABS = ["connectors", "skills", "channels"] as const;
type Tab = (typeof TABS)[number];

function coerceTab(raw: string | null): Tab {
  return (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "connectors";
}

export default function IntegrationsShell() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const active = coerceTab(params.get("tab"));

  const label: Record<Tab, string> = {
    connectors: t.app.nav.connectors,
    skills: t.app.nav.skills,
    channels: t.app.nav.channels,
  };

  const setTab = (tab: Tab) => {
    const next = new URLSearchParams(params);
    next.set("tab", tab);
    setParams(next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 sm:px-6 sm:pt-4">
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            onClick={() => setTab(tab)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 type-ui transition-colors",
              active === tab
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label[tab]}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {active === "connectors" && <ConnectorsPage />}
        {active === "skills" && <SkillsPage />}
        {active === "channels" && <ChannelsPage />}
      </div>
    </div>
  );
}
