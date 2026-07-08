import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Loader2, XCircle } from "lucide-react";

import { useI18n } from "@/i18n";
import type { ChatProgress } from "@/hooks/useChatSession";
import type { TaskStep } from "./types";

function fmt(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

function StepIcon({ status }: { status: TaskStep["status"] }) {
  if (status === "in_progress") return <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />;
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (status === "cancelled") return <XCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />;
}

/**
 * Sticky task-progress chip above the composer (Manus-style): the agent's todo
 * steps with status + client-clocked time, an overall turn timer, and the live
 * "doing now" status line. Falls back to a minimal working/tool-count line when
 * the turn has no todo plan.
 */
export function TaskProgressPanel({ progress }: { progress: ChatProgress }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [, setTick] = useState(0);

  const { steps, statusText, turnStartedAt, running, toolCount } = progress;

  // Re-render every second while running so the elapsed timers advance.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!running && steps.length === 0) return null;

  const elapsed = turnStartedAt ? (Date.now() - turnStartedAt) / 1000 : null;
  const done = steps.filter((s) => s.status === "completed" || s.status === "cancelled").length;

  return (
    <div className="mb-2 rounded-xl border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-foreground" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
        )}
        <span className="text-xs font-semibold text-foreground">{t.chat.taskProgress}</span>
        {steps.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {done}/{steps.length}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          {elapsed != null && <span>{fmt(elapsed)}</span>}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2">
          {steps.length > 0 ? (
            <ul className="space-y-1.5">
              {steps.map((s) => {
                const secs =
                  s.durationS != null
                    ? s.durationS
                    : s.status === "in_progress" && s.startedAt
                      ? (Date.now() - s.startedAt) / 1000
                      : null;
                return (
                  <li key={s.id} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 shrink-0">
                      <StepIcon status={s.status} />
                    </span>
                    <span
                      className={`min-w-0 flex-1 ${
                        s.status === "in_progress" ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {s.content}
                    </span>
                    {secs != null && (
                      <span className="shrink-0 tabular-nums text-muted-foreground/70">{fmt(secs)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-xs text-muted-foreground">
              {running ? t.chat.working : t.chat.taskProgress}
              {toolCount > 0 && (
                <>
                  {" · "}
                  {toolCount} {t.chat.toolsLabel}
                </>
              )}
            </div>
          )}
          {statusText && (
            <div className="mt-2 truncate text-xs text-muted-foreground/80" title={statusText}>
              {statusText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
