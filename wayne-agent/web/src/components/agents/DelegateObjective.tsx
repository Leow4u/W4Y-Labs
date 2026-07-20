/**
 * DelegateObjective — "delegate an objective" (Operations): the owner writes
 * ONE objective, a throwaway flash turn (lib/delegate-draft) splits it into
 * 2-6 subtasks across the roster, and the proposal renders as a DAG-ish
 * column layout (columns = dependency depth). Approving creates REAL kanban
 * tasks (parents wired, roots land `ready` and start working immediately)
 * plus one cron routine when the plan includes a recurring step.
 *
 * Rendered via createPortal(document.body) — same lesson as AgentDrawer:
 * transformed ancestors break position:fixed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Loader2, RefreshCcw, SlidersHorizontal, X } from "lucide-react";

import { api } from "@/lib/api";
import { agentMonogram, prettifySlug, realAgents } from "@/lib/agents";
import {
  draftPlan,
  planStepDepths,
  scheduleStateFromRecurring,
  topologicalOrder,
  type RosterEntry,
  type TeamPlan,
} from "@/lib/delegate-draft";
import { buildScheduleString } from "@/lib/schedule";
import { useScheduleText } from "@/hooks/useScheduleText";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { Button } from "@nous-research/ui/ui/components/button";
import { useI18n } from "@/i18n";
import { cn, themedBody } from "@/lib/utils";


type Phase = "input" | "drafting" | "error" | "preview" | "creating";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-live/50";

/** Cost estimate in credits: a flat guess per subtask (honest label: "~"). */
const CREDITS_PER_STEP = 25;

export function DelegateObjective({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  /** All tasks/routines created — parent refreshes the board + toasts. */
  onStarted: () => void;
}) {
  // Mount/unmount on open: every opening starts from a FRESH panel (no
  // reset-state-in-effect dance) and closed = zero cost.
  if (!open) return null;
  return <DelegatePanel onClose={onClose} onStarted={onStarted} />;
}

