/**
 * OperationsPage — Operations (Agents module, Onda 3): the team's task board,
 * CURATED on top of the native kanban plugin (/api/plugins/kanban).
 *
 * The native board has 8 states (triage/todo/scheduled/ready/running/blocked/
 * review/done); the curation groups them into 5 product columns. The magic
 * flow: create a task with a responsible agent and "Colocar pra rodar"
 * (status→ready) — the native dispatcher wakes up RIGHT AWAY and spawns
 * `wayne -p <assignee>` with the agent's WAYNE_HOME (its soul/model/skills).
 * Review → "Aprovar" is the real Human-in-the-Loop. A light poll keeps the
 * board alive.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleCheck, Loader2, Plus, Play, RotateCcw, ThumbsUp, X } from "lucide-react";

import { api } from "@/lib/api";
import type { KanbanBoardResponse, KanbanTask, KanbanWorker, ProfileInfo } from "@/lib/api";
import { DelegateObjective } from "@/components/agents/DelegateObjective";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { Button } from "@nous-research/ui/ui/components/button";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn, themedBody } from "@/lib/utils";

function prettify(name: string): string {
  const s = name.replace(/[-_]+/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
function monogram(name: string): string {
  const parts = prettify(name).split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return prettify(name).slice(0, 2).toUpperCase();
}

/** Compact "time ago" from an age in seconds (units only). */
function ageShort(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

/** Worker elapsed time as mm:ss (started_at = epoch seconds). */
function elapsedMmSs(startedAt: number | null | undefined, nowSec: number): string {
  if (startedAt == null || !Number.isFinite(startedAt) || nowSec <= 0) return "";
  const s = Math.max(0, Math.floor(nowSec - startedAt));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss < 10 ? "0" : ""}${ss}`;
}

/** Defensive epoch reader: the board payload stores completed_at as epoch
 *  seconds (INTEGER in kanban.db), but accept ISO strings too. */
function toEpochSeconds(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return parsed / 1000;
  }
  return null;
}

/** Curation: 8 native states → 5 product columns. */
const COLUMN_MAP: Array<{ key: string; statuses: string[] }> = [
  { key: "backlog", statuses: ["triage", "todo", "scheduled"] },
  { key: "queued", statuses: ["ready"] },
  { key: "running", statuses: ["running", "blocked"] },
  { key: "review", statuses: ["review"] },
  { key: "done", statuses: ["done"] },
];

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-live/50";

export default function OperationsPage() {
  const { t } = useI18n();
  const ag = t.agents;
  const { toast, showToast } = useToast();
  const { setTitle, setEnd } = usePageHeader();

  const [board, setBoard] = useState<KanbanBoardResponse | null>(null);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [workers, setWorkers] = useState<KanbanWorker[]>([]);
  const [creating, setCreating] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);

  // New task form.
  const [fTitle, setFTitle] = useState("");
  const [fBody, setFBody] = useState("");
  const [fAssignee, setFAssignee] = useState("default");
  const [fHigh, setFHigh] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(ag.opsTab);
    return () => setTitle(null);
  }, [setTitle, ag.opsTab]);

  // Wall clock (epoch seconds) for elapsed/age labels — fed by the board
  // poll (server `now`) and a 1s tick while workers run; never read in
  // render directly (purity rule).
  const [nowSec, setNowSec] = useState(0);

  const load = useCallback((silent = false) => {
    api
      .getKanbanBoard()
      .then((b) => {
        setBoard(b);
        setNowSec(Number.isFinite(b.now) && b.now > 0 ? b.now : Date.now() / 1000);
      })
      .catch(() => {
        if (!silent) setBoard(null);
      });
    // Live workers ride the same 8s cadence as the board poll.
    api
      .getKanbanWorkers()
      .then((r) => setWorkers(r.workers))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    api
      .getProfiles()
      .then((r) => setProfiles(r.profiles))
      .catch(() => {});
  }, [load]);

  // Light poll — the board is a living organism (workers change status on their own).
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    pollRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, 8000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [load]);

  // Deep link: /operations?delegate=1 opens the delegation panel. The URL is
  // the source of truth for that entry point (no state-sync effect); closing
  // consumes the param so it doesn't reopen.
  const [searchParams, setSearchParams] = useSearchParams();
  const delegateFromUrl = searchParams.get("delegate") === "1";
  const delegateOpen = delegating || delegateFromUrl;
  const closeDelegate = useCallback(() => {
    setDelegating(false);
    if (searchParams.get("delegate") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("delegate");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 1s tick only while somebody is actually working (elapsed mm:ss stays live).
  useEffect(() => {
    if (workers.length === 0) return;
    const id = window.setInterval(() => setNowSec(Date.now() / 1000), 1000);
    return () => window.clearInterval(id);
  }, [workers.length]);

  const reviewCount = useMemo(
    () =>
      (board?.columns ?? [])
        .filter((c) => c.name === "review")
        .reduce((acc, c) => acc + c.tasks.length, 0),
    [board],
  );

  // Header: live chips (honest board/worker facts) + secondary "Nova tarefa"
  // + primary dark "Delegar um objetivo".
  useEffect(() => {
    setEnd(
      <div className="flex items-center gap-2">
        {workers.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-emerald-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {ag.opsWorking.replace("{count}", String(workers.length))}
          </span>
        )}
        {reviewCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-live">
            {ag.opsReviewWait.replace("{count}", String(reviewCount))}
          </span>
        )}
        <Button ghost size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          {ag.opsNewTask}
        </Button>
        <Button size="sm" onClick={() => setDelegating(true)}>
          <Plus className="h-4 w-4" />
          {ag.delegateTitle}
        </Button>
      </div>,
    );
    return () => setEnd(null);
  }, [setEnd, ag.opsNewTask, ag.delegateTitle, ag.opsWorking, ag.opsReviewWait, workers.length, reviewCount]);

  const closeCreate = () => setCreating(false);
  const modalRef = useModalBehavior({ open: creating, onClose: closeCreate });

  const createTask = useCallback(async () => {
    if (!fTitle.trim()) return;
    setSaving(true);
    try {
      await api.createKanbanTask({
        title: fTitle.trim(),
        body: fBody.trim() || undefined,
        assignee: fAssignee || undefined,
        priority: fHigh ? 2 : 0,
      });
      showToast(ag.opsTaskCreated, "success");
      setCreating(false);
      setFTitle("");
      setFBody("");
      setFHigh(false);
      load();
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  }, [fTitle, fBody, fAssignee, fHigh, showToast, load, ag.opsTaskCreated, t.status.error]);

  const setStatus = useCallback(
    async (task: KanbanTask, status: string, okMsg: string) => {
      setBusyTask(task.id);
      try {
        await api.updateKanbanTask(task.id, { status });
        showToast(okMsg, "success");
        load();
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      } finally {
        setBusyTask(null);
      }
    },
    [showToast, load, t.status.error],
  );

  const columnLabel: Record<string, string> = {
    backlog: ag.opsColBacklog,
    queued: ag.opsColQueued,
    running: ag.opsColRunning,
    review: ag.opsColReview,
    done: ag.opsColDone,
  };

  const byStatus = useMemo(() => {
    const m = new Map<string, KanbanTask[]>();
    for (const col of board?.columns ?? []) m.set(col.name, col.tasks);
    return m;
  }, [board]);

  const columns = COLUMN_MAP.map((c) => ({
    key: c.key,
    label: columnLabel[c.key],
    tasks: c.statuses.flatMap((s) => byStatus.get(s) ?? []),
  }));

  const totalTasks = columns.reduce((acc, c) => acc + c.tasks.length, 0);

  const workerByTask = useMemo(() => {
    const m = new Map<string, KanbanWorker>();
    for (const w of workers) m.set(w.task_id, w);
    return m;
  }, [workers]);

  // "Ao vivo" rail: last 6 completions synthesized from board facts each poll
  // (completed_at desc) — honest, no fake feed.
  const liveFeed = useMemo(() => {
    const all: Array<{ task: KanbanTask; at: number }> = [];
    for (const col of board?.columns ?? []) {
      for (const tk of col.tasks) {
        const at = toEpochSeconds((tk as unknown as { completed_at?: unknown }).completed_at);
        if (at != null) all.push({ task: tk, at });
      }
    }
    all.sort((a, b) => b.at - a.at);
    return all.slice(0, 6);
  }, [board]);

  return (
    <div className="flex h-[calc(100dvh-112px)] min-h-[480px] flex-col px-4 py-3">
      <Toast toast={toast} />

      {board === null ? (
        <div className="py-16 text-center text-sm text-muted-foreground">…</div>
      ) : totalTasks === 0 ? (
        <div className="grid flex-1 place-items-center">
          <div className="text-center">
            <CircleCheck className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">{ag.opsEmpty}</p>
            <Button size="sm" className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {ag.opsNewTask}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="min-h-0 flex-1 overflow-x-auto pb-2">
            <div className="grid h-full min-w-[1080px] grid-cols-5 gap-3">
            {columns.map((col) => (
              <div key={col.key} className="flex min-h-0 flex-col rounded-xl bg-muted/40 p-2">
                <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
                  <span className="type-caption font-medium text-foreground">{col.label}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {col.tasks.length}
                  </span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-0.5 pb-1">
                  {col.tasks.map((task) => {
                    const running = task.status === "running";
                    const blocked = task.status === "blocked";
                    const worker = workerByTask.get(task.id);
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "min-w-0 rounded-xl border bg-card p-3 shadow-card",
                          blocked ? "border-amber-500/50" : "border-border",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
                            {task.title}
                          </span>
                          {(task.priority ?? 0) > 0 && (
                            <span className="shrink-0 rounded-md bg-live/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-live">
                              {ag.opsHigh}
                            </span>
                          )}
                        </div>
                        {task.latest_summary && (
                          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                            {task.latest_summary}
                          </p>
                        )}
                        {blocked && task.block_reason && (
                          <p className="mt-1.5 line-clamp-2 text-xs text-amber-600">
                            {task.block_reason}
                          </p>
                        )}
                        <div className="mt-2.5 flex items-center gap-2 border-t border-border/70 pt-2">
                          {task.assignee && (
                            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-foreground/80 text-[8px] font-semibold text-background">
                                {monogram(task.assignee)}
                              </span>
                              <span className="truncate">{prettify(task.assignee)}</span>
                            </span>
                          )}
                          {running && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-live">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
                              {ag.opsRunningBadge}
                            </span>
                          )}
                          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {ageShort(task.age?.created_age_seconds)}
                          </span>
                        </div>
                        {/* Live worker row — honest: we know it's working and
                            for how long, not which tool it's on right now. */}
                        {worker && (
                          <div className="mt-2 flex items-center gap-2 rounded-lg bg-live/5 px-2 py-1.5 text-[11px] text-live">
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                            <span className="min-w-0 truncate">{ag.opsRunningLine}</span>
                            <span className="ml-auto shrink-0 tabular-nums">
                              {elapsedMmSs(worker.started_at, nowSec)}
                            </span>
                          </div>
                        )}
                        {/* Flow actions (curated per column). */}
                        {(col.key === "backlog" || blocked) && (
                          <Button
                            ghost
                            size="sm"
                            disabled={busyTask === task.id}
                            onClick={() => void setStatus(task, "ready", ag.opsDispatched)}
                            className="mt-2 w-full justify-center text-muted-foreground hover:text-foreground"
                          >
                            <Play className="h-3.5 w-3.5" />
                            {ag.opsDispatch}
                          </Button>
                        )}
                        {col.key === "review" && (
                          <div className="mt-2 flex gap-2">
                            <Button
                              size="sm"
                              disabled={busyTask === task.id}
                              onClick={() => void setStatus(task, "done", ag.opsApproved)}
                              className="flex-1 justify-center"
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                              {ag.opsApprove}
                            </Button>
                            <Button
                              ghost
                              size="sm"
                              disabled={busyTask === task.id}
                              onClick={() => void setStatus(task, "ready", ag.opsDispatched)}
                              className="flex-1 justify-center text-muted-foreground hover:text-foreground"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              {ag.opsRedo}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            </div>
          </div>

          {/* "Ao vivo" — last completions derived from the board itself. */}
          <aside className="hidden w-60 shrink-0 flex-col rounded-xl bg-muted/40 p-3 xl:flex">
            <span className="type-caption px-0.5 pb-2 font-medium text-foreground">
              {ag.opsLiveFeed}
            </span>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {liveFeed.map(({ task, at }) => (
                <div
                  key={task.id}
                  className="min-w-0 rounded-lg border border-border/70 bg-card px-2.5 py-2"
                >
                  <p className="truncate text-xs font-medium text-foreground">{task.title}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {task.assignee && (
                      <>
                        <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-foreground/80 text-[7px] font-semibold text-background">
                          {monogram(task.assignee)}
                        </span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {prettify(task.assignee)}
                        </span>
                      </>
                    )}
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {ageShort(nowSec - at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* Modal: new task for the team. */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            ref={modalRef}
            className={cn(
              themedBody,
              "relative flex w-full max-w-md flex-col rounded-2xl border border-border bg-card shadow-2xl",
            )}
          >
            <Button
              ghost
              size="icon"
              onClick={closeCreate}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              aria-label={t.common.cancel}
            >
              <X className="h-4 w-4" />
            </Button>
            <header className="border-b border-border p-5 pb-3">
              <h2 className="text-base font-semibold text-foreground">{ag.opsNewTask}</h2>
            </header>
            <div className="grid gap-4 p-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{ag.opsTaskTitle}</span>
                <input
                  className={inputCls}
                  autoFocus
                  value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                  placeholder={ag.opsTaskTitlePh}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{ag.opsTaskBody}</span>
                <textarea
                  className={cn(inputCls, "min-h-[88px] resize-y")}
                  value={fBody}
                  onChange={(e) => setFBody(e.target.value)}
                  placeholder={ag.opsTaskBodyPh}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{ag.opsTaskAssignee}</span>
                <select
                  className={inputCls}
                  value={fAssignee}
                  onChange={(e) => setFAssignee(e.target.value)}
                >
                  {profiles.map((p) => (
                    <option key={p.name} value={p.name}>
                      {prettify(p.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={fHigh}
                  onChange={(e) => setFHigh(e.target.checked)}
                  className="h-4 w-4 accent-[var(--live)]"
                />
                {ag.opsTaskHigh}
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-border p-5 pt-3">
              <Button ghost onClick={closeCreate} disabled={saving}>
                {t.common.cancel}
              </Button>
              <Button onClick={() => void createTask()} disabled={saving || !fTitle.trim()}>
                {saving ? t.common.creating : t.common.create}
              </Button>
            </footer>
          </div>
        </div>
      )}

      {/* Delegate an objective → LLM plan → REAL kanban tasks + routine. */}
      <DelegateObjective
        open={delegateOpen}
        onClose={closeDelegate}
        onStarted={() => {
          closeDelegate();
          showToast(ag.delegateStarted, "success");
          load();
        }}
      />
    </div>
  );
}
