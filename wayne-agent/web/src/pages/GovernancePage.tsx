/**
 * GovernancePage — the owner's control desk (Agents module, Onda 3).
 *
 * Two columns + team table:
 *   LEFT   "Esperando você": the REAL approvals inbox (/api/approvals/pending,
 *          5s poll) — approval/clarify/sudo/secret items answered via
 *          /api/approvals/respond — merged with kanban tasks blocked on
 *          `needs_input` (answered by appending the owner's reply to the task
 *          body and putting it back to `ready`; two real calls).
 *   RIGHT  "Limites": per-agent approval mode (Manual/Smart — deep-merge PUT
 *          /api/config?profile=, config.set RPC is a trap) + month credits vs
 *          cap from /api/profiles/pulse, cap editable via
 *          {limits:{monthly_credits}} (null clears).
 *   BELOW  the team table: model, 30d cost in CREDITS (never US$ — billing
 *          rule), sessions and routines per agent.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleCheck,
  Coins,
  Pencil,
  ShieldCheck,
} from "lucide-react";

import { api } from "@/lib/api";
import { agentLabel, agentMonogram, isInstallation } from "@/lib/agents";
import { modelCommercialName } from "@/components/agents/ModelCatalogPicker";
import type {
  ApprovalInboxItem,
  KanbanBoardResponse,
  KanbanTask,
  PulseResponse,
} from "@/lib/api";
import { formatCredits, usdToCredits } from "@/lib/credits";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { Button } from "@nous-research/ui/ui/components/button";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn } from "@/lib/utils";

function prettify(name: string): string {
  const s = name.replace(/[-_]+/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
function monogram(name: string): string {
  const parts = prettify(name).split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return prettify(name).slice(0, 2).toUpperCase();
}

type ApprovalMode = "manual" | "smart";

interface GovRow {
  name: string;
  isDefault: boolean;
  model: string | null;
  credits30: number | null;
  sessions30: number | null;
  routines: number | null;
  approval: ApprovalMode | null;
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-live/50";

/** Stable identity for an inbox item (used for busy state + reply drafts). */
function itemKey(item: ApprovalInboxItem, i: number): string {
  return `${item.kind}:${item.session_key ?? ""}:${item.request_id ?? ""}:${i}`;
}

