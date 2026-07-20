/**
 * AgentWorkflowPage — the agent's internal workflow (Onda 2.5, benchmark
 * Stack AI "Agentic Workflows"): clicking an agent in the Team opens THIS
 * page — his structure as an LR flow of REAL nodes:
 *
 *   Triggers ─┐
 *   Skills ─────→ Model ─→ Channels
 *   MCP ─────┘      └────→ Results
 *
 * The canvas is a CONFIGURATOR/X-ray (architecture decision): execution stays
 * LLM-driven (chat/cron/kanban) — no rigid pipeline engine. Clicking a node
 * opens the AgentDrawer straight at the matching tab, where the real editing
 * happens (model with ALL of OpenRouter, cron routines, skill toggles...).
 * Route: /profiles/agent?name=<slug>.
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
  BookOpen,
  Bot,
  Check,
  Coins,
  MessagesSquare,
  Package,
  Plug,
  Radio,
  Trash2,
  Zap,
} from "lucide-react";

import { api } from "@/lib/api";
import { usdToCredits, formatCredits } from "@/lib/credits";
import { AgentDrawer, type AgentDrawerTab } from "@/components/agents/AgentDrawer";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { useConfirmDelete } from "@nous-research/ui/hooks/use-confirm-delete";
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

/* ------------------------------------------------------------------ */
/* Generic workflow node                                               */
/* ------------------------------------------------------------------ */

interface WfNodeData {
  title: string;
  icon: "zap" | "bot" | "package" | "plug" | "radio" | "coins" | "book";
  /** Content rows (short label on the left / value on the right). */
  lines: Array<{ label: string; value?: string; on?: boolean }>;
  accent?: boolean;
  [key: string]: unknown;
}
type WfFlowNode = Node<WfNodeData, "wf">;

const NODE_ICONS = {
  zap: Zap,
  bot: Bot,
  package: Package,
  plug: Plug,
  radio: Radio,
  coins: Coins,
  book: BookOpen,
} as const;

function WfNode({ data }: NodeProps<WfFlowNode>) {
  const Icon = NODE_ICONS[data.icon];
  return (
    <div
      className={cn(
        "w-[250px] cursor-pointer rounded-xl border bg-card p-3.5 shadow-card transition-colors hover:border-foreground/30",
        data.accent ? "border-live/50 ring-1 ring-live/20" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
            data.accent ? "bg-live/10 text-live" : "bg-muted text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate text-sm font-semibold text-foreground">{data.title}</span>
      </div>
      <div className="mt-2.5 grid gap-1 border-t border-border/70 pt-2">
        {data.lines.map((l, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">{l.label}</span>
            {l.value !== undefined ? (
              <span className="shrink-0 font-medium tabular-nums text-foreground">{l.value}</span>
            ) : (
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  l.on ? "bg-emerald-500" : "bg-muted-foreground/30",
                )}
              />
            )}
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
    </div>
  );
}

const nodeTypes: NodeTypes = { wf: WfNode };

const NODE_W = 250;
const NODE_H = 132;

function layoutLR(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 26, ranksep: 90 });
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
  });
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

interface WfData {
  specialty: string;
  isDefault: boolean;
  isActive: boolean;
  model: string | null;
  skillsOn: number;
  skillsTotal: number;
  mcpNames: string[];
  channelNames: string[];
  routineCount: number;
  credits30: number | null;
  sessions30: number | null;
  knowledgeDocs: number;
  subagentNames: string[];
  /** Last session as an honest trace: when, cost, tool volume. */
  lastRun: {
    ts: number | null;
    costCredits: number;
    toolCount: number;
    totalS: number;
    mcpCalls: number;
  } | null;
}

