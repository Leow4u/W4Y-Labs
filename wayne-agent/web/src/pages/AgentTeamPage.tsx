/**
 * AgentTeamPage — ONE agent's team (Agents module, level 2).
 * Route: /profiles/team?name=<slug>.
 *
 * The principal on top (avatar, área, live status, model, month cost) and the
 * named subagent ROLES below (team.json sidecar via /api/profiles/<name>/team)
 * as a React Flow org chart — same dagre + .w4y-flow recipe as TeamCanvas.
 *
 * HONEST LIMITATION: the runtime does not attribute live work to a specific
 * role (delegate_task threads are same-profile), so when the principal is
 * working we animate the principal→team edge instead of pretending a given
 * subagent is the one running.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import dagre from "dagre";
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  Coins,
  MessagesSquare,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

import { api } from "@/lib/api";
import type { ProfileInfo, ProfilePulse, ProfileTeamInfo, TeamSubagent } from "@/lib/api";
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

/** Initials for the avatars. */
function monogram(name: string): string {
  const parts = prettify(name).split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return prettify(name).slice(0, 2).toUpperCase();
}

/** Product cap of named roles per agent — mirrored by the subtitle copy. */
const MAX_SUBAGENTS = 4;

/** Fixed emoji set for the subagent role tile. */
const SUB_EMOJIS = ["🧠", "✍️", "📊", "🔍", "📣", "🛠️", "📅", "💬"];

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-live/50";

/* ------------------------------------------------------------------ */
/* Custom nodes (Editorial DS)                                        */
/* ------------------------------------------------------------------ */

type StatusKind = "working" | "waiting" | "starting" | "routine" | "idle";

interface PrincipalCard {
  displayName: string;
  monogram: string;
  area: string;
  statusKind: StatusKind;
  statusText: string;
  /** Model slug (provider/model); null = still loading. */
  model: string | null;
  /** Month spend in credits; null = still loading. */
  monthCredits: number | null;
  /** "Delega até N subagentes" copy under the card. */
  subtitle: string;
}

type PrincipalNodeType = Node<{ card: PrincipalCard }, "principal">;
type SubNodeType = Node<{ sub: TeamSubagent }, "sub">;
type AddNodeType = Node<{ label: string }, "add">;

const PRINCIPAL_W = 304;
const PRINCIPAL_H = 196;
const SUB_W = 232;
const SUB_H = 84;
const ADD_H = 84;

const STATUS_CHIP_CLS: Record<StatusKind, string> = {
  working: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  waiting: "bg-live/10 text-live",
  starting: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  routine: "bg-live/10 text-live",
  idle: "bg-muted text-muted-foreground",
};

const STATUS_DOT_CLS: Partial<Record<StatusKind, string>> = {
  working: "bg-emerald-500",
  waiting: "bg-live",
  starting: "bg-amber-500",
};

function PrincipalNode({ data }: NodeProps<PrincipalNodeType>) {
  const { t } = useI18n();
  const ag = t.agents;
  const c = data.card;
  const dot = STATUS_DOT_CLS[c.statusKind];
  return (
    <div className="w-[304px] rounded-xl border border-foreground/25 bg-card p-4 shadow-card ring-1 ring-foreground/10">
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
          {c.monogram}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{c.displayName}</h3>
            <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground">
              {ag.teamPrincipal}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                c.area ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground",
              )}
            >
              {c.area || ag.areaNone}
            </span>
            <span
              className={cn(
                "inline-flex min-w-0 max-w-[172px] items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                STATUS_CHIP_CLS[c.statusKind],
              )}
              title={c.statusText}
            >
              {dot ? (
                <span className={cn("h-1.5 w-1.5 shrink-0 animate-pulse rounded-full", dot)} />
              ) : c.statusKind === "routine" ? (
                <CalendarClock className="h-3 w-3 shrink-0" />
              ) : null}
              <span className="truncate">{c.statusText}</span>
            </span>
          </div>
        </div>
      </div>
      {/* Model + month cost (credits, never US$). */}
      <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-2.5">
        <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          <Bot className="h-3 w-3 shrink-0" />
          <span className="truncate">{c.model ? c.model.split("/").pop() : "…"}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
          <Coins className="h-3 w-3" />
          {c.monthCredits === null ? "…" : `${formatCredits(c.monthCredits)} cr`}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{c.subtitle}</p>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
    </div>
  );
}

