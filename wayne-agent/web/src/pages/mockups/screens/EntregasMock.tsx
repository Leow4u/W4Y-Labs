import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { MockTabs, MockupsShell } from "../MockupsShell";
import { MOCK_DELIVERABLES } from "../mock-data";

const TABS = ["Entregas", "Workspace"] as const;

function kindIcon(kind: "xlsx" | "pdf") {
  return kind === "xlsx" ? FileSpreadsheet : FileText;
}

export default function EntregasMock() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Entregas");

  const grouped = MOCK_DELIVERABLES.reduce<
    Record<string, typeof MOCK_DELIVERABLES>
  >((acc, d) => {
    const key = d.when.startsWith("2") ? "Hoje" : "Esta semana";
    acc[key] = acc[key] ?? [];
    acc[key].push(d);
    return acc;
  }, {});

  return (
    <MockupsShell
      title="Entregas"
      headerEnd={
        <div className="flex gap-2">
          <input
            readOnly
            placeholder="Buscar"
            className="rounded-lg border border-border bg-background px-3 py-1.5 type-ui"
          />
          <button type="button" className="rounded-lg border border-border px-3 py-1.5 type-ui">
            Filtro ▾
          </button>
        </div>
      }
    >
      <MockTabs tabs={TABS} active={tab} onChange={(t) => setTab(t as (typeof TABS)[number])} />
      {tab === "Workspace" ? (
        <p className="mt-6 type-body text-muted-foreground">
          Explorer técnico — disponível em Pro+. Ver pasta do projeto, logs e arquivos brutos.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {Object.entries(grouped).map(([label, items]) => (
            <section key={label}>
              <h2 className="type-caption font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {label}
              </h2>
              <ul className="mt-3 space-y-2">
                {items.map((d) => {
                  const Icon = kindIcon(d.kind);
                  return (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                    >
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 type-body font-medium">{d.name}</span>
                      <span className="type-ui text-muted-foreground">
                        {d.task} · {d.when}
                      </span>
                      <button type="button" className="rounded-lg p-2 hover:bg-muted/50">
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="type-ui text-primary underline-offset-2 hover:underline"
                      >
                        Tarefa →
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <button type="button" className="type-ui text-muted-foreground hover:text-foreground">
            Ver workspace avançado →
          </button>
        </div>
      )}
    </MockupsShell>
  );
}
