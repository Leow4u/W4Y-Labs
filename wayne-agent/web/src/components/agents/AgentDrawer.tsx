/**
 * AgentDrawer — o raio-X do funcionário (módulo Agentes, Onda 2).
 *
 * Clicar num agente do canvas abre este painel lateral com a estrutura
 * interna dele em abas — benchmark Stack AI ("abrir o agente mostra tudo
 * que ele tem dentro"), executado 100% sobre endpoints nativos ?profile=:
 *   Perfil       especialidade + modelo (TODOS os OpenRouter, não os tiers
 *                do chat) + instruções (SOUL.md) + pulso de custo em créditos
 *   Agenda       rotinas cron DO agente (criar/pausar/disparar/remover)
 *   Habilidades  skills com toggle por agente
 *   Canais       status das conexões do agente (leitura, v1)
 *
 * Renderizado via createPortal(document.body): ancestrais com transform
 * (drawer da sidebar) viram containing block de position:fixed — lição do
 * ProjectEditModal.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  Check,
  Coins,
  MessagesSquare,
  Pause,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { api } from "@/lib/api";
import type { CronJob, McpServer, MessagingPlatform, SessionInfo, SkillInfo } from "@/lib/api";
import { timeAgoShort } from "@/lib/utils";
import { ROUTINE_PRESETS } from "@/lib/agent-draft";
import type { AgentRoutineDraft } from "@/lib/agent-draft";
import { formatCredits, usdToCredits } from "@/lib/credits";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { Button } from "@nous-research/ui/ui/components/button";
import { useI18n } from "@/i18n";
import { cn, themedBody } from "@/lib/utils";

export interface DrawerAgent {
  name: string; // slug do profile
  displayName: string;
  monogram: string;
  specialty: string;
  isActive: boolean;
  isDefault: boolean;
}

export type AgentDrawerTab =
  | "profile"
  | "schedule"
  | "skills"
  | "channels"
  | "mcp"
  | "activity";
type Tab = AgentDrawerTab;

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-live/50";

/** Display humano do agendamento de um job (exprs dos presets → rótulo i18n). */
function scheduleDisplay(j: CronJob, exprLabel: Record<string, string>): string {
  const expr = j.schedule?.expr ?? "";
  return (
    j.schedule_display ||
    j.schedule?.display ||
    exprLabel[expr] ||
    expr ||
    j.schedule?.run_at ||
    "—"
  );
}

