/**
 * EnvironmentCard — o "computador do Wayne" (Onda 2, referência Manus/Codex).
 *
 * Card flutuante no canto do transcript mostrando o AMBIENTE da tarefa em
 * tempo real, tudo derivado de dados que já chegam pela conexão da sessão
 * (zero backend novo):
 *
 *   Tarefas      progress.steps (o todo vivo do turno)
 *   Subagentes   progress.subagents (subagent.* — Crew)
 *   Navegador    URLs extraídas das ferramentas web/browser
 *   Fontes       domínios únicos consultados (chips)
 *   Alterações   +N −M agregado dos inline_diff das ferramentas de edição
 *
 * Recolhe num chip ("Ambiente · resumo"); expande num painel. Preferência
 * do usuário em localStorage; sem preferência, auto-abre quando o turno
 * está rodando E há conteúdo — "ver tudo acontecendo" sem poluir o chat.
 */
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Circle,
  FileDiff,
  Globe,
  Loader2,
  Monitor,
  Users,
  XCircle,
} from "lucide-react";

import { useI18n } from "@/i18n";
import type { SubagentInfo } from "@/hooks/useChatSession";
import type { TaskStep } from "./types";

export interface EnvChangedFile {
  path: string;
  added: number;
  removed: number;
}
export interface EnvUrl {
  url: string;
  domain: string;
}

const PREF_KEY = "wayne:env-card";

