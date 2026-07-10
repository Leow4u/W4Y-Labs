/**
 * TeamCanvas — a Equipe como um organograma vivo (módulo Agentes, Onda 2).
 *
 * Benchmark: Google Cloud Agent Designer (canvas hierárquico raiz → agentes)
 * com a nossa curadoria Editorial. O canvas é um CONFIGURADOR/raio-X — nunca
 * um motor de pipeline: a execução continua LLM-driven (delegate/kanban/cron).
 *
 * Hierarquia v1: o agente principal (default) no topo; os demais como time
 * direto. Reposicionar/re-parentear (sidecar team.json) fica pra Onda 2.5.
 * Cada card mostra o pulso operacional do funcionário: custo 30d em créditos
 * (nunca US$ — regra de billing) e a próxima rotina agendada.
 */
import { useEffect, useMemo } from "react";
import dagre from "dagre";
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CalendarClock, Check, Coins, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/credits";
import { useI18n } from "@/i18n";

/** O que o canvas precisa saber de cada agente pra desenhar o card. */
export interface TeamAgentCard {
  /** slug do profile (id). */
  name: string;
  displayName: string;
  monogram: string;
  specialty: string;
  isActive: boolean;
  isDefault: boolean;
  /** Custo 30d em créditos; null = ainda carregando. */
  credits30: number | null;
  /** Próxima rotina (display humano do schedule); null = sem rotina. */
  nextRun: string | null;
  routineCount: number | null;
}

type AgentNodeType = Node<{ card: TeamAgentCard }, "agent">;
type AddNodeType = Node<{ label: string }, "add">;

const NODE_W = 264;
const NODE_H = 148;
const ADD_H = 96;

/* ------------------------------------------------------------------ */
/* Nós customizados (Editorial DS)                                     */
/* ------------------------------------------------------------------ */

function AgentNode({ data }: NodeProps<AgentNodeType>) {
  const { t } = useI18n();
  const c = data.card;
  return (
    <div
      className={cn(
        "w-[264px] cursor-pointer rounded-xl border bg-card p-4 shadow-card transition-colors",
        c.isActive
          ? "border-foreground/30 ring-1 ring-foreground/15"
          : "border-border hover:border-foreground/25",
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
            c.isActive ? "bg-foreground text-background" : "bg-muted text-foreground",
          )}
        >
          {c.monogram}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{c.displayName}</h3>
            {c.isActive && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground">
                <Check className="h-3 w-3" />
                {t.agents.active}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
            {c.specialty || <span className="italic opacity-70">{t.agents.noSpecialty}</span>}
          </p>
        </div>
      </div>
      {/* Pulso operacional: custo (créditos) + rotina. */}
      <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-2.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
          <Coins className="h-3 w-3" />
          {c.credits30 === null ? "…" : `${formatCredits(c.credits30)} · 30d`}
        </span>
        {c.routineCount !== null && c.routineCount > 0 && (
          <span
            className="inline-flex min-w-0 items-center gap-1 rounded-full bg-live/10 px-2 py-0.5 text-[11px] text-live"
            title={c.nextRun ?? undefined}
          >
            <CalendarClock className="h-3 w-3 shrink-0" />
            <span className="truncate">{c.nextRun ?? c.routineCount}</span>
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
    </div>
  );
}

function AddNode({ data }: NodeProps<AddNodeType>) {
  return (
    <div className="flex w-[264px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-transparent px-4 py-7 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-transparent" />
      <Plus className="h-5 w-5" />
      <span className="text-sm font-medium">{data.label}</span>
    </div>
  );
}

// Fora do componente — React Flow exige referência estável.
const nodeTypes: NodeTypes = { agent: AgentNode, add: AddNode };

/* ------------------------------------------------------------------ */
/* Layout (dagre, top-bottom)                                          */
/* ------------------------------------------------------------------ */

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 36, ranksep: 76 });
  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W, height: n.type === "add" ? ADD_H : NODE_H });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    const h = n.type === "add" ? ADD_H : NODE_H;
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - h / 2 } };
  });
}

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

export function TeamCanvas({
  agents,
  onOpen,
  onAdd,
}: {
  agents: TeamAgentCard[];
  onOpen: (name: string) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();

  const { builtNodes, builtEdges, teamKey } = useMemo(() => {
    const root = agents.find((a) => a.isDefault) ?? agents[0];
    const nodes: Node[] = agents.map((a) => ({
      id: a.name,
      type: "agent" as const,
      position: { x: 0, y: 0 },
      data: { card: a },
    }));
    nodes.push({
      id: "__add",
      type: "add" as const,
      position: { x: 0, y: 0 },
      data: { label: t.agents.newAgent },
    });
    const edges: Edge[] = [];
    if (root) {
      for (const a of agents) {
        if (a.name === root.name) continue;
        edges.push({
          id: `e-${root.name}-${a.name}`,
          source: root.name,
          target: a.name,
          type: "smoothstep",
        });
      }
      edges.push({
        id: `e-${root.name}-__add`,
        source: root.name,
        target: "__add",
        type: "smoothstep",
        style: { strokeDasharray: "5 4" },
      });
    }
    return {
      builtNodes: layoutNodes(nodes, edges),
      builtEdges: edges,
      // Identidade da equipe: mudou a composição → re-layout; só dados → preserva drag.
      teamKey: agents.map((a) => a.name).join("|"),
    };
  }, [agents, t.agents.newAgent]);

  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  useEffect(() => {
    setEdges(builtEdges);
    setNodes((prev) => {
      const sameTeam =
        prev.length === builtNodes.length && builtNodes.every((n) => prev.some((p) => p.id === n.id));
      if (!sameTeam) return builtNodes; // equipe mudou → layout novo
      // Mesma equipe (ex.: custo/rotina chegaram) → troca só os dados,
      // preservando qualquer arrasto que o usuário fez.
      return prev.map((p) => {
        const next = builtNodes.find((n) => n.id === p.id);
        return next ? { ...p, data: next.data } : p;
      });
    });
  }, [builtNodes, builtEdges, setNodes, setEdges]);

  return (
    <div className="w4y-flow h-full w-full overflow-hidden rounded-xl border border-border bg-background/60">
      <ReactFlow
        key={teamKey}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (node.type === "add") onAdd();
          else onOpen(node.id);
        }}
        fitView
        fitViewOptions={{ padding: 0.28, maxZoom: 1 }}
        minZoom={0.45}
        maxZoom={1.35}
        nodesConnectable={false}
        deleteKeyCode={null}
        panOnScroll
        zoomOnPinch
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="currentColor" />
      </ReactFlow>
    </div>
  );
}