export function AgentDrawer({
  agent,
  onClose,
  onChanged,
  onActivate,
  onRequestDelete,
  activating,
  notify,
  initialTab,
}: {
  agent: DrawerAgent;
  onClose: () => void;
  /** Algo persistiu (perfil/rotina) — o pai recarrega canvas/extras. */
  onChanged: () => void;
  onActivate: (name: string) => void;
  onRequestDelete: (name: string) => void;
  activating: boolean;
  notify: (msg: string, kind: "success" | "error") => void;
  /** Aba inicial — o workflow (Onda 2.5) abre o raio-X direto no nó clicado. */
  initialTab?: AgentDrawerTab;
}) {
  const { t } = useI18n();
  const ag = t.agents;
  const navigate = useNavigate();
  const modalRef = useModalBehavior({ open: true, onClose });

  const [tab, setTab] = useState<Tab>(initialTab ?? "profile");
  // Clicar noutro nó do workflow com o drawer já aberto troca a aba.
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  /* ---------------- Perfil ---------------- */
  const [specialty, setSpecialty] = useState(agent.specialty);
  const [model, setModel] = useState("");
  const [soul, setSoul] = useState("");
  const [base, setBase] = useState({ specialty: agent.specialty, model: "", soul: "" });
  const [profileLoading, setProfileLoading] = useState(true);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [stats, setStats] = useState<{ credits: number; sessions: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let dead = false;
    setProfileLoading(true);
    setSpecialty(agent.specialty);
    Promise.all([
      api.getProfileSoul(agent.name).catch(() => ({ content: "" })),
      api.getModelInfo(agent.name).catch(() => null),
    ])
      .then(([soulRes, info]) => {
        if (dead) return;
        const s = soulRes?.content ?? "";
        const m = info?.model ?? "";
        setSoul(s);
        setModel(m);
        setBase({ specialty: agent.specialty, model: m, soul: s });
      })
      .finally(() => !dead && setProfileLoading(false));
    api
      .getAnalytics(30, agent.name)
      .then((r) => {
        if (dead) return;
        const usd =
          r.totals.total_actual_cost > 0 ? r.totals.total_actual_cost : r.totals.total_estimated_cost;
        setStats({ credits: usdToCredits(usd), sessions: r.totals.total_sessions });
      })
      .catch(() => {});
    api
      .getModelOptions()
      .then((r) => {
        if (dead) return;
        const or = r.providers?.find((p) => p.slug === "openrouter");
        setModelOptions((or?.models ?? []).slice(0, 600));
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [agent.name, agent.specialty]);

  const dirty =
    specialty.trim() !== base.specialty.trim() || model.trim() !== base.model.trim() || soul !== base.soul;

  const saveProfile = useCallback(async () => {
    setSaving(true);
    try {
      if (specialty.trim() !== base.specialty.trim()) {
        await api.updateProfileDescription(agent.name, specialty.trim());
      }
      if (soul !== base.soul) {
        await api.updateProfileSoul(agent.name, soul);
      }
      if (model.trim() && model.trim() !== base.model.trim()) {
        await api.setProfileModel(agent.name, "openrouter", model.trim());
      }
      setBase({ specialty, model, soul });
      notify(`${ag.saved}: ${agent.displayName}`, "success");
      onChanged();
    } catch (e) {
      notify(`${t.status.error}: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  }, [agent.name, agent.displayName, specialty, model, soul, base, notify, onChanged, ag.saved, t.status.error]);

  /* ---------------- Agenda ---------------- */
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [preset, setPreset] = useState<AgentRoutineDraft["preset"]>("daily_9");
  const [routinePrompt, setRoutinePrompt] = useState("");
  const [routineSaving, setRoutineSaving] = useState(false);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  const loadJobs = useCallback(() => {
    api
      .getCronJobs(agent.name)
      .then(setJobs)
      .catch(() => setJobs([]));
  }, [agent.name]);

  useEffect(() => {
    if (tab === "schedule" && jobs === null) loadJobs();
  }, [tab, jobs, loadJobs]);

  const presetLabel: Record<AgentRoutineDraft["preset"], string> = {
    daily_9: ag.presetDaily9,
    weekdays_8: ag.presetWeekdays8,
    weekly_mon_9: ag.presetWeeklyMon9,
  };
  // Cron cru na cara do usuário fere a curadoria: exprs conhecidas → rótulo.
  const exprLabel: Record<string, string> = {
    [ROUTINE_PRESETS.daily_9.expr]: ag.presetDaily9,
    [ROUTINE_PRESETS.weekdays_8.expr]: ag.presetWeekdays8,
    [ROUTINE_PRESETS.weekly_mon_9.expr]: ag.presetWeeklyMon9,
  };

  const createRoutine = useCallback(async () => {
    if (!routinePrompt.trim()) return;
    setRoutineSaving(true);
    try {
      await api.createCronJob(
        {
          name: `${agent.displayName} — ${presetLabel[preset]}`,
          prompt: routinePrompt.trim(),
          schedule: ROUTINE_PRESETS[preset].expr,
        },
        agent.name,
      );
      notify(ag.eqRoutineCreated, "success");
      setCreating(false);
      setRoutinePrompt("");
      loadJobs();
      onChanged();
    } catch (e) {
      notify(`${t.status.error}: ${e}`, "error");
    } finally {
      setRoutineSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.name, agent.displayName, preset, routinePrompt, notify, loadJobs, onChanged]);

  const jobAction = useCallback(
    async (job: CronJob, action: "trigger" | "toggle" | "delete") => {
      setBusyJob(job.id);
      try {
        if (action === "trigger") {
          await api.triggerCronJob(job.id, agent.name);
          notify(ag.eqRunNowOk, "success");
        } else if (action === "toggle") {
          if (job.enabled) await api.pauseCronJob(job.id, agent.name);
          else await api.resumeCronJob(job.id, agent.name);
          loadJobs();
        } else {
          await api.deleteCronJob(job.id, agent.name);
          notify(ag.eqRoutineDeleted, "success");
          setArmedDelete(null);
          loadJobs();
          onChanged();
        }
      } catch (e) {
        notify(`${t.status.error}: ${e}`, "error");
      } finally {
        setBusyJob(null);
      }
    },
    [agent.name, notify, loadJobs, onChanged, ag.eqRunNowOk, ag.eqRoutineDeleted, t.status.error],
  );

  /* ---------------- Habilidades ---------------- */
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [togglingSkill, setTogglingSkill] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "skills" || skills !== null) return;
    api
      .getSkills(agent.name)
      .then(setSkills)
      .catch(() => setSkills([]));
  }, [tab, skills, agent.name]);

  const skillGroups = useMemo(() => {
    const m = new Map<string, SkillInfo[]>();
    for (const s of skills ?? []) {
      const k = s.category || "—";
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills]);

  const toggleSkill = useCallback(
    async (s: SkillInfo) => {
      setTogglingSkill(s.name);
      try {
        await api.toggleSkill(s.name, !s.enabled, agent.name);
        setSkills((prev) =>
          (prev ?? []).map((x) => (x.name === s.name ? { ...x, enabled: !x.enabled } : x)),
        );
      } catch (e) {
        notify(`${t.status.error}: ${e}`, "error");
      } finally {
        setTogglingSkill(null);
      }
    },
    [agent.name, notify, t.status.error],
  );

  /* ---------------- Canais ---------------- */
  const [platforms, setPlatforms] = useState<MessagingPlatform[] | null>(null);

  useEffect(() => {
    if (tab !== "channels" || platforms !== null) return;
    api
      .getMessagingPlatforms(agent.name)
      .then((r) => setPlatforms(r.platforms ?? []))
      .catch(() => setPlatforms([]));
  }, [tab, platforms, agent.name]);

  const connected = (platforms ?? []).filter((p) => p.configured || p.enabled);

  /* ---------------- MCP ---------------- */
  const [mcpServers, setMcpServers] = useState<McpServer[] | null>(null);

  useEffect(() => {
    if (tab !== "mcp" || mcpServers !== null) return;
    api
      .getMcpServers(agent.name)
      .then((r) => setMcpServers(r.servers ?? []))
      .catch(() => setMcpServers([]));
  }, [tab, mcpServers, agent.name]);

  /* ---------------- Atividade ---------------- */
  const [activity, setActivity] = useState<SessionInfo[] | null>(null);

  useEffect(() => {
    if (tab !== "activity" || activity !== null) return;
    api
      .getSessions(10, 0, agent.name, "recent")
      .then((r) => setActivity(r.sessions ?? []))
      .catch(() => setActivity([]));
  }, [tab, activity, agent.name]);

  /* ---------------- Render ---------------- */

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "profile", label: ag.eqTabProfile },
    { key: "schedule", label: t.app.nav.cron },
    { key: "skills", label: t.app.nav.skills },
    { key: "channels", label: t.app.nav.channels },
    { key: "mcp", label: "MCP" },
    { key: "activity", label: ag.eqTabActivity },
  ];

  const stateDot = (state: string) =>
    state === "connected"
      ? "bg-emerald-500"
      : state === "pending_restart" || state === "gateway_stopped"
        ? "bg-amber-500"
        : "bg-muted-foreground/40";

  return createPortal(
    <div className={cn(themedBody, "fixed inset-0 z-50")}>
      <div className="absolute inset-0 bg-black/20" />
      <aside
        ref={modalRef}
        className="absolute inset-y-0 right-0 flex w-[min(480px,94vw)] flex-col border-l border-border bg-background shadow-2xl"
      >
        {/* Header — identidade + ações do funcionário. */}
        <header className="border-b border-border px-5 pb-0 pt-5">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-semibold",
                agent.isActive ? "bg-foreground text-background" : "bg-muted text-foreground",
              )}
            >
              {agent.monogram}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate font-serif text-xl text-foreground" style={{ fontFamily: "var(--theme-font-serif)" }}>
                  {agent.displayName}
                </h2>
                {agent.isActive && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground">
                    <Check className="h-3 w-3" />
                    {ag.active}
                  </span>
                )}
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {specialty || ag.noSpecialty}
              </p>
            </div>
            <Button ghost size="icon" onClick={onClose} aria-label={t.common.close} className="-mr-2 -mt-2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() =>
                navigate(agent.isDefault ? "/chat" : `/chat?agent=${encodeURIComponent(agent.name)}`)
              }
              className="justify-center"
            >
              <MessagesSquare className="h-4 w-4" />
              {ag.eqTalk}
            </Button>
            {agent.isActive ? (
              <Button size="sm" ghost disabled className="justify-center opacity-80">
                <Check className="h-4 w-4" />
                {ag.inUse}
              </Button>
            ) : (
              <Button size="sm" ghost onClick={() => onActivate(agent.name)} disabled={activating} className="justify-center">
                {activating ? "…" : ag.use}
              </Button>
            )}
            <div className="flex-1" />
            {!agent.isDefault && (
              <Button
                ghost
                size="icon"
                aria-label={ag.deleteAgent}
                onClick={() => onRequestDelete(agent.name)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Abas do raio-X. */}
          <nav className="mt-4 flex gap-5">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "border-b-2 pb-2.5 text-sm transition-colors",
                  tab === key
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* ---------------- Perfil ---------------- */}
          {tab === "profile" && (
            <div className="grid gap-5">
              {/* Pulso: custo/sessões 30d — créditos, nunca US$. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="type-micro text-muted-foreground">{ag.eqCost30d}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-foreground">
                    <Coins className="h-4 w-4 text-live" />
                    {stats ? formatCredits(stats.credits) : "…"}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="type-micro text-muted-foreground">{ag.eqSessions}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {stats ? stats.sessions : "…"}
                  </div>
                </div>
              </div>

              <div className="grid gap-1.5">
                <label className="type-caption text-foreground">{ag.specialtyLabel}</label>
                <input
                  className={inputCls}
                  value={specialty}
                  disabled={profileLoading}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder={ag.specialtyPlaceholder}
                />
              </div>

              <div className="grid gap-1.5">
                <label className="type-caption text-foreground">{ag.qsModel}</label>
                <input
                  className={inputCls}
                  list="xray-model-options"
                  value={model}
                  disabled={profileLoading}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="anthropic/claude-sonnet-5"
                />
                <datalist id="xray-model-options">
                  {modelOptions.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <p className="type-micro text-muted-foreground">{ag.qsModelHint}</p>
              </div>

              <div className="grid gap-1.5">
                <label className="type-caption text-foreground">{ag.instructionsLabel}</label>
                <textarea
                  className={cn(inputCls, "min-h-[180px] resize-y leading-relaxed")}
                  value={soul}
                  disabled={profileLoading}
                  onChange={(e) => setSoul(e.target.value)}
                  placeholder={profileLoading ? "…" : ag.instructionsPlaceholder}
                />
              </div>

              {agent.isDefault && (
                <p className="type-micro text-muted-foreground">{ag.eqDefaultNote}</p>
              )}

              <div>
                <Button size="sm" onClick={saveProfile} disabled={!dirty || saving || profileLoading}>
                  {saving ? t.common.saving : t.common.save}
                </Button>
              </div>
            </div>
          )}

          {/* ---------------- Agenda ---------------- */}
          {tab === "schedule" && (
            <div className="grid gap-4">
              {jobs === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">…</p>
              ) : jobs.length === 0 && !creating ? (
                <div className="rounded-xl border border-dashed border-border py-8 text-center">
                  <CalendarClock className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">{ag.eqNoRoutines}</p>
                </div>
              ) : (
                jobs.map((j) => (
                  <div key={j.id} className="min-w-0 rounded-xl border border-border bg-card p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {j.name || j.prompt?.slice(0, 48) || j.id}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {scheduleDisplay(j, exprLabel)}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          j.enabled ? "bg-live/10 text-live" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {j.enabled ? ag.active : ag.eqPaused}
                      </span>
                    </div>
                    {j.prompt && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{j.prompt}</p>
                    )}
                    <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/70 pt-2.5">
                      <Button
                        ghost
                        size="sm"
                        disabled={busyJob === j.id}
                        onClick={() => jobAction(j, "trigger")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Play className="h-3.5 w-3.5" />
                        {ag.eqRunNow}
                      </Button>
                      <Button
                        ghost
                        size="sm"
                        disabled={busyJob === j.id}
                        onClick={() => jobAction(j, "toggle")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {j.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {j.enabled ? ag.eqPause : ag.eqResume}
                      </Button>
                      <div className="flex-1" />
                      <Button
                        ghost
                        size="sm"
                        disabled={busyJob === j.id}
                        onClick={() =>
                          armedDelete === j.id ? jobAction(j, "delete") : setArmedDelete(j.id)
                        }
                        className={cn(
                          armedDelete === j.id
                            ? "text-destructive"
                            : "text-muted-foreground hover:text-destructive",
                        )}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {armedDelete === j.id ? t.common.confirm : t.common.delete}
                      </Button>
                    </div>
                  </div>
                ))
              )}

              {creating ? (
                <div className="rounded-xl border border-live/40 bg-live/5 p-3.5">
                  <div className="type-caption text-foreground">{ag.eqNewRoutine}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(Object.keys(ROUTINE_PRESETS) as AgentRoutineDraft["preset"][]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPreset(p)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          preset === p
                            ? "border-live bg-live/10 font-medium text-live"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {presetLabel[p]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className={cn(inputCls, "mt-2.5 min-h-[72px] resize-y")}
                    value={routinePrompt}
                    onChange={(e) => setRoutinePrompt(e.target.value)}
                    placeholder={ag.qsRoutinePrompt}
                    autoFocus
                  />
                  <div className="mt-2.5 flex justify-end gap-2">
                    <Button ghost size="sm" onClick={() => setCreating(false)} disabled={routineSaving}>
                      {t.common.cancel}
                    </Button>
                    <Button size="sm" onClick={createRoutine} disabled={routineSaving || !routinePrompt.trim()}>
                      {routineSaving ? t.common.creating : t.common.create}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  {ag.eqNewRoutine}
                </button>
              )}
            </div>
          )}

          {/* ---------------- Habilidades ---------------- */}
          {tab === "skills" && (
            <div className="grid gap-4">
              <p className="type-micro text-muted-foreground">{ag.eqSkillsHint}</p>
              {skills === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">…</p>
              ) : (
                <>
                  <p className="type-caption text-foreground">
                    {ag.eqSkillsActive
                      .replace("{on}", String(skills.filter((s) => s.enabled).length))
                      .replace("{total}", String(skills.length))}
                  </p>
                  {skillGroups.map(([category, list]) => (
                    <div key={category}>
                      <div className="type-micro uppercase tracking-wide text-muted-foreground">
                        {category}
                      </div>
                      <div className="mt-1.5 grid gap-1">
                        {list.map((s) => (
                          <div
                            key={s.name}
                            className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-foreground">{s.name}</div>
                              {s.description && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {s.description}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={s.enabled}
                              disabled={togglingSkill === s.name}
                              onClick={() => toggleSkill(s)}
                              // Cores/knob vêm do padrão GLOBAL de toggles do produto
                              // (index.css button[role="switch"], azul iOS !important)
                              // — mesmo visual das Configurações. Aqui só layout.
                              className={cn(
                                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                                togglingSkill === s.name && "opacity-60",
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute top-0.5 rounded-full transition-all",
                                  s.enabled ? "left-[18px]" : "left-0.5",
                                )}
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ---------------- Canais ---------------- */}
          {tab === "channels" && (
            <div className="grid gap-4">
              <p className="type-micro text-muted-foreground">{ag.eqChannelsHint}</p>
              {platforms === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">…</p>
              ) : connected.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-8 text-center">
                  <p className="text-sm text-muted-foreground">{ag.eqChannelsNone}</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {connected.map((p) => (
                    <div
                      key={p.id}
                      className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5"
                    >
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", stateDot(p.state))} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{p.state}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Link
                to="/channels"
                className="type-caption text-live underline-offset-4 hover:underline"
                onClick={onClose}
              >
                {ag.eqChannelsManage} →
              </Link>
            </div>
          )}

          {/* ---------------- MCP ---------------- */}
          {tab === "mcp" && (
            <div className="grid gap-4">
              <p className="type-micro text-muted-foreground">{ag.eqMcpHint}</p>
              {mcpServers === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">…</p>
              ) : mcpServers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-8 text-center">
                  <p className="text-sm text-muted-foreground">{ag.eqMcpNone}</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {mcpServers.map((s) => (
                    <div
                      key={s.name}
                      className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5"
                    >
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          s.enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{s.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {s.transport}
                          {s.tools && s.tools.length > 0 ? ` · ${s.tools.length} tools` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---------------- Atividade ---------------- */}
          {tab === "activity" && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="type-micro text-muted-foreground">{ag.eqCost30d}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-foreground">
                    <Coins className="h-4 w-4 text-live" />
                    {stats ? formatCredits(stats.credits) : "…"}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="type-micro text-muted-foreground">{ag.eqSessions}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {stats ? stats.sessions : "…"}
                  </div>
                </div>
              </div>
              <p className="type-micro text-muted-foreground">{ag.eqActivityHint}</p>
              {activity === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">…</p>
              ) : activity.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-8 text-center">
                  <p className="text-sm text-muted-foreground">{ag.eqActivityNone}</p>
                </div>
              ) : (
                <div className="grid gap-1.5">
                  {activity.map((s) => (
                    <div
                      key={s.id}
                      className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-foreground">
                          {s.title?.trim() || s.preview?.trim() || s.id.slice(0, 8)}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {s.message_count} msgs
                          {s.model ? ` · ${s.model.split("/").pop()}` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {timeAgoShort(s.last_active || s.started_at, {
                          ageNow: t.chat.ageNow,
                          ageMin: t.chat.ageMin,
                          ageHour: t.chat.ageHour,
                          ageDay: t.chat.ageDay,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
