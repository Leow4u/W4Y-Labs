import { useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { MockTabs, MockupsShell } from "../MockupsShell";
import { MOCK_CONNECTORS, MOCK_USE_CASES } from "../mock-data";

const TABS = ["Conectores", "Habilidades", "Canais"] as const;

export default function IntegracoesMock() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Conectores");

  return (
    <MockupsShell
      title="Integrações"
      headerEnd={
        <div className="flex gap-2 type-ui">
          <button type="button" className="rounded-lg border border-border px-3 py-1.5">
            Gerir ▾
          </button>
          <button type="button" className="rounded-lg border border-border px-3 py-1.5">
            Criar ▾
          </button>
        </div>
      }
    >
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          readOnly
          placeholder="Pesquisar conectores, habilidades, canais…"
          className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-4 type-ui"
        />
      </div>
      <MockTabs tabs={TABS} active={tab} onChange={(t) => setTab(t as (typeof TABS)[number])} />

      {tab === "Conectores" && (
        <div className="mt-6 space-y-8">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {MOCK_USE_CASES.map((uc) => (
              <div
                key={uc.title}
                className="flex h-[130px] w-[200px] shrink-0 flex-col justify-between rounded-xl border border-border bg-card p-3"
              >
                <div>
                  <span className="type-caption text-muted-foreground">{uc.app}</span>
                  <p className="mt-2 line-clamp-2 type-ui font-medium">{uc.title}</p>
                </div>
                <span className="type-caption text-muted-foreground">→ Nova tarefa</span>
              </div>
            ))}
          </div>
          <p className="type-ui text-muted-foreground">
            Conectados: Gmail ✓ · Sheets ✓
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {MOCK_CONNECTORS.map((c) => (
              <div
                key={c.name}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <span className="type-ui font-medium">{c.name}</span>
                {c.connected && <CheckCircle2 className="h-4 w-4 text-live" />}
              </div>
            ))}
          </div>
          <button type="button" className="type-ui text-primary underline-offset-2 hover:underline">
            Ver catálogo completo →
          </button>
        </div>
      )}

      {tab === "Habilidades" && (
        <p className="mt-6 type-body text-muted-foreground">
          Marketplace de skills — mesma curadoria do hub atual, com displayName PT.
        </p>
      )}

      {tab === "Canais" && (
        <p className="mt-6 type-body text-muted-foreground">
          WhatsApp-first · Telegram · Slack — conectar canal por agente ou global.
        </p>
      )}
    </MockupsShell>
  );
}