function fmtElapsed(startedAt: number, durationS?: number): string {
  const s = durationS ?? (Date.now() - startedAt) / 1000;
  if (s < 60) return `${Math.max(1, Math.round(s))}s`;
  return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

function SectionTitle({ icon: Icon, label }: { icon: typeof Globe; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span className="type-caption font-medium uppercase tracking-[0.05em]">{label}</span>
    </div>
  );
}

export function EnvironmentCard({
  busy,
  steps,
  subagents,
  urls,
  files,
  added,
  removed,
}: {
  busy: boolean;
  steps: TaskStep[];
  subagents: SubagentInfo[];
  urls: EnvUrl[];
  files: EnvChangedFile[];
  added: number;
  removed: number;
}) {
  const { t } = useI18n();

  const hasContent =
    steps.length > 0 || subagents.length > 0 || urls.length > 0 || files.length > 0;

  // Preferência: "open" | "chip" (localStorage). Sem preferência, auto-abre
  // na 1ª vez que o turno roda com conteúdo.
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(PREF_KEY) === "open";
    } catch {
      return false;
    }
  });
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!busy || !hasContent || autoOpenedRef.current) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(PREF_KEY);
    } catch {
      /* modo privado */
    }
    if (stored === null) {
      autoOpenedRef.current = true;
      setOpen(true);
    }
  }, [busy, hasContent]);
  const setOpenPersist = (v: boolean) => {
    setOpen(v);
    try {
      window.localStorage.setItem(PREF_KEY, v ? "open" : "chip");
    } catch {
      /* modo privado */
    }
  };

  // Painel completo de subagentes (Onda 6) — overlay a partir da seção.
  const [agentsOpen, setAgentsOpen] = useState(false);
  // Relógio 1s pros tempos vivos dos subagentes.
  const [, tick] = useState(0);
  const anyRunning = subagents.some((s) => s.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  // ── Overlay completo de subagentes (Onda 6) ──────────────────────
  const agentsOverlay = agentsOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-6 backdrop-blur-[2px]"
      onClick={() => setAgentsOpen(false)}
    >
      <div
        className="flex max-h-[80vh] w-[min(720px,94vw)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate type-ui font-semibold text-foreground">
            {t.chat.agentsPanelTitle}
          </span>
          <span className="shrink-0 type-caption tabular-nums text-muted-foreground">
            {subagents.filter((a) => a.status === "running").length}/{subagents.length}
          </span>
          <button
            type="button"
            aria-label={t.common.close}
            onClick={() => setAgentsOpen(false)}
            className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {subagents.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/50"
            >
              {a.status === "running" ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-live" />
              ) : a.status === "error" ? (
                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <Check className="h-4 w-4 shrink-0 text-success" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate type-body text-foreground">{a.label}</span>
                <span className="block truncate type-caption text-muted-foreground">
                  {[
                    a.model,
                    fmtElapsed(a.startedAt, a.durationS),
                    a.toolCount != null ? `${a.toolCount} ${t.chat.toolsLabel}` : null,
                    a.tokensIn != null || a.tokensOut != null
                      ? `${a.tokensIn ?? 0}▸${a.tokensOut ?? 0}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  if (!hasContent && !busy) return null;

  // ── Chip recolhido ────────────────────────────────────────────────
  if (!open) {
    const bits: string[] = [];
    if (subagents.length > 0) bits.push(`${subagents.length} ${t.chat.envAgents.toLowerCase()}`);
    if (added + removed > 0) bits.push(`+${added} −${removed}`);
    return (
      <>
      {agentsOverlay}
      <button
        type="button"
        onClick={() => setOpenPersist(true)}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 shadow-pop transition-colors hover:border-foreground/25"
        title={t.chat.envTitle}
      >
        {busy ? (
          <span className="relative grid h-3 w-3 place-items-center">
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-live/40" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
          </span>
        ) : (
          <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="type-ui font-medium text-foreground">{t.chat.envTitle}</span>
        {bits.length > 0 && (
          <span className="type-caption tabular-nums text-muted-foreground">
            {bits.join(" · ")}
          </span>
        )}
      </button>
      </>
    );
  }


  // ── Card expandido ────────────────────────────────────────────────
  const shownAgents = subagents.slice(0, 6);
  const lastUrl = urls[urls.length - 1];
  const olderUrls = urls.slice(0, -1).slice(-3).reverse();
  const domains = [...new Set(urls.map((u) => u.domain))];
  const shownFiles = files.slice(-4).reverse();

  return (
    <>
    {agentsOverlay}
    <div className="pointer-events-auto flex max-h-[68vh] w-[300px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-pop">
      <div className="flex items-center gap-2 border-b border-border/70 px-3.5 py-2.5">
        {busy ? (
          <span className="relative grid h-3 w-3 shrink-0 place-items-center">
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-live/40" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
          </span>
        ) : (
          <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate type-ui font-semibold text-foreground">
          {t.chat.envTitle}
        </span>
        <button
          type="button"
          onClick={() => setOpenPersist(false)}
          aria-label={t.common.close}
          className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 space-y-3.5 overflow-y-auto px-3.5 py-3">
        {/* Tarefas (todo vivo) */}
        {steps.length > 0 && (
          <section className="space-y-1.5">
            <SectionTitle icon={Check} label={t.chat.envTasks} />
            <div className="space-y-1">
              {steps.map((s) => (
                <div key={s.id} className="flex items-start gap-1.5 type-caption">
                  {s.status === "completed" ? (
                    <Check className="mt-px h-3 w-3 shrink-0 text-success" />
                  ) : s.status === "in_progress" ? (
                    <Loader2 className="mt-px h-3 w-3 shrink-0 animate-spin text-live" />
                  ) : s.status === "cancelled" ? (
                    <XCircle className="mt-px h-3 w-3 shrink-0 text-muted-foreground/50" />
                  ) : (
                    <Circle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                  )}
                  <span
                    className={
                      s.status === "completed"
                        ? "text-muted-foreground line-through decoration-border"
                        : s.status === "in_progress"
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                    }
                  >
                    {s.content}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Subagentes (Crew) — o título abre o painel completo (Onda 6). */}
        {subagents.length > 0 && (
          <section className="space-y-1.5">
            <button
              type="button"
              onClick={() => setAgentsOpen(true)}
              className="flex w-full items-center gap-1.5 rounded text-left text-muted-foreground transition-colors hover:text-foreground"
              title={t.chat.agentsPanelTitle}
            >
              <Users className="h-3.5 w-3.5" />
              <span className="type-caption font-medium uppercase tracking-[0.05em]">
                {t.chat.envAgents}
              </span>
              <span className="ml-auto type-micro text-muted-foreground/50">›</span>
            </button>
            <div className="space-y-1">
              {shownAgents.map((a) => (
                <div key={a.id} className="flex items-center gap-2 type-caption">
                  {a.status === "running" ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-live" />
                  ) : a.status === "error" ? (
                    <XCircle className="h-3 w-3 shrink-0 text-destructive" />
                  ) : (
                    <Check className="h-3 w-3 shrink-0 text-success" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-foreground">{a.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground/70">
                    {fmtElapsed(a.startedAt, a.durationS)}
                  </span>
                </div>
              ))}
              {subagents.length > shownAgents.length && (
                <div className="type-caption text-muted-foreground/70">
                  +{subagents.length - shownAgents.length}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Navegador — a última página que o agente olhou + anteriores */}
        {lastUrl && (
          <section className="space-y-1.5">
            <SectionTitle icon={Globe} label={t.chat.envBrowser} />
            <a
              href={lastUrl.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-border bg-background px-2.5 py-2 transition-colors hover:border-foreground/25"
            >
              <span className="block truncate type-caption font-medium text-foreground">
                {lastUrl.domain}
              </span>
              <span className="block truncate type-micro text-muted-foreground">
                {lastUrl.url}
              </span>
            </a>
            {olderUrls.map((u) => (
              <a
                key={u.url}
                href={u.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate type-micro text-muted-foreground transition-colors hover:text-foreground"
              >
                {u.url}
              </a>
            ))}
          </section>
        )}

        {/* Fontes — domínios únicos consultados */}
        {domains.length > 1 && (
          <section className="space-y-1.5">
            <SectionTitle icon={Globe} label={t.chat.envSources} />
            <div className="flex flex-wrap gap-1">
              {domains.slice(0, 8).map((d) => (
                <span
                  key={d}
                  className="rounded-full border border-border bg-background px-2 py-0.5 type-micro text-muted-foreground"
                >
                  {d}
                </span>
              ))}
              {domains.length > 8 && (
                <span className="px-1 type-micro text-muted-foreground/70">
                  +{domains.length - 8}
                </span>
              )}
            </div>
          </section>
        )}

        {/* Alterações — +N −M dos diffs */}
        {files.length > 0 && (
          <section className="space-y-1.5">
            <SectionTitle icon={FileDiff} label={t.chat.envChanges} />
            {added + removed > 0 && (
              <div className="type-caption tabular-nums">
                <span className="font-medium text-success">+{added}</span>{" "}
                <span className="font-medium text-destructive">−{removed}</span>
              </div>
            )}
            <div className="space-y-0.5">
              {shownFiles.map((f) => (
                <div key={f.path} className="flex items-center gap-2 type-micro">
                  <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                    {f.path.split(/[/\\]/).pop()}
                  </span>
                  {/* diffs sem formato +/− (ex. write inteiro) ficam sem números */}
                  {f.added + f.removed > 0 && (
                    <span className="shrink-0 tabular-nums">
                      <span className="text-success">+{f.added}</span>{" "}
                      <span className="text-destructive">−{f.removed}</span>
                    </span>
                  )}
                </div>
              ))}
              {files.length > shownFiles.length && (
                <div className="type-micro text-muted-foreground/70">
                  +{files.length - shownFiles.length}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
    </>
  );
}