function SubNode({ data }: NodeProps<SubNodeType>) {
  const { t } = useI18n();
  const s = data.sub;
  return (
    <div className="w-[232px] cursor-pointer rounded-xl border border-border bg-card p-3 shadow-card transition-colors hover:border-foreground/30">
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-base">
          {s.icon || (
            <span className="text-xs font-semibold text-foreground">{monogram(s.name)}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{s.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {s.role?.trim() || t.agents.teamSubagentKind}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
    </div>
  );
}

function AddNode({ data }: NodeProps<AddNodeType>) {
  return (
    <div className="flex w-[232px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-transparent px-4 py-6 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
      <Plus className="h-4 w-4" />
      <span className="text-sm font-medium">{data.label}</span>
    </div>
  );
}

// Outside the component — React Flow requires a stable reference.
const nodeTypes: NodeTypes = { principal: PrincipalNode, sub: SubNode, add: AddNode };

/* ------------------------------------------------------------------ */
/* Layout (dagre, top-bottom)                                          */
/* ------------------------------------------------------------------ */

function nodeDims(n: Node): { w: number; h: number } {
  if (n.type === "principal") return { w: PRINCIPAL_W, h: PRINCIPAL_H };
  if (n.type === "add") return { w: SUB_W, h: ADD_H };
  return { w: SUB_W, h: SUB_H };
}

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 30, ranksep: 72 });
  for (const n of nodes) {
    const { w, h } = nodeDims(n);
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    const { w, h } = nodeDims(n);
    return { ...n, position: { x: p.x - w / 2, y: p.y - h / 2 } };
  });
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/** Inline editor state: index === null → creating a new role. */
interface SubForm {
  index: number | null;
  name: string;
  role: string;
  icon: string;
}

