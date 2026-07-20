/**
 * AgentsPage — "Equipe" (Agents module, level 1): the OWNER VIEW of the team.
 *
 * A manager's dashboard, not a canvas: a stats strip (headcount / working now
 * / month cost) over a responsive grid of agent cards. Each card carries the
 * live pulse (/api/profiles/pulse, polled every 10s): what the agent is doing
 * NOW, month spend vs cap, its named subagent roles (team.json sidecar), the
 * next routine and the configured channels. Clicking a card drills down to
 * that agent's team page (level 2, /profiles/team?name=<slug>).
 *
 * Product curation: the user sees AGENTS, never "profiles". The "default"
 * profile is not an agent — it IS the installation (the pre-profile
 * WAYNE_HOME that owns the model/skills/MCP/channels every agent inherits) —
 * so it stays out of the team, reachable only in the admin behind ?full=1.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Coins, Plus } from "lucide-react";

import { api } from "@/lib/api";
import type {
  ActiveProfileInfo,
  ProfileInfo,
  ProfilePulse,
  TeamSubagent,
} from "@/lib/api";
import { formatCredits } from "@/lib/credits";
import { useScheduleText } from "@/hooks/useScheduleText";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { Button } from "@nous-research/ui/ui/components/button";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn } from "@/lib/utils";

/** "redator-financeiro" → "Redator Financeiro" (display name). */
function prettify(name: string): string {
  const s = name.replace(/[-_]+/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Initials for the card's avatar. */
function monogram(name: string): string {
  const parts = prettify(name).split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return prettify(name).slice(0, 2).toUpperCase();
}

/** Per-agent extras loaded in the background (team sidecar + routine + channels). */
interface AgentExtras {
  area: string;
  subagents: TeamSubagent[];
  nextRun: string | null;
  routineCount: number;
  channels: string[];
}

/**
 * Live status chip: working (green pulse + live title) > waiting (terracotta,
 * the owner's turn) > starting > next routine (loop chip, same style as the
 * old TeamCanvas) > idle.
 */
function StatusChip({
  pulse,
  nextRun,
}: {
  pulse: ProfilePulse | undefined;
  nextRun: string | null;
}) {
  const { t } = useI18n();
  const ag = t.agents;
  if (pulse?.live_status === "working") {
    return (
      <span className="inline-flex min-w-0 max-w-[46%] shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
        <span className="truncate">{pulse.live_title || ag.statusWorkingNow}</span>
      </span>
    );
  }
  if (pulse?.live_status === "waiting") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-live/10 px-2 py-0.5 text-[11px] font-medium text-live">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-live" />
        {ag.statusWaitingYou}
      </span>
    );
  }
  if (pulse?.live_status === "starting") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500" />
        {ag.statusStarting}
      </span>
    );
  }
  if (nextRun) {
    return (
      <span
        className="inline-flex min-w-0 max-w-[46%] shrink-0 items-center gap-1 rounded-full bg-live/10 px-2 py-0.5 text-[11px] text-live"
        title={nextRun}
      >
        <CalendarClock className="h-3 w-3 shrink-0" />
        <span className="truncate">{nextRun}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      {ag.statusIdle}
    </span>
  );
}