function DelegatePanel({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: () => void;
}) {
  const { t } = useI18n();
  const ag = t.agents;
  const scheduleText = useScheduleText();
  const modalRef = useModalBehavior({ open: true, onClose });

  const [phase, setPhase] = useState<Phase>("input");
  const [objective, setObjective] = useState("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [plan, setPlan] = useState<TeamPlan | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  /** Creation failure detail — surfaced verbatim, never pretended away. */
  const [createError, setCreateError] = useState<string | null>(null);

  // Roster = the real agents, and ONLY them. There is no fallback to the full
  // profile list: on a fresh installation that fallback offered `default` (the
  // installation itself) as an assignee, and the dispatcher refuses to spawn
  // it — the plan would be created and then stall. Empty roster = say so.
  useEffect(() => {
    let dead = false;
    api
      .getProfiles()
      .then((r) => {
        if (dead) return;
        setRoster(realAgents(r.profiles).map((p) => ({ name: p.name, description: p.description })));
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);

  const runDraft = useCallback(() => {
    const obj = objective.trim();
    if (!obj || roster.length === 0) return;
    setPhase("drafting");
    setCreateError(null);
    draftPlan(obj, roster)
      .then((p) => {
        setPlan(p);
        setAdjusting(false);
        setPhase("preview");
      })
      .catch(() => setPhase("error"));
  }, [objective, roster]);

  const approve = useCallback(async () => {
    if (!plan || phase === "creating") return;
    setPhase("creating");
    setCreateError(null);
    try {
      // Dependency order: parents are created before children so the kanban
      // links point at real ids. Roots land `ready` → the dispatcher wakes up
      // right away and they START WORKING immediately (that is the point).
      const order = topologicalOrder(plan.steps);
      const createdIds = new Map<number, string>();
      for (const idx of order) {
        const step = plan.steps[idx];
        if (step.recurring) {
          // A routine is a cron job on the assignee's OWN profile — the same
          // shape AgentQuickstart/AgentDrawer use (name + prompt + schedule).
          const schedule = buildScheduleString(scheduleStateFromRecurring(step.recurring));
          await api.createCronJob(
            { name: step.title, prompt: (step.body || step.title).trim(), schedule },
            step.assignee,
          );
          continue;
        }
        const parents = step.depends_on
          .map((p) => createdIds.get(p))
          .filter((v): v is string => Boolean(v));
        const res = await api.createKanbanTask({
          title: step.title,
          body: step.body || undefined,
          assignee: step.assignee,
          parents: parents.length ? parents : undefined,
        });
        const id =
          (res as { task?: { id?: unknown } }).task?.id ?? (res as { id?: unknown }).id;
        if (typeof id === "string") createdIds.set(idx, id);
      }
      onStarted();
    } catch (e) {
      // Mid-way failure: some tasks may already exist on the board — say so
      // with the raw error instead of pretending everything went through.
      setCreateError(String(e));
      setPhase("preview");
    }
  }, [plan, phase, onStarted]);

  const patchStep = (i: number, patch: Partial<TeamPlan["steps"][number]>) =>
    setPlan((p) =>
      p ? { steps: p.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) } : p,
    );

  // Preview layout: group step indices by dependency depth (0, 1, …).
  const depthGroups = useMemo(() => {
    if (!plan) return [] as number[][];
    const depths = planStepDepths(plan.steps);
    const groups: number[][] = [];
    depths.forEach((d, i) => {
      (groups[d] ??= []).push(i);
    });
    return groups;
  }, [plan]);

  const distinctAssignees = useMemo(
    () => (plan ? new Set(plan.steps.map((s) => s.assignee)).size : 0),
    [plan],
  );

  return createPortal(
    <div className={cn(themedBody, "fixed inset-0 z-50")}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={modalRef}
          className="relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          <Button
            ghost
            size="icon"
            onClick={onClose}
            className="absolute right-2 top-2 z-10 text-muted-foreground hover:text-foreground"
            aria-label={t.common.close}
          >
            <X className="h-4 w-4" />
          </Button>

          <header className="border-b border-border p-5 pb-3 pr-12">
            <h2 className="text-base font-semibold text-foreground">{ag.delegateTitle}</h2>
            {phase === "preview" && plan && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="type-caption text-muted-foreground">{ag.delegateProposal}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {ag.delegateAgentsCost
                    .replace("{count}", String(distinctAssignees))
                    .replace("{cost}", String(plan.steps.length * CREDITS_PER_STEP))}
                </span>
              </div>
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {(phase === "input" || phase === "drafting" || phase === "error") && (
              <div className="grid gap-4">
                <textarea
                  className={cn(inputCls, "min-h-[120px] resize-y")}
                  autoFocus
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder={ag.delegatePlaceholder}
                  disabled={phase === "drafting"}
                />
                {phase === "drafting" && (
                  <p className="animate-pulse text-sm text-muted-foreground">
                    {ag.delegateDrafting}
                  </p>
                )}
                {phase === "error" && (
                  <p className="text-sm text-live-ink">{ag.delegateError}</p>
                )}
                {roster.length === 0 && phase === "input" && (
                  <p className="text-sm text-muted-foreground">
                    <Link className="underline underline-offset-2" to="/profiles/quickstart">
                      {ag.opsNoAgentsYet}
                    </Link>
                  </p>
                )}
                <div className="flex justify-end">
                  <Button
                    onClick={runDraft}
                    disabled={
                      !objective.trim() || roster.length === 0 || phase === "drafting"
                    }
                  >
                    {phase === "drafting" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {phase === "error" ? t.common.retry : ag.delegateTitle}
                  </Button>
                </div>
              </div>
            )}

            {(phase === "preview" || phase === "creating") && plan && (
              <div className="overflow-x-auto pb-1">
                <div className="flex items-stretch gap-3">
                  {depthGroups.map((group, depth) => (
                    <div
                      key={depth}
                      className={cn(
                        "flex w-64 shrink-0 flex-col gap-3",
                        depth > 0 && "border-l border-dashed border-border pl-3",
                      )}
                    >
                      {group.map((i) => {
                        const step = plan.steps[i];
                        const parentTitles = step.depends_on
                          .map((p) => plan.steps[p]?.title)
                          .filter(Boolean)
                          .join(", ");
                        return (
                          <div
                            key={i}
                            className="min-w-0 rounded-xl border border-border bg-background p-3 shadow-card"
                          >
                            <div className="flex items-center gap-2">
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground/80 text-xs font-semibold text-background">
                                {agentMonogram(step.assignee)}
                              </span>
                              {adjusting ? (
                                <select
                                  className={cn(inputCls, "h-7 flex-1 px-1.5 py-0 text-xs")}
                                  value={step.assignee}
                                  onChange={(e) => patchStep(i, { assignee: e.target.value })}
                                >
                                  {roster.map((r) => (
                                    <option key={r.name} value={r.name}>
                                      {prettifySlug(r.name)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="truncate text-xs text-muted-foreground">
                                  {prettifySlug(step.assignee)}
                                </span>
                              )}
                            </div>
                            {adjusting ? (
                              <input
                                className={cn(inputCls, "mt-2 px-2 py-1 text-sm")}
                                value={step.title}
                                onChange={(e) => patchStep(i, { title: e.target.value })}
                              />
                            ) : (
                              <p className="mt-2 text-sm font-medium leading-snug text-foreground">
                                {step.title}
                              </p>
                            )}
                            {step.body && (
                              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                                {step.body}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {group.length > 1 && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {ag.delegateParallel}
                                </span>
                              )}
                              {parentTitles && (
                                <span
                                  className="max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                  title={parentTitles}
                                >
                                  {ag.delegateDependsOn.replace("{task}", parentTitles)}
                                </span>
                              )}
                              {step.recurring && (
                                <span className="rounded-full bg-live/10 px-2 py-0.5 text-xs text-live">
                                  {"↻ "}
                                  {scheduleText({
                                    kind: "cron",
                                    expr: buildScheduleString(
                                      scheduleStateFromRecurring(step.recurring),
                                    ),
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {createError && (
                  <p className="mt-3 break-all text-xs text-live">
                    {t.status.error}: {createError}
                  </p>
                )}
              </div>
            )}
          </div>

          {(phase === "preview" || phase === "creating") && plan && (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-5 pt-3">
              <Button ghost onClick={runDraft} disabled={phase === "creating"}>
                <RefreshCcw className="h-3.5 w-3.5" />
                {ag.delegateRedo}
              </Button>
              <Button
                ghost
                onClick={() => setAdjusting((v) => !v)}
                disabled={phase === "creating"}
                className={cn(adjusting && "text-foreground")}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {ag.delegateAdjust}
              </Button>
              <Button onClick={() => void approve()} disabled={phase === "creating"}>
                {phase === "creating" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {phase === "creating" ? t.common.creating : ag.delegateApprove}
              </Button>
            </footer>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
