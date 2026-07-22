/**
 * AgentsShell — "Agentes" com abas internas (Fase 10 · Onda A3).
 *
 * Um item de sidebar (sem dropdown, PR-1) abre este shell; os três planos de
 * controle do módulo vivem em ABAS DENTRO da tela:
 *   Equipe      (/profiles?tab=team)        → AgentsPage (grid + pulse)
 *   Trabalho    (/profiles?tab=work)         → OperationsPage (kanban)
 *   Governança  (/profiles?tab=governance)   → GovernancePage (aprovações)
 *
 * "Início rápido" NÃO é aba — é o CTA `+ Novo agente` no header da Equipe
 * (AgentsPage já injeta via usePageHeader). Os redirects de
 * /profiles/operations e /profiles/governance caem aqui (ver App.tsx). Só uma
 * página monta por vez, então title/end via usePageHeader nunca conflitam.
 */
import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import AgentsPage from "@/pages/AgentsPage";
import OperationsPage from "@/pages/OperationsPage";
import GovernancePage from "@/pages/GovernancePage";

const TABS = ["team", "work", "governance"] as const;
type Tab = (typeof TABS)[number];

function coerceTab(raw: string | null): Tab {
  return (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "team";
}

export default function AgentsShell() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const active = coerceTab(params.get("tab"));

  const label: Record<Tab, string> = {
    team: t.agents.teamTab,
    work: t.agents.opsTab,
    governance: t.agents.govTab,
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
        {active === "team" && <AgentsPage />}
        {active === "work" && <OperationsPage />}
        {active === "governance" && <GovernancePage />}
      </div>
    </div>
  );
}