export default function AgentsPage() {
  const { t } = useI18n();
  const ag = t.agents;
  const { toast, showToast } = useToast();
  const { setEnd } = usePageHeader();
  const navigate = useNavigate();

  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [active, setActive] = useState<ActiveProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [extras, setExtras] = useState<Record<string, AgentExtras>>({});
  const [pulse, setPulse] = useState<Record<string, ProfilePulse>>({});
  const [areaMenuFor, setAreaMenuFor] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getProfiles(), api.getActiveProfile()])
      .then(([p, a]) => {
        setProfiles(p.profiles);
        setActive(a);
      })
      .catch((e) => showToast(`${t.status.error}: ${e}`, "error"))
      .finally(() => setLoading(false));
  }, [showToast, t.status.error]);

  useEffect(() => {
    load();
  }, [load]);

  // Live pulse — polled every 10s (only while the tab is visible).
  const loadPulse = useCallback(() => {
    api
      .getProfilesPulse()
      .then((r) => {
        const m: Record<string, ProfilePulse> = {};
        for (const p of r.profiles) m[p.name] = p;
        setPulse(m);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPulse();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") loadPulse();
    }, 10000);
    return () => window.clearInterval(id);
  }, [loadPulse]);

  // Schedule as a localized human sentence (reuses the Cron screen's logic).
  const describeSchedule = useScheduleText();

  // Extras (team sidecar + next routine + channels) — in parallel, per agent,
  // without blocking the grid. Routine chip uses EXACTLY the TeamCanvas
  // approach: first enabled job (or first job) described via useScheduleText.
  const loadExtras = useCallback(
    (names: string[]) => {
      for (const name of names) {
        void Promise.all([
          api.getProfileTeam(name).catch(() => null),
          api.getCronJobs(name).catch(() => [] as Awaited<ReturnType<typeof api.getCronJobs>>),
          api.getMessagingPlatforms(name).catch(() => null),
        ]).then(([team, jobs, msg]) => {
          const enabled = jobs.filter((j) => j.enabled);
          const next = enabled[0] ?? jobs[0];
          setExtras((prev) => ({
            ...prev,
            [name]: {
              area: team?.area?.trim() ?? "",
              subagents: team?.subagents ?? [],
              nextRun: next ? describeSchedule(next.schedule, next.schedule_display ?? undefined) : null,
              routineCount: jobs.length,
              // Configured AND enabled — raw "enabled" alone inflates the list
              // (platforms ship enabled by default; lesson from AgentWorkflowPage).
              channels: (msg?.platforms ?? [])
                .filter((p) => p.configured && p.enabled)
                .map((p) => p.name),
            },
          }));
        });
      }
    },
    [describeSchedule],
  );

  useEffect(() => {
    if (profiles.length) loadExtras(profiles.filter((p) => !p.is_default).map((p) => p.name));
  }, [profiles, loadExtras]);

  const activeName = active?.active || "default";
  const isActive = useCallback(
    (p: ProfileInfo) =>
      p.name === activeName ||
      (p.is_default && (activeName === "default" || activeName === "")),
    [activeName],
  );

  // Topbar (page-header end slot, same wiring as before): delegate a goal +
  // new agent — the creation funnel is the quick start.
  useEffect(() => {
    setEnd(
      <div className="flex items-center gap-2">
        <Button ghost size="sm" onClick={() => navigate("/profiles/operations?delegate=1")}>
          {ag.teamDelegateGoal}
        </Button>
        <Button size="sm" onClick={() => navigate("/profiles/quickstart")}>
          <Plus className="h-4 w-4" />
          {ag.teamNewAgent}
        </Button>
      </div>,
    );
    return () => setEnd(null);
  }, [setEnd, ag.teamDelegateGoal, ag.teamNewAgent, navigate]);

  // Área presets — saved as the localized label (the sidecar stores a free string).
  const areaPresets = [
    ag.areaMarketing,
    ag.areaSales,
    ag.areaSupport,
    ag.areaFinance,
    ag.areaOps,
    ag.areaGeneral,
  ];

  const saveArea = useCallback(
    async (profileName: string, label: string) => {
      const prev = extras[profileName]?.area ?? "";
      // Optimistic: paint first, revert on error.
      setExtras((m) => ({
        ...m,
        [profileName]: {
          ...(m[profileName] ?? {
            area: "",
            subagents: [],
            nextRun: null,
            routineCount: 0,
            channels: [],
          }),
          area: label,
        },
      }));
      try {
        await api.updateProfileTeam(profileName, { area: label });
      } catch (e) {
        setExtras((m) =>
          m[profileName] ? { ...m, [profileName]: { ...m[profileName], area: prev } } : m,
        );
        showToast(`${t.status.error}: ${e}`, "error");
      }
    },
    [extras, showToast, t.status.error],
  );

  // The Team shows the agents the user CREATED — never the installation root.
  const teamProfiles = profiles.filter((p) => !p.is_default);

  const workingCount = teamProfiles.filter((p) => {
    const s = pulse[p.name]?.live_status;
    return s === "working" || s === "waiting";
  }).length;

  const monthTotal = teamProfiles.reduce(
    (acc, p) => acc + (pulse[p.name]?.month_credits ?? 0),
    0,
  );

  const teamUrl = (name: string) => `/profiles/team?name=${encodeURIComponent(name)}`;

  return (
    <div className="w-full px-4 py-3">
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">…</div>
      ) : (
        <div className="grid gap-4">
          {/* Stats strip — the team at a glance. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="type-micro text-muted-foreground">{ag.teamStatsAgents}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {teamProfiles.length}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="type-micro text-muted-foreground">{ag.teamStatsWorking}</div>
              <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {workingCount > 0 && (
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                )}
                {workingCount}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="type-micro text-muted-foreground">{ag.teamStatsMonthCost}</div>
              <div className="mt-1 flex items-baseline gap-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatCredits(Math.round(monthTotal))}
                <span className="text-sm font-normal text-muted-foreground">cr</span>
              </div>
            </div>
          </div>

          {/* The team — one card per agent + the dashed "new agent" card. */}
          <div className="grid gap-4 xl:grid-cols-2">
            {teamProfiles.map((p) => {
              const pu = pulse[p.name];
              const ex = extras[p.name];
              const working = pu?.live_status === "working";
              const area = ex?.area ?? "";
              const subs = ex?.subagents ?? [];
              const channels = ex?.channels ?? [];
              const cap = pu?.cap_credits ?? null;
              const pct = cap && cap > 0 ? ((pu?.month_credits ?? 0) / cap) * 100 : 0;
              return (
                <div
                  key={p.name}
                  onClick={() => navigate(teamUrl(p.name))}
                  className={cn(
                    "cursor-pointer rounded-xl border bg-card p-4 shadow-card transition-colors",
                    working
                      ? "border-emerald-500/40 ring-1 ring-emerald-500/25 shadow-[0_0_24px_-6px_rgba(16,185,129,0.35)]"
                      : "border-border hover:border-foreground/25",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar — same palette logic as the old TeamCanvas (active = inverted). */}
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                        isActive(p) ? "bg-foreground text-background" : "bg-muted text-foreground",
                      )}
                    >
                      {monogram(p.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {prettify(p.name)}
                      </h3>
                      {/* Área chip — click opens the preset select, saved optimistically. */}
                      <div
                        className="relative mt-1 inline-block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-label={ag.areaLabel}
                          title={ag.areaLabel}
                          onClick={() =>
                            setAreaMenuFor((cur) => (cur === p.name ? null : p.name))
                          }
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors hover:bg-foreground/10",
                            area ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground",
                          )}
                        >
                          {area || ag.areaNone}
                        </button>
                        {areaMenuFor === p.name && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setAreaMenuFor(null)}
                            />
                            <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-card p-1 shadow-lg">
                              {areaPresets.map((label) => (
                                <button
                                  key={label}
                                  type="button"
                                  onClick={() => {
                                    setAreaMenuFor(null);
                                    void saveArea(p.name, label);
                                  }}
                                  className={cn(
                                    "block w-full rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted",
                                    label === area && "font-medium text-live",
                                  )}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <StatusChip pulse={pu} nextRun={ex?.nextRun ?? null} />
                  </div>

                  {/* Cost row: month credits + progress vs cap (credits, never US$). */}
                  <div className="mt-3.5 flex items-center gap-2">
                    <Coins className="h-3.5 w-3.5 shrink-0 text-live" />
                    <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                      {pu ? `${formatCredits(pu.month_credits)} cr` : "…"}
                    </span>
                    {cap && cap > 0 ? (
                      <>
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              pct > 90 ? "bg-live" : "bg-emerald-500",
                            )}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {ag.teamCapShort.replace("{cap}", formatCredits(cap))}
                        </span>
                      </>
                    ) : (
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {ag.teamNoCap}
                      </span>
                    )}
                  </div>

                  {/* Bottom row: subagent roles + channels + drill-down link. */}
                  <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-2.5">
                    {subs.length > 0 && (
                      <div className="flex shrink-0 -space-x-1.5">
                        {subs.slice(0, 3).map((s, i) => (
                          <span
                            key={`${s.name}-${i}`}
                            title={s.name}
                            className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[8px] font-semibold text-foreground ring-2 ring-card"
                          >
                            {monogram(s.name)}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {ag.teamSubagents.replace("{count}", String(subs.length))}
                    </span>
                    {channels.slice(0, 2).map((c) => (
                      <span
                        key={c}
                        className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {c}
                      </span>
                    ))}
                    {channels.length > 2 && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                        +{channels.length - 2}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(teamUrl(p.name));
                      }}
                      className="ml-auto shrink-0 text-xs font-medium text-live underline-offset-4 hover:underline"
                    >
                      {ag.teamViewTeam} →
                    </button>
                  </div>
                </div>
              );
            })}

            {/* New agent — dashed card, creation funnel = quick start. */}
            <button
              type="button"
              onClick={() => navigate("/profiles/quickstart")}
              className="flex min-h-[172px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Plus className="h-6 w-6" />
              <span className="text-sm font-medium">{ag.teamNewAgent}</span>
              <span className="text-xs text-muted-foreground">{ag.teamNewAgentHint}</span>
            </button>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
