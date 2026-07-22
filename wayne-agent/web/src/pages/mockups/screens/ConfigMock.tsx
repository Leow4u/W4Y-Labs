import { useState } from "react";
import { Search } from "lucide-react";
import { Switch } from "@nous-research/ui/ui/components/switch";
import { MockSpecBanner } from "../MockupsShell";
import { MOCK_CONFIG_SECTIONS, MOCK_MODELS } from "../mock-data";

export default function ConfigMock() {
  const [section, setSection] = useState("Modelos");

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-background-base">
      <MockSpecBanner />
      <div className="flex min-h-0 flex-1 items-stretch justify-center p-4 sm:p-8">
        <div className="flex min-h-0 w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <aside className="hidden w-52 shrink-0 flex-col border-r border-border sm:flex">
            <div className="relative border-b border-border p-3">
              <Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                readOnly
                placeholder="Buscar…"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 type-ui"
              />
            </div>
            <nav className="flex-1 overflow-y-auto p-2">
              {MOCK_CONFIG_SECTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSection(s)}
                  className={
                    section === s
                      ? "flex w-full rounded-lg bg-muted px-3 py-2 text-left type-ui"
                      : "flex w-full rounded-lg px-3 py-2 text-left type-ui text-muted-foreground hover:bg-muted/50"
                  }
                >
                  {s}
                  {s === "Avançado" && (
                    <span className="ml-auto type-caption opacity-60">?full=1</span>
                  )}
                </button>
              ))}
            </nav>
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto p-6">
            <h1 className="font-mondwest text-display text-sm tracking-[0.06em]">
              {section}
            </h1>

            {section === "Modelos" && (
              <div className="mt-6 space-y-8">
                <fieldset>
                  <legend className="type-body font-medium">Padrão da tarefa</legend>
                  <div className="mt-3 flex flex-wrap gap-4">
                    <label className="flex cursor-pointer items-center gap-2 type-ui">
                      <input type="radio" name="tier" defaultChecked readOnly />
                      Relay
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 type-ui text-muted-foreground">
                      <input type="radio" name="tier" readOnly />
                      MAX (Pro+)
                    </label>
                  </div>
                </fieldset>
                <div>
                  <p className="type-body font-medium">Subagentes — explore</p>
                  <select className="mt-2 rounded-lg border border-border bg-background px-3 py-2 type-ui">
                    <option>Gemini 2.5 Flash</option>
                  </select>
                </div>
                <div>
                  <p className="type-body font-medium">Modelos disponíveis</p>
                  <ul className="mt-3 space-y-3">
                    {MOCK_MODELS.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                      >
                        <span className="type-ui">{m.label}</span>
                        <Switch checked={m.on} disabled onCheckedChange={() => {}} />
                      </li>
                    ))}
                  </ul>
                </div>
                <button type="button" className="type-ui text-muted-foreground">
                  ▶ Chaves API (Pro+)
                </button>
              </div>
            )}

            {section === "Plano e uso" && (
              <div className="mt-6 space-y-4 type-body">
                <p>
                  Plano atual: <strong>Pro</strong>
                </p>
                <p className="text-muted-foreground">847 créditos restantes · renova em 12 dias</p>
                <button type="button" className="rounded-lg border border-border px-4 py-2 type-ui">
                  Gerir assinatura
                </button>
              </div>
            )}

            {section === "Recursos" && (
              <div className="mt-6 space-y-4 type-body text-muted-foreground">
                <p>Permissões de ferramentas e conectores — defaults por tarefa.</p>
                <button type="button" className="type-ui text-primary underline-offset-2 hover:underline">
                  Instalar mais em Integrações →
                </button>
              </div>
            )}

            {section !== "Modelos" &&
              section !== "Plano e uso" &&
              section !== "Recursos" && (
                <p className="mt-6 type-body text-muted-foreground">
                  Conteúdo da seção {section} — mesmo backing do ConfigUser atual,
                  reorganizado na sidebar Cursor parity.
                </p>
              )}
          </main>
        </div>
      </div>
    </div>
  );
}