export default function AgentTeamPage() {
  const { t } = useI18n();
  const ag = t.agents;
  const { toast, showToast } = useToast();
  const { setTitle } = usePageHeader();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const name = (searchParams.get("name") ?? "").trim();
  const displayName = prettify(name);

  // No agent (or the installation root) → back to the Team. "default" is not
  // an agent — it IS the installation (same guard as AgentWorkflowPage).
  useEffect(() => {
    if (!name || name === "default") navigate("/profiles", { replace: true });
  }, [name, navigate]);

  useEffect(() => {
    setTitle(displayName || null);
    return () => setTitle(null);
  }, [setTitle, displayName]);

  const [profile, setProfile] = useState<ProfileInfo | null | undefined>(undefined);
  const [team, setTeam] = useState<ProfileTeamInfo | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [pulse, setPulse] = useState<ProfilePulse | null>(null);
  const [form, setForm] = useState<SubForm | null>(null);

  const describeSchedule = useScheduleText();

  // Static data: profile identity + team sidecar + model + routine chip
  // (routine described EXACTLY like TeamCanvas: first enabled job, localized).
  useEffect(() => {
    if (!name || name === "default") return;
    let dead = false;
    api
      .getProfiles()
      .then((r) => {
        if (dead) return;
        setProfile(r.profiles.find((x) => x.name === name) ?? null);
      })
      .catch(() => {
        if (!dead) setProfile(null);
      });
    api
      .getProfileTeam(name)
      .then((res) => {
        if (!dead) setTeam({ area: res.area, subagents: res.subagents });
      })
      .catch(() => {
        if (!dead) setTeam({ area: "", subagents: [] });
      });
    api
      .getModelInfo(name)
      .then((r) => {
        if (!dead) setModel(r.model);
      })
      .catch(() => {});
    api
      .getCronJobs(name)
      .then((jobs) => {
        if (dead) return;
        const enabled = jobs.filter((j) => j.enabled);
        const next = enabled[0] ?? jobs[0];
        setNextRun(next ? describeSchedule(next.schedule, next.schedule_display ?? undefined) : null);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [name, describeSchedule]);

  // Profile vanished (deleted / bad slug) → back to the Team.
  useEffect(() => {
    if (profile === null) navigate("/profiles", { replace: true });
  }, [profile, navigate]);

  // Live pulse of the principal — polled every 10s while the tab is visible.
  useEffect(() => {
    if (!name) return;
    const tick = () => {
      api
        .getProfilesPulse()
        .then((r) => setPulse(r.profiles.find((x) => x.name === name) ?? null))
        .catch(() => {});
    };
    tick();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, 10000);
    return () => window.clearInterval(id);
  }, [name]);

  // Stable identity — the graph memo and the CRUD callbacks depend on it.
  const subs = useMemo(() => team?.subagents ?? [], [team]);

  /* ---------------- Subagent CRUD (optimistic, sidecar PUT) ---------------- */

  const persistSubs = useCallback(
    async (nextSubs: TeamSubagent[], prev: ProfileTeamInfo | null) => {
      // Optimistic: paint first, revert with a toast on error.
      setTeam({ area: prev?.area ?? "", subagents: nextSubs });
      try {
        const res = await api.updateProfileTeam(name, { subagents: nextSubs });
        setTeam({ area: res.area, subagents: res.subagents });
      } catch (e) {
        setTeam(prev);
        showToast(`${t.status.error}: ${e}`, "error");
      }
    },
    [name, showToast, t.status.error],
  );

  const saveSub = useCallback(() => {
    if (!form || !form.name.trim()) return;
    const entry: TeamSubagent = {
      name: form.name.trim(),
      role: form.role.trim() || undefined,
      icon: form.icon,
    };
    const nextSubs =
      form.index === null
        ? [...subs, entry]
        : subs.map((s, i) => (i === form.index ? entry : s));
    setForm(null);
    void persistSubs(nextSubs, team);
  }, [form, subs, team, persistSubs]);

  const removeSub = useCallback(() => {
    if (!form || form.index === null) return;
    const idx = form.index;
    setForm(null);
    void persistSubs(subs.filter((_, i) => i !== idx), team);
  }, [form, subs, team, persistSubs]);

  /* ---------------- Graph ---------------- */

  const statusInfo = useMemo((): { kind: StatusKind; text: string } => {
    if (pulse?.live_status === "working")
      return { kind: "working", text: pulse.live_title || ag.statusWorkingNow };
    if (pulse?.live_status === "waiting") return { kind: "waiting", text: ag.statusWaitingYou };
    if (pulse?.live_status === "starting") return { kind: "starting", text: ag.statusStarting };
    if (nextRun) return { kind: "routine", text: nextRun };
    return { kind: "idle", text: ag.statusIdle };
  }, [pulse, nextRun, ag]);

  const { nodes, edges, flowKey } = useMemo(() => {
    const card: PrincipalCard = {
      displayName,
      monogram: monogram(name),
      area: team?.area?.trim() ?? "",
      statusKind: statusInfo.kind,
      statusText: statusInfo.text,
      model,
      monthCredits: pulse ? pulse.month_credits : null,
      subtitle: ag.delegatesUpTo.replace("{count}", String(MAX_SUBAGENTS)),
    };
    const rawNodes: Node[] = [
      { id: "main", type: "principal", position: { x: 0, y: 0 }, data: { card } },
      ...subs.map((s, i) => ({
        id: `sub-${i}`,
        type: "sub" as const,
        position: { x: 0, y: 0 },
        data: { sub: s },
      })),
    ];
    const rawEdges: Edge[] = subs.map((_, i) => ({
      id: `e-main-sub-${i}`,
      source: "main",
      target: `sub-${i}`,
      type: "smoothstep",
      // Honest limitation: no per-role live attribution exists, so only the
      // FIRST principal→team edge animates while the principal is working.
      animated: statusInfo.kind === "working" && i === 0,
    }));
    if (subs.length < MAX_SUBAGENTS) {
      rawNodes.push({
        id: "__add",
        type: "add",
        position: { x: 0, y: 0 },
        data: { label: ag.teamNewSubagent },
      });
      rawEdges.push({ id: "e-main-add", source: "main", target: "__add", type: "smoothstep" });
    }
    return {
      nodes: layoutNodes(rawNodes, rawEdges),
      edges: rawEdges,
      // Composition changed → re-mount so fitView recenters.
      flowKey: `${name}|${subs.length}`,
    };
  }, [displayName, name, team, statusInfo, model, pulse, subs, ag]);

  if (!name) return null;

  const area = team?.area?.trim() ?? "";

  return (
    <div className="flex h-[calc(100dvh-112px)] min-h-[480px] flex-col px-4 py-3">
      <Toast toast={toast} />

      {/* Header — back + identity + Studio / Talk. */}
      <div className="mb-3 flex items-center gap-3">
        <Link
          to="/profiles"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {ag.teamBackTeam}
        </Link>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
          {monogram(name)}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <h1
            className="truncate text-lg font-medium text-foreground"
            style={{ fontFamily: "var(--theme-font-serif)" }}
          >
            {displayName}
          </h1>
          {team && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                area ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground",
              )}
            >
              {area || ag.areaNone}
            </span>
          )}
        </div>
        <div className="flex-1" />
        <Button
          size="sm"
          ghost
          onClick={() => navigate(`/profiles/agent?name=${encodeURIComponent(name)}`)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {ag.teamOpenStudio}
        </Button>
        <Button size="sm" onClick={() => navigate(`/chat?agent=${encodeURIComponent(name)}`)}>
          <MessagesSquare className="h-4 w-4" />
          {ag.eqTalk}
        </Button>
      </div>

      {/* The team canvas (React Flow TB) + the inline role editor. */}
      <div className="w4y-flow relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-background/60">
        {team === null ? (
          <div className="py-16 text-center text-sm text-muted-foreground">…</div>
        ) : (
          <ReactFlow
            key={flowKey}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => {
              if (node.type === "add") {
                setForm({ index: null, name: "", role: "", icon: SUB_EMOJIS[0] });
              } else if (node.type === "sub") {
                const i = Number(node.id.replace("sub-", ""));
                const s = subs[i];
                if (s) {
                  setForm({
                    index: i,
                    name: s.name,
                    role: s.role ?? "",
                    icon: s.icon || SUB_EMOJIS[0],
                  });
                }
              }
            }}
            fitView
            fitViewOptions={{ padding: 0.28, maxZoom: 1 }}
            minZoom={0.45}
            maxZoom={1.35}
            nodesDraggable={false}
            nodesConnectable={false}
            deleteKeyCode={null}
            panOnScroll
            zoomOnPinch
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="currentColor" />
          </ReactFlow>
        )}

        {/* Inline role editor — create (add node) or edit/remove (sub node). */}
        {form && (
          <div className="absolute right-3 top-3 z-10 w-72 rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {form.index === null ? ag.teamNewSubagent : form.name || ag.teamSubagentKind}
              </h2>
              <Button
                ghost
                size="icon"
                onClick={() => setForm(null)}
                aria-label={t.common.close}
                className="-mr-1.5 -mt-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1.5">
                <span className="type-caption text-foreground">{ag.teamSubName}</span>
                <input
                  className={inputCls}
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="type-caption text-foreground">{ag.teamSubRole}</span>
                <input
                  className={inputCls}
                  value={form.role}
                  onChange={(e) => setForm((f) => (f ? { ...f, role: e.target.value } : f))}
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SUB_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setForm((f) => (f ? { ...f, icon: e } : f))}
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-lg border text-base transition-colors",
                      form.icon === e
                        ? "border-live bg-live/10"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3.5 flex items-center gap-2 border-t border-border/70 pt-3">
              {form.index !== null && (
                <Button
                  ghost
                  size="sm"
                  onClick={removeSub}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {ag.teamRemoveSub}
                </Button>
              )}
              <div className="flex-1" />
              <Button ghost size="sm" onClick={() => setForm(null)}>
                {t.common.cancel}
              </Button>
              <Button size="sm" onClick={saveSub} disabled={!form.name.trim()}>
                {t.common.save}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
