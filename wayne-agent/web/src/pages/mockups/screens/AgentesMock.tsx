import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import { MockTabs, MockupsShell } from "../MockupsShell";
import { MOCK_AGENTS, MOCK_KANBAN } from "../mock-data";

const TABS = ["Equipe", "Trabalho", "Governança"] as const;

export default function AgentesMock() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Equipe");

  return (
    <MockupsShell
      title="Agentes"
      headerEnd={
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Novo agente
        </Button>
      }
    >
      <MockTabs tabs={TABS} active={tab} onChange={(t) => setTab(t as (typeof TABS)[number])} />

      {tab === "Equipe" && (
        <div className="mt-6 space-y-6">
          <p className="type-ui text-muted-foreground">
            3 trabalhando · R$847/mês
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MOCK_AGENTS.map((a) => (
              <div
                key={a.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="type-body font-medium">{a.name}</h3>
                    <span
                      className={
                        a.status === "working"
                          ? "mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 type-caption text-emerald-600"
                          : "mt-1 type-caption text-muted-foreground"
                      }
                    >
                      {a.status === "working" && (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      )}
                      {a.statusLabel}
                    </span>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted type-ui font-medium">
                    {a.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <p className="mt-4 type-caption text-muted-foreground">
                  {a.spend} / {a.cap} cr este mês
                </p>
                <button
                  type="button"
                  className="mt-3 type-ui text-primary underline-offset-2 hover:underline"
                >
                  Ver time →
                </button>
              </div>
            ))}
            <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-border type-ui text-muted-foreground">
              <Plus className="mb-2 h-6 w-6" />
              Novo agente
            </div>
          </div>
          <Button className="border border-border bg-background text-foreground hover:bg-muted">
            Delegar objetivo →
          </Button>
        </div>
      )}

      {tab === "Trabalho" && (
        <div className="mt-6 overflow-x-auto">
          <div className="flex min-w-[800px] gap-3">
            {MOCK_KANBAN.map((col) => (
              <div
                key={col.col}
                className="w-44 shrink-0 rounded-xl border border-border bg-muted/20 p-3"
              >
                <h3 className="type-caption font-medium uppercase tracking-[0.06em] text-muted-foreground">
                  {col.col}
                </h3>
                <ul className="mt-2 space-y-2">
                  {col.items.map((item) => (
                    <li
                      key={item}
                      className="rounded-lg border border-border bg-card px-2 py-2 type-ui"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "Governança" && (
        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="type-body font-medium">Aprovação pendente</p>
            <p className="mt-1 type-ui text-muted-foreground">
              Marketing quer enviar e-mail para lista de clientes
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm">Aprovar</Button>
              <Button size="sm" className="border border-border bg-background text-foreground hover:bg-muted">
                Negar
              </Button>
            </div>
          </div>
        </div>
      )}
    </MockupsShell>
  );
}
