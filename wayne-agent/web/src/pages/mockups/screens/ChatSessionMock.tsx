import { FileSpreadsheet, Globe, Terminal } from "lucide-react";
import {
  MockComposerBar,
  MockUsageFooter,
  MockupsShell,
} from "../MockupsShell";
import { MOCK_SUBAGENTS } from "../mock-data";

export default function ChatSessionMock() {
  return (
    <MockupsShell
      title="Pesquisa mercado"
      headerEnd={
        <div className="flex gap-2 type-ui text-muted-foreground">
          <button type="button" className="hover:text-foreground">
            Renomear
          </button>
          <button type="button" className="hover:text-foreground">
            ⋯
          </button>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 type-body">
          <p className="text-muted-foreground">Usuário</p>
          <p className="mt-1">Preciso de um relatório de mercado em planilha.</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <p className="type-ui text-muted-foreground">Assistente</p>
          <p className="mt-1 type-body">
            Vou delegar ao Analista e gerar a planilha. Acompanhe no Ambiente abaixo.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 type-ui">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>relatorio.xlsx</span>
            <button type="button" className="text-primary underline-offset-2 hover:underline">
              Ver em Entregas
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="type-caption font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Ambiente
            </span>
            <span className="type-caption text-muted-foreground">2 agentes · ao vivo</span>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <p className="type-caption text-muted-foreground">Subagentes</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {MOCK_SUBAGENTS.map((a) => (
                  <span
                    key={a.name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 type-ui"
                  >
                    <span
                      className={
                        a.status === "running"
                          ? "h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
                          : "h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
                      }
                    />
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="type-ui text-muted-foreground">
              Processos: indexando… · gerando-xlsx
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 type-ui hover:bg-muted/50"
              >
                <Globe className="h-3.5 w-3.5" /> Browser
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 type-ui hover:bg-muted/50"
              >
                <Terminal className="h-3.5 w-3.5" /> Terminal
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 type-ui hover:bg-muted/50"
              >
                Alterações
              </button>
            </div>
          </div>
        </div>

        <MockComposerBar />
        <MockUsageFooter credits="623 cr" context="sessão · 34% contexto" />
      </div>
    </MockupsShell>
  );
}
