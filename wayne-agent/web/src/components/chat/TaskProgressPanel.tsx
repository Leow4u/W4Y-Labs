/**
 * Progresso da tarefa — fiel ao Manus, em dois estados:
 *  - TaskProgressRow (colapsado): uma LINHA integrada ao topo do cartão do
 *    composer — [● azul pulsando | ✓ verde] etapa ativa · │ · m:ss · N/M · ⌄.
 *  - TaskProgressCard (expandido): cartão flutuante acima do composer com o
 *    header "Progresso da tarefa", a lista completa (✓ verdes, ● azul com o
 *    tempo correndo, 🕐 pendentes) e o chevron pra recolher.
 * O tempo mostrado é o DA ETAPA ATIVA (cronometrado no cliente — o protocolo
 * não carrega tempo pra todos), formatado m:ss como no benchmark. A linha viva
 * de status (status.update) aparece como legenda da etapa ativa no expandido.
 */
import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Clock } from "lucide-react";

import { useI18n } from "@/i18n";
import type { ChatProgress } from "@/hooks/useChatSession";
import type { TaskStep } from "./types";

/** 74s → "1:14" (formato do benchmark). */
function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-30" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-live" />
    </span>
  );
}

/** Re-render every second while the turn runs so elapsed timers advance. */
function useTicker(running: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
}

function activeStep(steps: TaskStep[]): TaskStep | undefined {
  return steps.find((s) => s.status === "in_progress");
}

function stepElapsed(step: TaskStep | undefined): number | null {
  if (!step) return null;
  if (step.durationS != null) return step.durationS;
  if (step.startedAt != null) return (Date.now() - step.startedAt) / 1000;
  return null;
}

export function hasProgress(progress: ChatProgress): boolean {
  return progress.running || progress.steps.length > 0;
}

/** Linha colapsada — desenhada pra viver DENTRO do cartão do composer. */
export function TaskProgressRow({
  progress,
  onExpand,
}: {
  progress: ChatProgress;
  onExpand: () => void;
}) {
  const { t } = useI18n();
  useTicker(progress.running);

  const { steps, running, statusText, toolCount, lastActivityAt } = progress;
  const act = activeStep(steps);
  const done = steps.filter((s) => s.status === "completed" || s.status === "cancelled").length;
  // "Ainda pensando" — o provider ficou quieto (sem delta/tool/status) por
  // ~3s no meio do turno (paridade: StreamStallIndicator do desktop).
  const stalled =
    running && lastActivityAt != null && Date.now() - lastActivityAt > 3000;
  const label = stalled
    ? t.chat.stillThinking
    : act?.content ??
      (steps.length > 0
        ? steps[steps.length - 1].content
        : statusText ?? t.chat.working);
  const secs = stepElapsed(act);

  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
    >
      {running ? (
        <LiveDot />
      ) : (
        <Check className="h-4 w-4 shrink-0 text-success" />
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        {label}
      </span>
      {running && secs != null && (
        <>
          <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {fmtClock(secs)}
          </span>
        </>
      )}
      {steps.length > 0 ? (
        <span className="shrink-0 pl-1 text-xs tabular-nums text-muted-foreground">
          {done} / {steps.length}
        </span>
      ) : (
        toolCount > 0 && (
          <span className="shrink-0 pl-1 text-xs tabular-nums text-muted-foreground">
            {toolCount} {t.chat.toolsLabel}
          </span>
        )
      )}
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
    </button>
  );
}

/** Cartão expandido — flutua acima do composer. */
export function TaskProgressCard({
  progress,
  onCollapse,
}: {
  progress: ChatProgress;
  onCollapse: () => void;
}) {
  const { t } = useI18n();
  useTicker(progress.running);

  const { steps, statusText, running, toolCount } = progress;
  const done = steps.filter((s) => s.status === "completed" || s.status === "cancelled").length;

  return (
    <div className="mb-2 rounded-2xl border border-border bg-card p-4 shadow-card">
      <button
        type="button"
        onClick={onCollapse}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-[13px] text-muted-foreground">{t.chat.progressTitle}</span>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {steps.length > 0
            ? `${done} / ${steps.length}`
            : toolCount > 0
              ? `${toolCount} ${t.chat.toolsLabel}`
              : ""}
        </span>
        <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      </button>

      {/* Especialistas do Crew (subagent.*) — Onda B de paridade. */}
      {progress.subagents.length > 0 && (
        <div className="mt-3 border-b border-border/60 pb-3">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t.chat.specialists}
          </div>
          <ul className="space-y-1.5">
            {progress.subagents.map((sa) => {
              const secs =
                sa.durationS ?? (sa.status === "running" ? (Date.now() - sa.startedAt) / 1000 : null);
              return (
                <li key={sa.id} className="flex items-center gap-2.5 text-sm">
                  <span className="flex w-4 shrink-0 justify-center">
                    {sa.status === "running" ? (
                      <LiveDot />
                    ) : sa.status === "error" ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
                    ) : (
                      <Check className="h-4 w-4 text-success" />
                    )}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      sa.status === "running" ? "text-foreground" : "text-muted-foreground"
                    }`}
                    title={sa.label}
                  >
                    {sa.label}
                  </span>
                  {sa.toolCount != null && sa.toolCount > 0 && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                      {sa.toolCount} {t.chat.toolsLabel}
                    </span>
                  )}
                  {secs != null && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {fmtClock(secs)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {steps.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {steps.map((s) => {
            const live = s.status === "in_progress";
            const secs = live ? stepElapsed(s) : null;
            return (
              <li key={s.id} className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="flex w-4 shrink-0 justify-center">
                    {s.status === "completed" ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : live ? (
                      <LiveDot />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
                    )}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      live
                        ? "font-medium text-foreground"
                        : s.status === "completed"
                          ? "text-muted-foreground"
                          : "text-muted-foreground/70"
                    }`}
                  >
                    {s.content}
                  </span>
                  {live && secs != null && (
                    <>
                      <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden />
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {fmtClock(secs)}
                      </span>
                    </>
                  )}
                </div>
                {live && statusText && (
                  <div
                    className="ml-[26px] mt-0.5 truncate text-xs text-muted-foreground/70"
                    title={statusText}
                  >
                    {statusText}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">
          {running ? statusText ?? t.chat.working : t.chat.progressTitle}
        </div>
      )}
    </div>
  );
}
