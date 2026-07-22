import { useState } from "react";
import { MockTabs, MockupsShell } from "../MockupsShell";
import { MOCK_BLUEPRINTS, MOCK_ROUTINES } from "../mock-data";

const TABS = ["Rotinas", "Calendário"] as const;
const CHIPS = ["Resumir e-mails", "Planilha semanal", "Posts sociais"];

export default function AgendaMock() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Rotinas");

  return (
    <MockupsShell title="Agenda">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <MockTabs tabs={TABS} active={tab} onChange={(t) => setTab(t as (typeof TABS)[number])} />
        <button type="button" className="rounded-lg border border-border px-3 py-1.5 type-ui">
          Agente: Todos ▾
        </button>
      </div>

      {tab === "Rotinas" ? (
        <div className="space-y-8">
          <div>
            <p className="type-body font-medium">O que você quer automatizar?</p>
            <div className="mt-3 rounded-2xl border border-border bg-card p-4">
              <input
                readOnly
                placeholder="Descreva a rotina…"
                className="w-full bg-transparent type-body outline-none"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="rounded-full border border-border px-3 py-1 type-ui text-muted-foreground hover:bg-muted/50"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <section>
            <h2 className="type-caption font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Suas rotinas
            </h2>
            <ul className="mt-3 space-y-2">
              {MOCK_ROUTINES.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div>
                    <span className="type-body font-medium">📣 {r.title}</span>
                    <span className="ml-2 type-ui text-muted-foreground">
                      · {r.schedule} · Agente {r.agent}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="type-ui text-primary underline-offset-2 hover:underline"
                  >
                    Ver agente →
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="type-caption font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Ou comece com um modelo
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {MOCK_BLUEPRINTS.map((b) => (
                <button
                  key={b.title}
                  type="button"
                  className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/20"
                >
                  <p className="type-body font-medium">{b.title}</p>
                  <p className="mt-1 type-ui text-muted-foreground">{b.desc}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <p className="type-body text-muted-foreground">
          Vista calendário — rotinas e eventos agendados por agente.
        </p>
      )}
    </MockupsShell>
  );
}