export default function GovernancePage() {
  const { t } = useI18n();
  const ag = t.agents;
  const { toast, showToast } = useToast();
  const { setTitle, setEnd } = usePageHeader();

  const [rows, setRows] = useState<GovRow[] | null>(null);
  const [savingMode, setSavingMode] = useState<string | null>(null);

  // Inbox: approvals + clarifications + kanban needs_input.
  const [inbox, setInbox] = useState<ApprovalInboxItem[] | null>(null);
  const [board, setBoard] = useState<KanbanBoardResponse | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  /** Free-text drafts, keyed by itemKey / `task:<id>`. */
  const [reply, setReply] = useState<Record<string, string>>({});

  // Pulse: month credits + cap per agent.
  const [pulse, setPulse] = useState<PulseResponse | null>(null);
  const [capEditing, setCapEditing] = useState<string | null>(null);
  const [capValue, setCapValue] = useState("");
  const [savingCap, setSavingCap] = useState<string | null>(null);

  useEffect(() => {
    setTitle(ag.govTab);
    return () => setTitle(null);
  }, [setTitle, ag.govTab]);

  /* ------------------------- polling: inbox (5s) ------------------------- */
  const loadInbox = useCallback(() => {
    api
      .getApprovalsInbox()
      .then((r) => setInbox(r.items))
      .catch(() => {});
    api
      .getKanbanBoard()
      .then(setBoard)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadInbox();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") loadInbox();
    }, 5000);
    return () => window.clearInterval(id);
  }, [loadInbox]);

  /* ------------------------- polling: pulse (15s) ------------------------ */
  const loadPulse = useCallback(() => {
    api
      .getProfilesPulse()
      .then(setPulse)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPulse();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") loadPulse();
    }, 15000);
    return () => window.clearInterval(id);
  }, [loadPulse]);

  /* --------------------- team table (one-shot enrich) -------------------- */
  useEffect(() => {
    let dead = false;
    api
      .getProfiles()
      .then((r) => {
        if (dead) return;
        const base: GovRow[] = r.profiles.map((p) => ({
          name: p.name,
          isDefault: Boolean(p.is_default),
          model: null,
          credits30: null,
          sessions30: null,
          routines: null,
          approval: null,
        }));
        setRows(base);
        // Parallel enrichment, row by row (the table breathes).
        for (const p of r.profiles) {
          void Promise.all([
            api.getModelInfo(p.name).catch(() => null),
            api.getAnalytics(30, p.name).catch(() => null),
            api.getCronJobs(p.name).catch(() => []),
            api.getConfig(p.name).catch(() => ({}) as Record<string, unknown>),
          ]).then(([model, usage, jobs, cfg]) => {
            if (dead) return;
            const usd = usage
              ? usage.totals.total_actual_cost > 0
                ? usage.totals.total_actual_cost
                : usage.totals.total_estimated_cost
              : 0;
            const approvals = (cfg as { approvals?: { mode?: string } }).approvals;
            const mode: ApprovalMode = approvals?.mode === "smart" ? "smart" : "manual";
            setRows((prev) =>
              (prev ?? []).map((row) =>
                row.name === p.name
                  ? {
                      ...row,
                      model: model?.model ?? null,
                      credits30: usage ? usdToCredits(usd) : 0,
                      sessions30: usage ? usage.totals.total_sessions : 0,
                      routines: jobs.length,
                      approval: mode,
                    }
                  : row,
              ),
            );
          });
        }
      })
      .catch((e) => showToast(`${t.status.error}: ${e}`, "error"));
    return () => {
      dead = true;
    };
  }, [showToast, t.status.error]);

  /* ------------------------------ actions -------------------------------- */

  const setApproval = useCallback(
    async (name: string, mode: ApprovalMode) => {
      setSavingMode(name);
      try {
        // Deep-merge into THE agent's config (config.set RPC is a trap — always
        // PUT /api/config?profile=, the path validated in Settings).
        await api.saveConfig({ approvals: { mode } }, name);
        setRows((prev) =>
          (prev ?? []).map((r) => (r.name === name ? { ...r, approval: mode } : r)),
        );
        showToast(ag.govSaved, "success");
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      } finally {
        setSavingMode(null);
      }
    },
    [showToast, ag.govSaved, t.status.error],
  );

  /** Answer one inbox item via the real respond endpoint, then refetch. */
  const respond = useCallback(
    async (
      key: string,
      body: {
        kind: string;
        session_key?: string;
        choice?: string;
        request_id?: string;
        answer?: string;
      },
    ) => {
      setBusyItem(key);
      try {
        await api.respondApprovalInbox(body);
        setReply((m) => ({ ...m, [key]: "" }));
        const r = await api.getApprovalsInbox();
        setInbox(r.items);
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      } finally {
        setBusyItem(null);
      }
    },
    [showToast, t.status.error],
  );

  /** Kanban needs_input: append the owner's reply to the task body, then put
   *  the task back to `ready` — two real calls, the worker picks it up. */
  const answerBlockedTask = useCallback(
    async (task: KanbanTask) => {
      const key = `task:${task.id}`;
      const text = (reply[key] ?? "").trim();
      if (!text) return;
      setBusyItem(key);
      try {
        await api.updateKanbanTask(task.id, {
          body: `${task.body ?? ""}\n\n[Resposta do dono] ${text}`,
        });
        await api.updateKanbanTask(task.id, { status: "ready" });
        setReply((m) => ({ ...m, [key]: "" }));
        const b = await api.getKanbanBoard();
        setBoard(b);
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      } finally {
        setBusyItem(null);
      }
    },
    [reply, showToast, t.status.error],
  );

  const saveCap = useCallback(
    async (name: string) => {
      const raw = capValue.trim();
      const v = Number(raw);
      // 0/empty/invalid clears the cap (monthly_credits: null).
      const clear = raw === "" || !Number.isFinite(v) || v <= 0;
      setSavingCap(name);
      try {
        await api.saveConfig(
          { limits: { monthly_credits: clear ? null : Math.round(v) } },
          name,
        );
        showToast(ag.govSaved, "success");
        setCapEditing(null);
        loadPulse();
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      } finally {
        setSavingCap(null);
      }
    },
    [capValue, showToast, ag.govSaved, t.status.error, loadPulse],
  );

  /* ------------------------------ derived -------------------------------- */

  // Kanban tasks blocked waiting for the OWNER's input. Field inspected
  // defensively: the board payload carries the DB's block_kind verbatim.
  const needsInput = useMemo(() => {
    const blocked = board?.columns.find((c) => c.name === "blocked")?.tasks ?? [];
    return blocked.filter(
      (task) => (task as unknown as { block_kind?: unknown }).block_kind === "needs_input",
    );
  }, [board]);

  const waitingCount = (inbox?.length ?? 0) + needsInput.length;

  // Header: count chip while something waits for the owner.
  useEffect(() => {
    setEnd(
      waitingCount > 0 ? (
        <span className="inline-flex items-center rounded-full bg-live/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-live">
          {waitingCount}
        </span>
      ) : null,
    );
    return () => setEnd(null);
  }, [setEnd, waitingCount]);

  const pulseByName = useMemo(() => {
    const m = new Map<string, PulseResponse["profiles"][number]>();
    for (const p of pulse?.profiles ?? []) m.set(p.name, p);
    return m;
  }, [pulse]);

  // The installation is not a team member: it never appears as a row and its
  // spend never lands in the TEAM total (product rule 20/07). Its activity is
  // shown separately, read-only, as "Assistente Work4You".
  const teamRows = useMemo(
    () => (rows ?? []).filter((r) => !r.isDefault && !isInstallation(r.name)),
    [rows],
  );
  const assistantRow = useMemo(
    () => (rows ?? []).find((r) => r.isDefault || isInstallation(r.name)) ?? null,
    [rows],
  );
  const totalCredits = teamRows.reduce((acc, r) => acc + (r.credits30 ?? 0), 0);

  /* ------------------------------- render -------------------------------- */

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5">
      <Toast toast={toast} />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* ─────────── LEFT: waiting for you ─────────── */}
        <section className="min-w-0">
          <h2 className="type-caption px-0.5 font-medium text-muted-foreground">
            {ag.govWaitingYou}
          </h2>
          <div className="mt-2 space-y-2">
            {inbox === null && board === null ? (
              <div className="py-10 text-center text-sm text-muted-foreground">…</div>
            ) : waitingCount === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center shadow-card">
                <CircleCheck className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">{ag.govInboxEmpty}</p>
              </div>
            ) : (
              <>
                {(inbox ?? []).map((item, i) => {
                  const key = itemKey(item, i);
                  const busy = busyItem === key;
                  const draft = reply[key] ?? "";
                  const masked = item.kind === "sudo" || item.kind === "secret";
                  return (
                    <div
                      key={key}
                      className="min-w-0 rounded-xl border border-live/50 bg-card p-3 shadow-card"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-foreground/80 text-xs font-semibold text-background">
                            {isInstallation(item.profile) ? "W4" : agentMonogram(item.profile)}
                          </span>
                          {/* Approvals raised by the MAIN chat carry the
                              installation's name — show the product label, not
                              "Default". */}
                          <span className="truncate">{agentLabel(item.profile, null, ag.govAssistant)}</span>
                        </span>
                        {item.session_title && (
                          <span className="min-w-0 truncate text-xs text-muted-foreground">
                            {item.session_title}
                          </span>
                        )}
                      </div>

                      {(item.description || item.command) && (
                        <p className="mt-2 line-clamp-2 break-all font-mono text-[12px] text-foreground">
                          {item.description || item.command}
                        </p>
                      )}
                      {item.question && (
                        <p className="mt-2 text-sm text-foreground">{item.question}</p>
                      )}

                      {item.kind === "approval" && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void respond(key, {
                                kind: "approval",
                                session_key: item.session_key,
                                choice: "once",
                              })
                            }
                          >
                            {ag.govApprove}
                          </Button>
                          <Button
                            ghost
                            size="sm"
                            disabled={busy}
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              void respond(key, {
                                kind: "approval",
                                session_key: item.session_key,
                                choice: "session",
                              })
                            }
                          >
                            {ag.govAllowSession}
                          </Button>
                          <Button
                            ghost
                            size="sm"
                            disabled={busy}
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              void respond(key, {
                                kind: "approval",
                                session_key: item.session_key,
                                choice: "deny",
                              })
                            }
                          >
                            {ag.govDeny}
                          </Button>
                        </div>
                      )}

                      {item.kind === "clarify" && (item.choices?.length ?? 0) > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(item.choices ?? []).map((choice) => (
                            <Button
                              key={choice}
                              ghost
                              size="sm"
                              disabled={busy}
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                void respond(key, {
                                  kind: "clarify",
                                  session_key: item.session_key,
                                  request_id: item.request_id,
                                  answer: choice,
                                })
                              }
                            >
                              {choice}
                            </Button>
                          ))}
                        </div>
                      )}

                      {(item.kind === "clarify" || masked) && (
                        <div className="mt-2 flex gap-2">
                          <input
                            className={inputCls}
                            type={masked ? "password" : "text"}
                            placeholder={ag.govReply}
                            value={draft}
                            onChange={(e) =>
                              setReply((m) => ({ ...m, [key]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && draft.trim() && !busy) {
                                void respond(key, {
                                  kind: item.kind,
                                  session_key: item.session_key,
                                  request_id: item.request_id,
                                  answer: draft.trim(),
                                });
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            disabled={busy || !draft.trim()}
                            onClick={() =>
                              void respond(key, {
                                kind: item.kind,
                                session_key: item.session_key,
                                request_id: item.request_id,
                                answer: draft.trim(),
                              })
                            }
                          >
                            {ag.govSend}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {needsInput.map((task) => {
                  const key = `task:${task.id}`;
                  const busy = busyItem === key;
                  const draft = reply[key] ?? "";
                  return (
                    <div
                      key={key}
                      className="min-w-0 rounded-xl border border-live/50 bg-card p-3 shadow-card"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-live/10 px-1.5 py-px text-xs font-medium uppercase tracking-wide text-live">
                          {ag.govBlockedNeedsInput}
                        </span>
                        {task.assignee && (
                          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-foreground/80 text-[8px] font-semibold text-background">
                              {monogram(task.assignee)}
                            </span>
                            <span className="truncate">{prettify(task.assignee)}</span>
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">{task.title}</p>
                      {task.block_reason && (
                        <p className="mt-1 text-xs text-muted-foreground">{task.block_reason}</p>
                      )}
                      <div className="mt-2 flex flex-col gap-2">
                        <textarea
                          className={cn(inputCls, "min-h-[60px] resize-y")}
                          placeholder={ag.govReply}
                          value={draft}
                          onChange={(e) => setReply((m) => ({ ...m, [key]: e.target.value }))}
                        />
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            disabled={busy || !draft.trim()}
                            onClick={() => void answerBlockedTask(task)}
                          >
                            {ag.govSend}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </section>

        {/* ─────────── RIGHT: limits per agent ─────────── */}
        <section className="min-w-0">
          <h2
            className="type-caption inline-flex items-center gap-1 px-0.5 font-medium text-muted-foreground"
            title={ag.govHitlNote}
          >
            {ag.govLimits}
            <ShieldCheck className="h-3 w-3 opacity-60" />
          </h2>
          <div className="mt-2 space-y-2">
            {rows === null ? (
              <div className="py-10 text-center text-sm text-muted-foreground">…</div>
            ) : (
              teamRows.map((r) => {
                const p = pulseByName.get(r.name);
                const month = p?.month_credits ?? null;
                const cap = p?.cap_credits ?? null;
                const pct =
                  month != null && cap != null && cap > 0
                    ? Math.min(100, Math.round((month / cap) * 100))
                    : null;
                const editing = capEditing === r.name;
                return (
                  <div
                    key={r.name}
                    className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-card"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold text-foreground">
                        {monogram(r.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {prettify(r.name)}
                      </span>
                      {r.approval === null ? (
                        <span className="text-muted-foreground">…</span>
                      ) : (
                        <div className="inline-flex rounded-lg border border-border p-0.5">
                          {(["manual", "smart"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              disabled={savingMode === r.name}
                              onClick={() =>
                                r.approval !== mode && void setApproval(r.name, mode)
                              }
                              className={cn(
                                "rounded-md px-2.5 py-1 text-xs transition-colors",
                                r.approval === mode
                                  ? "bg-foreground font-medium text-background"
                                  : "text-muted-foreground hover:text-foreground",
                                savingMode === r.name && "opacity-60",
                              )}
                            >
                              {mode === "manual" ? ag.govManual : ag.govSmart}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Month spend vs cap. */}
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          pct != null && pct >= 90 ? "bg-live" : "bg-foreground/50",
                        )}
                        style={{ width: `${pct ?? 0}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {month != null ? `${formatCredits(month)} cr` : "…"}
                      </span>
                      {editing ? (
                        <div className="ml-auto flex items-center gap-1.5">
                          <input
                            className={cn(inputCls, "h-7 w-24 px-2 py-0 text-xs")}
                            type="number"
                            min={0}
                            autoFocus
                            placeholder="0"
                            title={ag.govCapClear}
                            value={capValue}
                            onChange={(e) => setCapValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && savingCap !== r.name) {
                                void saveCap(r.name);
                              }
                              if (e.key === "Escape") setCapEditing(null);
                            }}
                          />
                          <Button
                            size="icon"
                            disabled={savingCap === r.name}
                            onClick={() => void saveCap(r.name)}
                            aria-label={ag.govSetCap}
                            className="h-7 w-7"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="ml-auto inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground transition-colors hover:text-foreground"
                          title={ag.govSetCap}
                          onClick={() => {
                            setCapEditing(r.name);
                            setCapValue(cap != null ? String(cap) : "");
                          }}
                        >
                          {cap != null
                            ? ag.govCap.replace("{cap}", formatCredits(cap))
                            : ag.govNoCap}
                          <Pencil className="h-3 w-3 opacity-60" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ─────────── BELOW: the team table (spans both columns) ─────────── */}
        <div className="lg:col-span-2">
          {rows === null ? (
            <div className="py-10 text-center text-sm text-muted-foreground">…</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 type-caption font-medium text-muted-foreground">
                      {ag.teamTab}
                    </th>
                    <th className="px-4 py-3 type-caption font-medium text-muted-foreground">
                      {ag.qsModel}
                    </th>
                    <th className="px-4 py-3 text-right type-caption font-medium text-muted-foreground">
                      {ag.eqCost30d}
                    </th>
                    <th className="px-4 py-3 text-right type-caption font-medium text-muted-foreground">
                      {ag.eqSessions}
                    </th>
                    <th className="px-4 py-3 text-right type-caption font-medium text-muted-foreground">
                      {ag.govColRoutines}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teamRows.map((r) => (
                    <tr key={r.name} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold text-foreground">
                            {agentMonogram(r.name)}
                          </span>
                          <span className="truncate font-medium text-foreground">
                            {agentLabel(r.name)}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-[12px] text-muted-foreground">
                        {r.model ? modelCommercialName(r.model) : "…"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {r.credits30 != null ? formatCredits(r.credits30) : "…"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {r.sessions30 != null ? r.sessions30 : "…"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {r.routines != null ? r.routines : "…"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/40">
                    <td className="px-4 py-3 type-caption font-medium text-muted-foreground">
                      {ag.govTotal}
                    </td>
                    <td />
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-foreground">
                        <Coins className="h-4 w-4 text-live" />
                        {formatCredits(totalCredits)}
                      </span>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* The main assistant (the installation) is NOT a team member: no
              row, no edit, out of the team total. Its consumption still has
              to be visible to the owner, so it shows here as a read-only
              summary line. */}
          {assistantRow && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold text-foreground">
                W4
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{ag.govAssistant}</div>
                <div className="type-caption text-muted-foreground">{ag.govAssistantHint}</div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
                <Coins className="h-4 w-4" />
                {assistantRow.credits30 != null ? formatCredits(assistantRow.credits30) : "…"}
              </span>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {assistantRow.sessions30 != null ? assistantRow.sessions30 : "…"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