export default function AgentWorkflowPage() {
  const { t } = useI18n();
  const ag = t.agents;
  const { toast, showToast } = useToast();
  const navigate = useNavigate();
  const { setTitle } = usePageHeader();
  const [searchParams] = useSearchParams();
  const name = (searchParams.get("name") ?? "").trim();
  const displayName = prettify(name);

  // "default" is not an agent — it's the installation (the pre-profile
  // WAYNE_HOME that owns the model/skills/MCP/channels every agent inherits).
  // The Team stopped listing it, so this X-ray no longer applies to it; reaching
  // it by URL used to print the raw on-disk name ("Default"). Its real surfaces
  // are Plugins/Canais, and the raw admin behind ?full=1.
  useEffect(() => {
    if (name === "default") navigate("/profiles", { replace: true });
  }, [name, navigate]);

  const [data, setData] = useState<WfData | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [drawerTab, setDrawerTab] = useState<AgentDrawerTab | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    setTitle(displayName || null);
    return () => setTitle(null);
  }, [setTitle, displayName]);

  useEffect(() => {
    if (!name) return;
    let dead = false;
    Promise.all([
      api.getProfiles().catch(() => ({ profiles: [] })),
      api.getActiveProfile().catch(() => null),
      api.getModelInfo(name).catch(() => null),
      api.getSkills(name).catch(() => []),
      api.getMcpServers(name).catch(() => ({ servers: [] })),
      api.getMessagingPlatforms(name).catch(() => ({ platforms: [] })),
      api.getCronJobs(name).catch(() => []),
      api.getAnalytics(30, name).catch(() => null),
      api.getKnowledge(name).catch(() => null),
      api.getProfileTeam(name).catch(() => null),
      api.getAgentTrace(name).catch(() => null),
    ]).then(([profs, active, model, skills, mcp, msg, jobs, usage, knowledge, team, trace]) => {
      if (dead) return;
      const p = profs.profiles.find((x) => x.name === name);
      const activeName = active?.active || "default";
      const usd = usage
        ? usage.totals.total_actual_cost > 0
          ? usage.totals.total_actual_cost
          : usage.totals.total_estimated_cost
        : 0;
      setData({
        specialty: p?.description?.trim() ?? "",
        isDefault: Boolean(p?.is_default),
        isActive:
          name === activeName ||
          (Boolean(p?.is_default) && (activeName === "default" || activeName === "")),
        model: model?.model ?? null,
        skillsOn: skills.filter((s) => s.enabled).length,
        skillsTotal: skills.length,
        mcpNames: (mcp.servers ?? []).filter((s) => s.enabled).map((s) => s.name),
        // Only CONFIGURED ones — raw "enabled" inflated the number (15
        // platforms enabled by default ≠ the agent's channels).
        channelNames: (msg.platforms ?? []).filter((c) => c.configured).map((c) => c.name),
        routineCount: jobs.length,
        credits30: usage ? usdToCredits(usd) : null,
        sessions30: usage ? usage.totals.total_sessions : null,
        knowledgeDocs: knowledge ? knowledge.documents.length : 0,
        subagentNames: (team?.subagents ?? []).map((s) => s.name),
        lastRun: trace?.session
          ? {
              ts: trace.session.last_active ?? trace.session.started_at,
              costCredits: usdToCredits(trace.session.cost_usd),
              toolCount: trace.tools.length,
              totalS: Math.round(
                trace.tools.reduce((acc, x) => acc + (x.duration_s ?? 0), 0),
              ),
              mcpCalls: trace.tools.filter((x) => x.name.startsWith("mcp_"))
                .length,
            }
          : null,
      });
    });
    return () => {
      dead = true;
    };
  }, [name, reloadNonce]);

  const activate = useCallback(async () => {
    setActivating(true);
    try {
      await api.setActiveProfile(name);
      showToast(`${ag.switched}: ${displayName}`, "success");
      setReloadNonce((n) => n + 1);
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    } finally {
      setActivating(false);
    }
  }, [name, displayName, showToast, ag.switched, t.status.error]);

  const agentDelete = useConfirmDelete<string>({
    onDelete: useCallback(
      async (slug: string) => {
        try {
          await api.deleteProfile(slug);
          showToast(`${ag.deleted}: ${prettify(slug)}`, "success");
          navigate("/profiles");
        } catch (e) {
          showToast(`${t.status.error}: ${e}`, "error");
          throw e;
        }
      },
      [showToast, ag.deleted, t.status.error, navigate],
    ),
  });
  const deleteMessage = agentDelete.pendingId
    ? ag.confirmDeleteMessage.replace("{name}", prettify(agentDelete.pendingId))
    : ag.confirmDeleteMessage;

  /* Graph — nodes with the agent's REAL numbers. */
  const { nodes, edges } = useMemo(() => {
    const d = data;
    const n = (
      id: string,
      title: string,
      icon: WfNodeData["icon"],
      lines: WfNodeData["lines"],
      accent = false,
    ): Node => ({ id, type: "wf", position: { x: 0, y: 0 }, data: { title, icon, lines, accent } });

    const top3 = (xs: string[]) => xs.slice(0, 3);
    const rawNodes: Node[] = [
      n("triggers", ag.wfTriggers, "zap", [
        { label: ag.wfChat, on: true },
        { label: t.app.nav.cron, value: d ? String(d.routineCount) : "…" },
        { label: t.app.nav.channels, value: d ? String(d.channelNames.length) : "…" },
        { label: ag.wfBoard, on: true },
      ]),
      n(
        "model",
        ag.qsModel,
        "bot",
        [
          { label: d?.model ? d.model.split("/").pop()! : "…", value: "" },
          { label: ag.qsModelHint.slice(0, 42) + "…", value: "" },
        ],
        true,
      ),
      n("skills", t.app.nav.skills, "package", [
        {
          label: ag.eqSkillsActive
            .replace("{on}", String(d?.skillsOn ?? "…"))
            .replace("{total}", String(d?.skillsTotal ?? "…")),
          value: "",
        },
        ...(d && d.subagentNames.length > 0
          ? [{ label: ag.studioSubagentsLabel, value: String(d.subagentNames.length) }]
          : []),
      ]),
      // Knowledge base (K1): documents ingested into the agent's own fact
      // store — clicking opens the drawer's knowledge tab (upload/remove).
      n("knowledge", ag.studioKnowledgeLabel, "book", [
        {
          label: ag.studioKnowledgeDocs.replace(
            "{count}",
            String(d?.knowledgeDocs ?? "…"),
          ),
          value: "",
        },
        { label: ag.studioKnowledgeCites, on: (d?.knowledgeDocs ?? 0) > 0 },
      ], (d?.knowledgeDocs ?? 0) > 0),
      n("mcp", "MCP", "plug", [
        { label: ag.wfServers.replace("{n}", String(d?.mcpNames.length ?? "…")), value: "" },
        ...top3(d?.mcpNames ?? []).map((m) => ({ label: m, on: true })),
        ...(d?.lastRun && d.lastRun.mcpCalls > 0
          ? [{ label: ag.studioLastRun, value: `${d.lastRun.mcpCalls}⚙` }]
          : []),
      ]),
      n("channels", t.app.nav.channels, "radio", [
        ...(d && d.channelNames.length > 0
          ? top3(d.channelNames).map((c) => ({ label: c, on: true }))
          : [{ label: ag.eqChannelsNone.slice(0, 36), value: "" }]),
      ]),
      n("results", ag.wfResults, "coins", [
        { label: ag.eqCost30d, value: d?.credits30 != null ? formatCredits(d.credits30) : "…" },
        { label: ag.eqSessions, value: d?.sessions30 != null ? String(d.sessions30) : "…" },
      ]),
    ];
    const rawEdges: Edge[] = [
      { id: "e-t-m", source: "triggers", target: "model", type: "smoothstep", animated: true },
      { id: "e-s-m", source: "skills", target: "model", type: "smoothstep" },
      { id: "e-k-m", source: "knowledge", target: "model", type: "smoothstep" },
      { id: "e-x-m", source: "mcp", target: "model", type: "smoothstep" },
      { id: "e-m-c", source: "model", target: "channels", type: "smoothstep" },
      { id: "e-m-r", source: "model", target: "results", type: "smoothstep", animated: true },
    ];
    return { nodes: layoutLR(rawNodes, rawEdges), edges: rawEdges };
  }, [data, ag, t.app.nav.cron, t.app.nav.channels, t.app.nav.skills]);

  const nodeTab: Record<string, AgentDrawerTab> = {
    triggers: "schedule",
    model: "profile",
    skills: "skills",
    knowledge: "knowledge",
    mcp: "mcp",
    channels: "channels",
    results: "activity",
  };

  // With no ?name= there is no agent — back to Team (effect, not during render).
  useEffect(() => {
    if (!name) navigate("/profiles", { replace: true });
  }, [name, navigate]);
  if (!name) return null;

  return (
    <div className="flex h-[calc(100dvh-112px)] min-h-[480px] flex-col px-4 py-3">
      <Toast toast={toast} />

      {/* Employee header. */}
      <div className="mb-3 flex items-center gap-3">
        <Link
          to="/profiles"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={ag.teamTab}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
            data?.isActive ? "bg-foreground text-background" : "bg-muted text-foreground",
          )}
        >
          {monogram(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1
              className="truncate text-lg font-medium text-foreground"
              style={{ fontFamily: "var(--theme-font-serif)" }}
            >
              {displayName}
            </h1>
            {data?.isActive && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground">
                <Check className="h-3 w-3" />
                {ag.active}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {data ? data.specialty || ag.noSpecialty : "…"}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() =>
            navigate(data?.isDefault ? "/chat" : `/chat?agent=${encodeURIComponent(name)}`)
          }
        >
          <MessagesSquare className="h-4 w-4" />
          {ag.eqTalk}
        </Button>
        {data && !data.isActive && (
          <Button size="sm" ghost onClick={() => void activate()} disabled={activating}>
            {activating ? "…" : ag.use}
          </Button>
        )}
        {data && !data.isDefault && (
          <Button
            ghost
            size="icon"
            aria-label={ag.deleteAgent}
            onClick={() => agentDelete.requestDelete(name)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* The workflow (React Flow LR). */}
      <div className="w4y-flow relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-background/60">
        {/* Last-run overlay pill: WHEN it ran, tool volume, honest cost —
            straight from state.db via /api/agent-trace. Clicking opens the
            activity tab (the full session list). */}
        {data?.lastRun && data.lastRun.ts != null && (
          <button
            type="button"
            onClick={() => setDrawerTab("activity")}
            className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-foreground shadow-card transition-colors hover:border-foreground/25"
          >
            <Check className="h-3.5 w-3.5 text-live" />
            <span className="font-medium">{ag.studioLastRun}</span>
            <span className="text-muted-foreground">
              {new Date(data.lastRun.ts * 1000).toLocaleString([], {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {data.lastRun.toolCount > 0 && (
              <span className="tabular-nums text-muted-foreground">
                · {data.lastRun.toolCount}⚙
                {data.lastRun.totalS > 0 ? ` · ${data.lastRun.totalS}s` : ""}
              </span>
            )}
            <span className="font-semibold tabular-nums text-live">
              {formatCredits(data.lastRun.costCredits)}
            </span>
          </button>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setDrawerTab(nodeTab[node.id] ?? "profile")}
          fitView
          fitViewOptions={{ padding: 0.24, maxZoom: 1.05 }}
          minZoom={0.45}
          maxZoom={1.4}
          nodesDraggable={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          panOnScroll
          zoomOnPinch
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="currentColor" />
        </ReactFlow>
      </div>

      <DeleteConfirmDialog
        open={agentDelete.isOpen}
        onCancel={agentDelete.cancel}
        onConfirm={agentDelete.confirm}
        title={ag.confirmDeleteTitle}
        description={deleteMessage}
        loading={agentDelete.isDeleting}
      />

      {drawerTab && data && (
        <AgentDrawer
          agent={{
            name,
            displayName,
            monogram: monogram(name),
            specialty: data.specialty,
            isActive: data.isActive,
            isDefault: data.isDefault,
          }}
          initialTab={drawerTab}
          onClose={() => setDrawerTab(null)}
          onChanged={() => setReloadNonce((v) => v + 1)}
          onActivate={() => void activate()}
          onRequestDelete={(slug) => {
            setDrawerTab(null);
            agentDelete.requestDelete(slug);
          }}
          activating={activating}
          notify={(msg, kind) => showToast(msg, kind)}
        />
      )}
    </div>
  );
}
