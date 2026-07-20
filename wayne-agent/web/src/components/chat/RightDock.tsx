/**
 * RightDock v3 — the "Computador do Wayne" as a REACTIVE STACK (Codex
 * benchmark, Onda D1). The fixed tab strip is gone: the panel is a pile of
 * blocks that appear when the resource is used and vanish when empty.
 *
 *   Header       the live Ambiente summary (the old "pin", now permanent)
 *   Resultados   only when the last turn FINISHED (message.complete snapshot +
 *                review.summary); the next prompt clears it (Onda D2)
 *   Plano        only when the task has steps (todo via tool.complete) — the
 *                full list with per-step time; the composer chip opens it
 *   Subagentes   only when there was delegation (subagent.* events): Ativos /
 *                Concluídos; a row expands inline with what the events carry
 *   Fontes       task attachments + connected apps the agent used; the "+"
 *                menu attaches files (same composer flow) or connects apps
 *                (connect-by-chat → ConnectLinkCard)
 *   Saídas       every file the agent produced this task (the chat-parsed
 *                MEDIA:/@session cards, aggregated; FileRefCard behavior)
 *   Pré-visual.  only when an .html exists (iframe via /api/fs/read-data-url)
 *   Código       only when a file is opened from Saídas/Arquivos (viewer)
 *   Alterações   only when there is a diff (REAL git or tool diffs)
 *   Arquivos     project file browser, collapsed by default (conversation)
 *   Projeto      instructions/scheduled, collapsed by default (conversation)
 *
 * Present from the HERO on (before the conversation starts): only Fontes
 * (with the functional "+") and Saídas (placeholder hint). Closed: a handle
 * on the edge; with activity, an "Ambiente · summary" chip with a live dot.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileDiff,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Globe,
  Home,
  Image as ImageIcon,
  ListTodo,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorSmartphone,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Plug,
  Plus,
  Presentation,
  RefreshCw,
  RotateCcw,
  Settings2,
  Smartphone,
  SquareArrowOutUpRight,
  Table,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import { useI18n } from "@/i18n";
import {
  api,
  type ConnectorToolkit,
  type CronJob,
  type GitRepoStatus,
  type GitReviewFile,
  type ManagedFileEntry,
} from "@/lib/api";
import {
  appendText,
  patchTool,
  pushTool,
  type SubagentInfo,
  type TurnResult,
} from "@/hooks/useChatSession";
import { GatewayClient, type GatewayEvent } from "@/lib/gatewayClient";
import {
  cloudReadFile,
  cloudReadFileDataUrl,
  isCloudSessionActive,
} from "@/lib/cloudSession";
import {
  desktopOpenExternal,
  isLocalPath,
  normalizeLocalPath,
  readLocalFileDataUrl,
} from "@/lib/localFile";
import {
  stitchHistory,
  type ChatMessage,
  type TaskStep,
  type ToolCallState,
} from "./types";
import { AssistantTurn } from "./AssistantTurn";
import { MessageBubble } from "./MessageBubble";
import { DiffView } from "./ToolLine";
import { FileRefCard, type FileRef } from "./FileRefCard";
import { loadCatalog } from "./ConnectLinkCard";
import { LogoTile } from "@/components/connectors/ConnectorCard";

export interface DockChange {
  path: string;
  diff: string;
}
export interface DockUrl {
  url: string;
  domain: string;
  title?: string;
  shot?: string;
}
/** A source shown under Fontes: a task attachment (image/file, the page owns
 *  the attach flow) or the "Internet" marker (kind "web") when the agent
 *  browsed/searched the web this task. */
export interface DockSource {
  name: string;
  kind: "image" | "file" | "web";
}

/** Sentinel slug the page pushes into `usedApps` when a mcp_composio* tool ran
 *  but no KNOWN connected slug matched the tool name (connectors fetch failed,
 *  per-agent-only connection, or an unrecognized toolkit). The contract — every
 *  connector action is a mcp_composio* tool — guarantees an app WAS used, so the
 *  chip must never be silent; this renders a generic "Connected app" fallback. */
export const GENERIC_APP_SLUG = "__app__";

const PREF_KEY = "wayne:right-dock";
const WIDTH_KEY = "wayne:dock-width";

const MIN_W = 300;
const maxW = () => Math.min(920, Math.round(window.innerWidth * 0.7));
const clampW = (w: number) => Math.max(MIN_W, Math.min(maxW(), w));

/** The gateway diffs name files relative to the TOOL's cwd (e.g. "data/x.html"
 *  for /opt/data/x.html); the files API expects absolute or relative to the
 *  managed ROOT. Builds candidates and the caller tries them in order. */
function pathCandidates(path: string): string[] {
  const out = [path];
  if (!path.startsWith("/")) {
    const parts = path.split("/");
    if (parts.length > 1) out.push(parts.slice(1).join("/")); // strips "data/"
    out.push(`/opt/${path}`);
  }
  return [...new Set(out)];
}

function dataUrlToText(dataUrl: string): string {
  const [meta, b64] = dataUrl.split(",", 2);
  if (/base64/.test(meta) && b64) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }
  return "";
}

async function readDataUrlSmart(path: string): Promise<string | null> {
  // A user-machine path (Local desktop mode: C:\… or MSYS /c/…) never exists
  // on the server — read it through the session's executor instead, with no
  // server fallback (the candidates would only 404 against the wrong disk).
  if (isLocalPath(path)) {
    const local = await readLocalFileDataUrl(path);
    return local?.data_url ?? null;
  }
  // Cloud-target session (S1 mini-computer): the file lives on the user's
  // CLOUD computer — read through the shell's cloud bridge, with no local
  // fallback (same-origin would read the WRONG machine's disk).
  if (isCloudSessionActive()) {
    for (const p of pathCandidates(path)) {
      const r = await cloudReadFileDataUrl(p);
      if (r?.data_url) return r.data_url;
    }
    return null;
  }
  for (const p of pathCandidates(path)) {
    try {
      const r = await api.readFileDataUrl(p);
      const d = r.dataUrl ?? r.data_url;
      if (d) return d;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

async function readTextSmart(path: string): Promise<string | null> {
  if (isLocalPath(path)) {
    const local = await readLocalFileDataUrl(path);
    return local?.data_url ? dataUrlToText(local.data_url) : null;
  }
  if (isCloudSessionActive()) {
    for (const p of pathCandidates(path)) {
      const r = await cloudReadFile(p);
      if (r?.data_url) return dataUrlToText(r.data_url);
    }
    return null;
  }
  for (const p of pathCandidates(path)) {
    try {
      const r = await api.readFile(p);
      return dataUrlToText(r.data_url);
    } catch {
      /* try the next one */
    }
  }
  return null;
}

type DockTab = "env" | "plan" | "preview" | "code" | "files" | "changes" | "project";

/* ── atoms ───────────────────────────────────────────────────────────── */

/** 74s → "1:14"; 32s → "0:32" (benchmark format for step/turn times). */
function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function fmtTokens(n: number | undefined | null): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Re-render every second while `running` so live elapsed times advance. */
function useTicker(running: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
}

/** Deterministic 5×5 pixel identicon — the subagents' visual identity
 *  (Codex benchmark; recovered from the pre-D1 dock — client-side only). */
function PixelAvatar({ seed, size = 16 }: { seed: string; size?: number }) {
  const cells = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const hue = Math.abs(h) % 360;
    const bits: boolean[] = [];
    let x = Math.abs(h) || 1;
    for (let i = 0; i < 15; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      bits.push(x % 100 < 52);
    }
    // 5×5 with horizontal symmetry (columns 0-2 mirror into 4-3).
    const grid: boolean[] = [];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) grid.push(bits[r * 3 + (c > 2 ? 4 - c : c)]);
    return { hue, grid };
  }, [seed]);
  const cell = size / 5;
  return (
    <span
      aria-hidden
      className="grid shrink-0 overflow-hidden rounded-[4px]"
      style={{
        width: size,
        height: size,
        gridTemplateColumns: `repeat(5, ${cell}px)`,
        backgroundColor: `hsl(${cells.hue} 30% 92%)`,
      }}
    >
      {cells.grid.map((on, i) => (
        <span
          key={i}
          style={{
            width: cell,
            height: cell,
            backgroundColor: on ? `hsl(${cells.hue} 52% 48%)` : "transparent",
          }}
        />
      ))}
    </span>
  );
}

/** Destructive/mutating action button with a TWO-tap confirmation. */
function ArmedButton({
  label,
  confirmLabel,
  onFire,
  disabled,
  primary,
}: {
  label: string;
  confirmLabel: string;
  onFire: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onFire();
        } else setArmed(true);
      }}
      className={`rounded-lg px-3 py-1.5 type-ui font-medium transition-colors disabled:opacity-40 ${
        armed
          ? "bg-warning/15 text-warning"
          : primary
            ? "bg-foreground text-background hover:opacity-90"
            : "border border-border bg-background text-foreground hover:bg-muted"
      }`}
      title={armed ? confirmLabel : label}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/** One reactive block: caption header (chevron + icon + label + count) with an
 *  optional action slot; collapses on click. `keepMounted` keeps the children
 *  mounted while collapsed/hidden (the Alterações git probe must stay alive). */
function DockBlock({
  Icon,
  label,
  count,
  open,
  onToggle,
  action,
  overlay,
  hidden,
  keepMounted,
  children,
}: {
  Icon: typeof Monitor;
  label: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  /** Right side of the header (e.g. the Fontes "+" or a close ×). */
  action?: React.ReactNode;
  /** Rendered inside the (relative) section regardless of collapse — menus. */
  overlay?: React.ReactNode;
  hidden?: boolean;
  keepMounted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className={hidden ? "hidden" : "relative border-b border-border/70"}>
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 py-1 text-left text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-text-tertiary transition-transform ${open ? "rotate-90" : ""}`}
          />
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate type-caption font-medium uppercase tracking-[0.05em]">
            {label}
          </span>
          {typeof count === "number" && count > 0 && (
            <span className="type-micro tabular-nums text-text-tertiary">{count}</span>
          )}
        </button>
        {action}
      </div>
      {keepMounted ? <div className={open ? undefined : "hidden"}>{children}</div> : open && children}
      {overlay}
    </section>
  );
}

/** Small header icon-button (block actions: +, ×). */
function BlockAction({
  title,
  onClick,
  menuKey,
  children,
}: {
  title: string;
  onClick: () => void;
  menuKey?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-menu-trigger={menuKey}
      onClick={onClick}
      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

/* ── Plano ───────────────────────────────────────────────────────────── */

/** The task plan — the FULL step list with per-step time (the composer chip is
 *  the at-a-glance line; clicking it opens this block). Steps come from the
 *  todo tool via tool.complete; timing is client-clocked (types.ts TaskStep). */
function PlanBlock({
  open,
  onToggle,
  steps,
}: {
  open: boolean;
  onToggle: () => void;
  steps: TaskStep[];
}) {
  const { t } = useI18n();
  useTicker(steps.some((s) => s.status === "in_progress"));
  const done = steps.filter(
    (s) => s.status === "completed" || s.status === "cancelled",
  ).length;
  return (
    <DockBlock
      Icon={ListTodo}
      label={t.chat.dockPlan}
      open={open}
      onToggle={onToggle}
      action={
        <span className="shrink-0 px-1 type-micro tabular-nums text-text-tertiary">
          {done} / {steps.length}
        </span>
      }
    >
      <div className="space-y-0.5 px-3 pb-2.5">
        {steps.map((s) => {
          const live = s.status === "in_progress";
          const secs =
            s.durationS ??
            (live && s.startedAt != null ? (Date.now() - s.startedAt) / 1000 : null);
          return (
            <div key={s.id} className="flex items-start gap-1.5 type-caption">
              {s.status === "completed" ? (
                <Check className="mt-px h-3 w-3 shrink-0 text-success" />
              ) : live ? (
                <Loader2 className="mt-px h-3 w-3 shrink-0 animate-spin text-live" />
              ) : s.status === "cancelled" ? (
                <XCircle className="mt-px h-3 w-3 shrink-0 text-text-tertiary" />
              ) : (
                <Circle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-text-tertiary" />
              )}
              <span
                className={`min-w-0 flex-1 ${
                  s.status === "completed"
                    ? "text-muted-foreground line-through decoration-border"
                    : live
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                {s.content}
              </span>
              {secs != null && (
                <span className="shrink-0 type-micro tabular-nums text-text-tertiary">
                  {fmtClock(secs)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </DockBlock>
  );
}

/* ── Subagentes ──────────────────────────────────────────────────────── */

function fmtAgentElapsed(startedAt: number, durationS?: number): string {
  const s = durationS ?? (Date.now() - startedAt) / 1000;
  if (s < 60) return `${Math.max(1, Math.round(s))}s`;
  return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

/** One subagent row (list recovered from the pre-D1 dock). Completed rows
 *  expand the inline detail with what the subagent.* events already carry
 *  (model, tools, tokens). An ACTIVE row with a child session id opens the
 *  live spectator instead (`onWatch`) — the gateway's native lazy watch
 *  sessions (server.py:773-775), wired in Onda D2.1. */
function AgentRow({ agent, onWatch }: { agent: SubagentInfo; onWatch?: () => void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const detail: Array<[string, string]> = [];
  if (agent.model) detail.push([t.analytics.model, agent.model]);
  if (agent.toolCount != null && agent.toolCount > 0)
    detail.push([t.chat.toolsLabel, String(agent.toolCount)]);
  if (agent.tokensIn != null || agent.tokensOut != null)
    detail.push([
      `${t.chat.tokensIn} / ${t.chat.tokensOut}`,
      `${fmtTokens(agent.tokensIn)} / ${fmtTokens(agent.tokensOut)}`,
    ]);
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={onWatch ?? (() => setExpanded((v) => !v))}
        title={onWatch ? t.chat.dockWatchLive : undefined}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left type-caption transition-colors hover:bg-muted/60"
      >
        <PixelAvatar seed={agent.id} />
        {agent.status === "running" ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-live" />
        ) : agent.status === "error" ? (
          <XCircle className="h-3 w-3 shrink-0 text-destructive" />
        ) : (
          <Check className="h-3 w-3 shrink-0 text-success" />
        )}
        <span className="min-w-0 flex-1 truncate text-foreground" title={agent.label}>
          {agent.label}
        </span>
        <span className="shrink-0 tabular-nums text-text-tertiary">
          {fmtAgentElapsed(agent.startedAt, agent.durationS)}
        </span>
        <ChevronRight
          className={`h-3 w-3 shrink-0 text-text-tertiary transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded && detail.length > 0 && (
        <div className="mb-1 ml-[26px] space-y-0.5 border-l border-border/70 pl-2.5">
          {detail.map(([label, value]) => (
            <div key={label} className="flex items-center gap-2 type-micro">
              <span className="min-w-0 flex-1 truncate text-text-tertiary">{label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Delegation view (Codex benchmark): Ativos (working now) on top,
 *  Concluídos (with outcome) below. Data = subagent.* events; an active row
 *  with a child session id opens the live spectator via `onWatch`. */
function AgentsBlock({
  open,
  onToggle,
  subagents,
  onWatch,
}: {
  open: boolean;
  onToggle: () => void;
  subagents: SubagentInfo[];
  onWatch: (agent: SubagentInfo) => void;
}) {
  const { t } = useI18n();
  useTicker(subagents.some((s) => s.status === "running"));
  const active = subagents.filter((s) => s.status === "running");
  const finished = subagents.filter((s) => s.status !== "running");
  const groupCls =
    "px-1 pb-0.5 pt-1 type-micro font-medium uppercase tracking-[0.05em] text-text-tertiary";
  return (
    <DockBlock
      Icon={Users}
      label={t.chat.envAgents}
      count={subagents.length}
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-0.5 px-2 pb-2">
        {active.length > 0 && (
          <>
            <div className={groupCls}>{t.chat.dockAgentsActive}</div>
            {active.map((a) => (
              <AgentRow
                key={a.id}
                agent={a}
                onWatch={a.childSessionId ? () => onWatch(a) : undefined}
              />
            ))}
          </>
        )}
        {finished.length > 0 && (
          <>
            <div className={groupCls}>{t.chat.dockAgentsDone}</div>
            {finished.map((a) => (
              <AgentRow key={a.id} agent={a} />
            ))}
          </>
        )}
      </div>
    </DockBlock>
  );
}

/* ── Espectador do subagente ─────────────────────────────────────────── */

/**
 * SpectatorOverlay — a LIVE, read-only window onto a delegated subagent's own
 * session (Onda D2.1), on the gateway's NATIVE watch contract:
 *
 *   session.resume { session_id: <child>, lazy: true } attaches a spectator
 *   WITHOUT building an agent (server.py:5486 — the lazy/watch branch) and
 *   WITHOUT touching the parent session: the watch record is a NEW live sid
 *   keyed by the child's stored id, bound to THIS component's own WebSocket
 *   (its own transport — the parent chat keeps its connection untouched; the
 *   naive non-lazy resume is the transport hijack, server.py:5878-5879).
 *   The child runs inside the parent's turn; the gateway's child-session live
 *   mirror (server.py:3659) translates the relayed subagent.* events into the
 *   native stream on the watch sid: message.start/delta, reasoning.delta,
 *   tool.start/complete, message.complete — exactly what this reducer handles.
 *
 * Read-only by design: no prompt is ever submitted, so the watch session never
 * upgrades to a full agent (an upgrade would stop the mirror). Detach is
 * clean twice over: session.close on unmount plus close_on_disconnect on the
 * resume (server.py:725 reaps the watch record the moment the socket drops).
 */
function SpectatorOverlay({
  agent,
  onClose,
}: {
  agent: SubagentInfo;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const childId = agent.childSessionId ?? "";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(agent.status === "running");
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const gw = new GatewayClient();
    let watchSid: string | null = null;
    let streamingId: string | null = null;
    const accepts = (ev: GatewayEvent) => !ev.session_id || ev.session_id === watchSid;

    // The mirror's one-time message.start can slip in before the resume
    // response settles watchSid (both frames ride this socket but come from
    // different server threads) — so every stream handler lazily opens the
    // turn instead of depending on having seen the start event.
    let turnSeq = 0;
    const ensureTurn = (): string => {
      if (streamingId) return streamingId;
      const id = `watch-${++turnSeq}`;
      streamingId = id;
      setRunning(true);
      setMessages((prev) => [
        ...prev,
        { id, role: "assistant", content: "", toolCalls: [], blocks: [], streaming: true },
      ]);
      return id;
    };
    const offStart = gw.on("message.start", (ev) => {
      if (!accepts(ev)) return;
      ensureTurn();
    });
    const offDelta = gw.on<{ text?: string }>("message.delta", (ev) => {
      if (!accepts(ev)) return;
      const chunk = ev.payload?.text;
      if (!chunk) return;
      const id = ensureTurn();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, content: (m.content ?? "") + chunk, blocks: appendText(m.blocks ?? [], chunk) }
            : m,
        ),
      );
    });
    const offReasoning = gw.on<{ text?: string }>("reasoning.delta", (ev) => {
      if (!accepts(ev)) return;
      const chunk = ev.payload?.text;
      if (!chunk) return;
      const id = ensureTurn();
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, reasoning: (m.reasoning ?? "") + chunk } : m)),
      );
    });
    const offToolStart = gw.on<{ tool_id: string; name?: string; preview?: string; context?: string }>(
      "tool.start",
      (ev) => {
        if (!accepts(ev)) return;
        const p = ev.payload;
        if (!p) return;
        const id = ensureTurn();
        const call: ToolCallState = {
          id: p.tool_id,
          name: p.name ?? "tool",
          argsPreview: p.preview ?? p.context,
          status: "running",
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, toolCalls: [...m.toolCalls, call], blocks: pushTool(m.blocks ?? [], call) }
              : m,
          ),
        );
      },
    );
    const offToolComplete = gw.on<{ tool_id: string }>("tool.complete", (ev) => {
      if (!accepts(ev)) return;
      const id = streamingId;
      const p = ev.payload;
      if (!id || !p) return;
      const patch: Partial<ToolCallState> = { status: "done" };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                toolCalls: m.toolCalls.map((tc) => (tc.id === p.tool_id ? { ...tc, ...patch } : tc)),
                blocks: patchTool(m.blocks ?? [], p.tool_id, patch),
              }
            : m,
        ),
      );
    });
    const offComplete = gw.on<{ text?: string }>("message.complete", (ev) => {
      if (!accepts(ev)) return;
      const id = streamingId;
      const summary = ev.payload?.text;
      streamingId = null;
      setRunning(false);
      if (!id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                streaming: false,
                // The mirror closes with the run's summary — surface it when
                // the child streamed no reply text of its own.
                content: m.content?.trim() ? m.content : (summary ?? m.content),
              }
            : m,
        ),
      );
    });

    void (async () => {
      try {
        await gw.connect();
        if (cancelled) return;
        // History via REST (same seam the chat uses; tolerate the fresh-child
        // 404 race — server.py:5416 — the live mirror streams the turn anyway)
        // + the NATIVE lazy watch resume on our own connection.
        const [history, resumed] = await Promise.all([
          api.getSessionMessages(childId).catch(() => null),
          gw.request<{ session_id: string; running?: boolean }>("session.resume", {
            session_id: childId,
            lazy: true,
            close_on_disconnect: true,
            source: "web",
          }),
        ]);
        if (cancelled) return;
        watchSid = resumed.session_id;
        if (history) setMessages(stitchHistory(history.messages));
        setRunning(!!resumed.running);
      } catch {
        /* child not resumable — the overlay stays empty and closable */
      } finally {
        if (!cancelled) setConnecting(false);
      }
    })();

    return () => {
      cancelled = true;
      offStart();
      offDelta();
      offReasoning();
      offToolStart();
      offToolComplete();
      offComplete();
      // Explicit detach (idempotent server-side); close_on_disconnect is the
      // belt-and-braces when the frame never lands.
      if (watchSid) void gw.request("session.close", { session_id: watchSid }).catch(() => {});
      gw.close();
    };
  }, [childId]);

  // Same turn grouping as the chat: consecutive assistant messages = one turn.
  const turns = useMemo(() => {
    type Turn = { key: string; kind: "assistant" | "other"; messages: ChatMessage[]; isLast: boolean };
    const out: Turn[] = [];
    for (const m of messages) {
      const last = out[out.length - 1];
      if (m.role === "assistant") {
        if (last && last.kind === "assistant") last.messages.push(m);
        else out.push({ key: m.id, kind: "assistant", messages: [m], isLast: false });
      } else {
        out.push({ key: m.id, kind: "other", messages: [m], isLast: false });
      }
    }
    if (out.length) out[out.length - 1].isLast = true;
    return out;
  }, [messages]);

  // Stick to the bottom while the child streams, unless the user scrolled up.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
        <PixelAvatar seed={agent.id} />
        {running ? (
          <span className="relative grid h-3 w-3 shrink-0 place-items-center">
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-live/40" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
          </span>
        ) : (
          <Check className="h-3 w-3 shrink-0 text-success" />
        )}
        <span className="min-w-0 flex-1 truncate type-caption font-medium text-foreground" title={agent.label}>
          {agent.label}
        </span>
        <BlockAction title={t.common.close} onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </BlockAction>
      </div>
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {connecting && messages.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-5 px-3 py-4">
            {turns.map((turn) =>
              turn.kind === "assistant" ? (
                <AssistantTurn
                  key={turn.key}
                  messages={turn.messages}
                  isLast={turn.isLast}
                  busy={running}
                  detailMode="expanded"
                />
              ) : (
                <MessageBubble key={turn.key} msg={turn.messages[0]} variant="chat" />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Resultados ──────────────────────────────────────────────────────── */

/** Turn-end summary — exists only between message.complete and the next
 *  prompt. Every row maps to data the protocol REALLY delivered: the
 *  review.summary text, the client-clocked duration, the _get_usage tokens
 *  (session-cumulative, same as the header panel; no cost in the payload),
 *  finished subagents and Saídas counts linking to their blocks. */
function ResultsBlock({
  open,
  onToggle,
  result,
  agentsDone,
  outputsCount,
  onOpenAgents,
  onOpenOutputs,
}: {
  open: boolean;
  onToggle: () => void;
  result: TurnResult;
  agentsDone: number;
  outputsCount: number;
  onOpenAgents: () => void;
  onOpenOutputs: () => void;
}) {
  const { t } = useI18n();
  const rowCls = "flex w-full items-center gap-2 px-1 py-0.5 type-caption";
  const linkCls =
    "flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left type-caption transition-colors hover:bg-muted/60";
  return (
    <DockBlock
      Icon={CheckCircle2}
      label={t.chat.dockResults}
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-1 px-2 pb-2.5">
        {result.review && (
          <p className="whitespace-pre-wrap px-1 pb-1 type-caption leading-relaxed text-foreground/90">
            {result.review}
          </p>
        )}
        {result.durationS != null && (
          <div className={rowCls}>
            <Clock className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {t.chat.workedTime}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">
              {fmtClock(result.durationS)}
            </span>
          </div>
        )}
        {result.usage && (result.usage.input != null || result.usage.output != null) && (
          <div className={rowCls}>
            <Zap className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {`${t.chat.tokensIn} / ${t.chat.tokensOut}`}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">
              {`${fmtTokens(result.usage.input)} / ${fmtTokens(result.usage.output)}`}
            </span>
          </div>
        )}
        {agentsDone > 0 && (
          <button type="button" className={linkCls} onClick={onOpenAgents}>
            <Users className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {t.chat.envAgents}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">{agentsDone}</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-text-tertiary" />
          </button>
        )}
        {outputsCount > 0 && (
          <button type="button" className={linkCls} onClick={onOpenOutputs}>
            <FileText className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {t.chat.dockOutputs}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">{outputsCount}</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-text-tertiary" />
          </button>
        )}
      </div>
    </DockBlock>
  );
}

/* ── Fontes ──────────────────────────────────────────────────────────── */

// Curated "popular" apps for the connect submenu — the same set the Plugins
// hub carousel promotes (matched by catalog NAME, like UseCaseCarousel).
const POPULAR_APPS = ["gmail", "google calendar", "slack", "notion", "github", "google sheets"];

function SourcesBlock({
  open,
  onToggle,
  sources,
  usedApps,
  onAttachFiles,
  onSendPrompt,
}: {
  open: boolean;
  onToggle: () => void;
  sources: DockSource[];
  usedApps: string[];
  onAttachFiles: (files: File[]) => void;
  onSendPrompt: (text: string) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [menu, setMenu] = useState<null | "root" | "apps">(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  useMenuDismiss(menu !== null, closeMenu, "dock-sources");

  // Catalog (module-level cache shared with ConnectLinkCard) — lazy: only when
  // an app identity must render (used apps) or the connect submenu opens.
  const [catalog, setCatalog] = useState<ConnectorToolkit[] | null>(null);
  useEffect(() => {
    if (catalog || (usedApps.length === 0 && menu !== "apps")) return;
    void loadCatalog().then(setCatalog);
  }, [catalog, usedApps.length, menu]);

  // Connected accounts of the tenant — fetched when the submenu opens.
  const [connected, setConnected] = useState<string[] | null>(null);
  useEffect(() => {
    if (menu !== "apps" || connected !== null) return;
    void api
      .getConnectorsStatus("global")
      .then((r) =>
        setConnected([
          ...new Set(
            r.accounts
              .filter((a) => a.status === "ACTIVE")
              .map((a) => (a.toolkit || "").toLowerCase()),
          ),
        ]),
      )
      .catch(() => setConnected([]));
  }, [menu, connected]);

  const bySlug = useMemo(
    () => new Map((catalog ?? []).map((tk) => [tk.slug.toLowerCase(), tk])),
    [catalog],
  );
  const byName = useMemo(
    () => new Map((catalog ?? []).map((tk) => [tk.name.toLowerCase(), tk])),
    [catalog],
  );
  const connectedTks = useMemo(
    () =>
      (connected ?? [])
        .map((slug) => bySlug.get(slug))
        .filter((tk): tk is ConnectorToolkit => Boolean(tk)),
    [connected, bySlug],
  );
  const popularTks = useMemo(() => {
    const conn = new Set(connected ?? []);
    return POPULAR_APPS.map((n) => byName.get(n)).filter(
      (tk): tk is ConnectorToolkit => Boolean(tk) && !conn.has(tk!.slug.toLowerCase()),
    );
  }, [byName, connected]);

  const menuItemCls =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left type-ui text-foreground transition-colors hover:bg-muted";

  const rowCls = "flex items-center gap-2 px-3 py-1 type-caption text-foreground";

  return (
    <DockBlock
      Icon={Paperclip}
      label={t.chat.envSources}
      count={sources.length + usedApps.length}
      open={open}
      onToggle={onToggle}
      action={
        <BlockAction
          title={t.chat.dockAddSource}
          menuKey="dock-sources"
          onClick={() => setMenu((m) => (m ? null : "root"))}
        >
          <Plus className="h-3.5 w-3.5" />
        </BlockAction>
      }
      overlay={
        <>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) onAttachFiles(Array.from(e.target.files));
              e.target.value = "";
              setMenu(null);
            }}
          />
          {menu && (
            <div
              data-menu-root="dock-sources"
              className="absolute right-2 top-9 z-30 w-60 rounded-xl border border-border bg-card p-1.5 shadow-pop"
            >
              {menu === "root" ? (
                <>
                  <button
                    type="button"
                    className={menuItemCls}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Paperclip className="h-4 w-4 shrink-0 opacity-80" />
                    {t.chat.dockAttachFiles}
                  </button>
                  <button type="button" className={menuItemCls} onClick={() => setMenu("apps")}>
                    <Plug className="h-4 w-4 shrink-0 opacity-80" />
                    <span className="min-w-0 flex-1 truncate">{t.chat.dockConnectApps}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                  </button>
                </>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {catalog === null || connected === null ? (
                    <Loader2 className="m-2 h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      {connectedTks.map((tk) => (
                        <div
                          key={tk.slug}
                          className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 type-ui text-foreground"
                        >
                          <LogoTile toolkit={tk} className="h-6 w-6 rounded-md p-0.5" />
                          <span className="min-w-0 flex-1 truncate">{tk.name}</span>
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-live" />
                        </div>
                      ))}
                      {popularTks.map((tk) => (
                        <button
                          key={tk.slug}
                          type="button"
                          className={menuItemCls}
                          onClick={() => {
                            onSendPrompt(t.chat.connectAppPrompt.replace("{app}", tk.name));
                            setMenu(null);
                          }}
                        >
                          <LogoTile toolkit={tk} className="h-6 w-6 rounded-md p-0.5" />
                          <span className="min-w-0 flex-1 truncate">{tk.name}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        className="mt-0.5 flex w-full items-center gap-1.5 rounded-lg border-t border-border/70 px-2.5 py-1.5 text-left type-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onClick={() => {
                          setMenu(null);
                          navigate("/plugins");
                        }}
                      >
                        {t.chat.viewAll}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      }
    >
      {(sources.length > 0 || usedApps.length > 0) && (
        <div className="space-y-0.5 pb-2">
          {usedApps.map((slug) => {
            const generic = slug === GENERIC_APP_SLUG;
            const tk = generic ? null : (bySlug.get(slug) ?? null);
            return (
              <div key={slug} className={rowCls}>
                {tk ? (
                  <LogoTile toolkit={tk} className="h-5 w-5 rounded-md p-0.5" />
                ) : (
                  <Plug className="h-4 w-4 shrink-0 text-text-tertiary" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {generic ? t.chat.dockSourceApp : (tk?.name ?? slug)}
                </span>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-live" />
              </div>
            );
          })}
          {sources.map((s, i) => (
            <div key={`${s.name}-${i}`} className={rowCls}>
              {s.kind === "web" ? (
                <Globe className="h-4 w-4 shrink-0 text-text-tertiary" />
              ) : s.kind === "image" ? (
                <ImageIcon className="h-4 w-4 shrink-0 text-text-tertiary" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-text-tertiary" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {s.kind === "web" ? t.chat.dockSourceWeb : s.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </DockBlock>
  );
}

/* ── Saídas ──────────────────────────────────────────────────────────── */

/** Files the agent produced this task, plus the "+" creation shortcuts
 *  (Codex benchmark): document / presentation / spreadsheet / website. Each
 *  item SEEDS the composer with a localized sentence start and focuses it —
 *  the "+" is a start shortcut, never a blind send. The empty-state hint
 *  opens the same menu. */
function OutputsBlock({
  open,
  onToggle,
  outputs,
  onSeedComposer,
}: {
  open: boolean;
  onToggle: () => void;
  outputs: FileRef[];
  onSeedComposer: (text: string) => void;
}) {
  const { t } = useI18n();
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  useMenuDismiss(menu, closeMenu, "dock-outputs");

  const items: Array<{ Icon: typeof FileText; label: string; seed: string }> = [
    { Icon: FileText, label: t.chat.dockCreateDoc, seed: t.chat.dockSeedDoc },
    { Icon: Presentation, label: t.chat.dockCreateSlides, seed: t.chat.dockSeedSlides },
    { Icon: Table, label: t.chat.dockCreateSheet, seed: t.chat.dockSeedSheet },
    { Icon: Globe, label: t.chat.dockCreateSite, seed: t.chat.dockSeedSite },
  ];

  const menuItemCls =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left type-ui text-foreground transition-colors hover:bg-muted";

  return (
    <DockBlock
      Icon={FileText}
      label={t.chat.dockOutputs}
      count={outputs.length}
      open={open}
      onToggle={onToggle}
      action={
        <BlockAction
          title={t.chat.dockCreateOutput}
          menuKey="dock-outputs"
          onClick={() => setMenu((m) => !m)}
        >
          <Plus className="h-3.5 w-3.5" />
        </BlockAction>
      }
      overlay={
        menu && (
          <div
            data-menu-root="dock-outputs"
            className="absolute right-2 top-9 z-30 w-60 rounded-xl border border-border bg-card p-1.5 shadow-pop"
          >
            {items.map(({ Icon, label, seed }) => (
              <button
                key={label}
                type="button"
                className={menuItemCls}
                onClick={() => {
                  onSeedComposer(seed);
                  setMenu(false);
                }}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                {label}
              </button>
            ))}
          </div>
        )
      }
    >
      {outputs.length === 0 ? (
        <button
          type="button"
          data-menu-trigger="dock-outputs"
          onClick={() => setMenu((m) => !m)}
          className="block w-full px-3 pb-3 pt-0.5 text-left type-caption text-text-tertiary transition-colors hover:text-muted-foreground"
        >
          {t.chat.dockOutputsHint}
        </button>
      ) : (
        <div className="space-y-1.5 px-2.5 pb-2.5">
          {outputs.map((f) => (
            <FileRefCard key={f.path ?? f.url ?? f.name} file={f} />
          ))}
        </div>
      )}
    </DockBlock>
  );
}

/* ── Preview ─────────────────────────────────────────────────────────── */

const PREVIEWABLE_RE = /\.(html?|svg|png|jpe?g|gif|webp|pdf)$/i;

function PreviewTab({
  path,
  onOpenCode,
}: {
  path: string | null;
  onOpenCode: (p: string) => void;
}) {
  const { t } = useI18n();
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void readDataUrlSmart(path)
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  // Desktop shell 0.2.2+ exposes openExternal; older shells/web don't — the
  // button only renders when the bridge exists AND the file is on the user's
  // machine (a cloud path has nothing the OS browser could open).
  const openExternal = desktopOpenExternal();
  const localPath = path ? normalizeLocalPath(path) : null;
  // Real mime now rides in the data_url (local b64 reads); branch the body on
  // it so images/PDF render natively instead of being crammed into the HTML
  // iframe.
  const mime = dataUrl?.startsWith("data:") ? dataUrl.slice(5).split(/[;,]/, 1)[0] : "";
  const fileName = path ? path.split(/[/\\]/).pop() || "file" : "file";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Preview browser bar (Manus benchmark: home · path · open outside ·
          refresh + desktop/mobile). */}
      <div className="flex items-center gap-1 border-b border-border/70 px-2 py-1.5">
        <Home className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
        <span
          className="min-w-0 flex-1 truncate rounded-md bg-muted/50 px-2 py-1 font-mono type-micro text-muted-foreground"
          title={path ?? "/"}
        >
          {path ? `/${path.split(/[/\\]/).slice(-2).join("/")}` : "/"}
        </span>
        <button
          type="button"
          onClick={() => setDevice((d) => (d === "desktop" ? "mobile" : "desktop"))}
          title={device === "desktop" ? t.chat.previewMobile : t.chat.previewDesktop}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {device === "desktop" ? (
            <Smartphone className="h-3.5 w-3.5" />
          ) : (
            <MonitorSmartphone className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          disabled={!path}
          title={t.common.refresh}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button
          type="button"
          onClick={() => path && onOpenCode(path)}
          disabled={!path}
          title={t.chat.dockCode}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <Code2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!dataUrl) return;
            const win = window.open("about:blank", "_blank");
            if (win) win.location.href = dataUrl;
          }}
          disabled={!dataUrl}
          title={t.chat.openNewTab}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
        </button>
        {openExternal && localPath && (
          <button
            type="button"
            onClick={() => void openExternal(localPath)}
            title={t.chat.openInBrowser}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Globe className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-2">
        {!path ? (
          <p className="px-3 py-6 text-center type-caption text-text-tertiary">
            {t.chat.previewEmptyHint}
          </p>
        ) : loading && !dataUrl ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : dataUrl ? (
          <div
            className={`mx-auto h-full overflow-hidden rounded-lg border border-border bg-white shadow-card transition-all ${
              device === "mobile" ? "w-[375px] max-w-full" : "w-full"
            }`}
          >
            {mime.startsWith("image/") ? (
              <div className="grid h-full w-full place-items-center overflow-auto p-2">
                <img
                  src={dataUrl}
                  alt={fileName}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : mime === "application/pdf" ? (
              // <object> renders Chromium's PDF viewer for data: URLs; when the
              // embedder refuses (sandboxed/embedded contexts), the CHILDREN
              // show instead — a clean download/open panel, never a spinner.
              <object
                key={`${path}-${nonce}`}
                data={dataUrl}
                type="application/pdf"
                aria-label={fileName}
                className="h-full w-full"
              >
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4">
                  <a
                    href={dataUrl}
                    download={fileName}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 type-ui font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t.chat.downloadFile}
                  </a>
                  {openExternal && localPath && (
                    <button
                      type="button"
                      onClick={() => void openExternal(localPath)}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 type-ui font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {t.chat.openInBrowser}
                    </button>
                  )}
                </div>
              </object>
            ) : (
              <iframe
                key={`${path}-${device}-${nonce}`}
                src={dataUrl}
                title={path}
                sandbox="allow-scripts"
                className="h-full w-full"
              />
            )}
          </div>
        ) : (
          <p className="px-3 py-6 text-center type-caption text-destructive/80">
            {t.status.error}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Code ────────────────────────────────────────────────────────────── */

function CodeTab({ path }: { path: string | null }) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setText(null);
    if (!path) return;
    let cancelled = false;
    void readTextSmart(path).then((s) => {
      if (!cancelled) setText(s ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path)
    return (
      <p className="px-3.5 py-6 text-center type-caption text-text-tertiary">
        {t.chat.previewEmptyHint}
      </p>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-1.5">
        <FileText className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
        <span className="min-w-0 flex-1 truncate font-mono type-micro text-muted-foreground">
          {path}
        </span>
        <button
          type="button"
          title={t.chat.copy}
          onClick={() => {
            if (text == null) return;
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {text === null ? (
          <Loader2 className="m-3 h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-mono type-caption leading-relaxed text-foreground/90">
            {text || "—"}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ── Files ───────────────────────────────────────────────────────────── */

function FilesTab({ onOpen }: { onOpen: (path: string, kind: "preview" | "code") => void }) {
  const { t } = useI18n();
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<ManagedFileEntry[]>([]);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .listFiles(path)
      .then((res) => {
        if (cancelled) return;
        const sorted = [...(res.entries ?? [])].sort((a, b) =>
          a.is_directory === b.is_directory
            ? a.name.localeCompare(b.name)
            : a.is_directory
              ? -1
              : 1,
        );
        setEntries(sorted);
      })
      .catch(() => setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [path]);

  const download = useCallback(async (entry: ManagedFileEntry) => {
    setBusyFile(entry.path);
    try {
      const res = await api.readFile(entry.path);
      const a = document.createElement("a");
      a.href = res.data_url;
      a.download = res.name || entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* transient */
    } finally {
      setBusyFile(null);
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/70 px-3 py-2 type-caption text-muted-foreground">
        <button
          type="button"
          onClick={() => setPath("")}
          className="rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" />
        </button>
        {path &&
          path.split("/").map((seg, i, all) => (
            <span key={i} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="h-3 w-3 shrink-0 text-text-tertiary" />
              <button
                type="button"
                onClick={() => setPath(all.slice(0, i + 1).join("/"))}
                className="max-w-[9rem] truncate rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
              >
                {seg}
              </button>
            </span>
          ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {path && (
          <button
            type="button"
            onClick={() => setPath(path.split("/").slice(0, -1).join("/"))}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left type-ui text-muted-foreground transition-colors hover:bg-muted/60"
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            ..
          </button>
        )}
        {entries.map((e) =>
          e.is_directory ? (
            <button
              key={e.path}
              type="button"
              onClick={() => setPath(e.path)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left type-ui text-foreground transition-colors hover:bg-muted/60"
            >
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
            </button>
          ) : (
            <div
              key={e.path}
              className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 type-ui text-foreground transition-colors hover:bg-muted/60"
            >
              <button
                type="button"
                onClick={() =>
                  onOpen(e.path, PREVIEWABLE_RE.test(e.name) ? "preview" : "code")
                }
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title={e.name}
              >
                <FileText className="h-4 w-4 shrink-0 text-text-tertiary" />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
              </button>
              <button
                type="button"
                title={t.chat.copyId}
                onClick={() => {
                  void navigator.clipboard.writeText(e.path).then(() => {
                    setCopied(e.path);
                    setTimeout(() => setCopied(null), 1200);
                  });
                }}
                className="shrink-0 rounded p-1 text-muted-foreground/0 transition-colors hover:bg-muted hover:text-foreground group-hover:text-text-tertiary"
              >
                {copied === e.path ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                title={t.chat.downloadFile}
                onClick={() => void download(e)}
                disabled={busyFile === e.path}
                className="shrink-0 rounded p-1 text-muted-foreground/0 transition-colors hover:bg-muted hover:text-foreground group-hover:text-text-tertiary"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          ),
        )}
        {entries.length === 0 && (
          <div className="px-2.5 py-4 type-caption text-text-tertiary">
            {t.common.noResults}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Changes (real git + fallback) ───────────────────────────────────── */

function ChangesTab({
  cwd,
  changes,
  busy,
  refreshTick,
  onRepoCount,
}: {
  cwd: string | null;
  changes: DockChange[];
  busy: boolean;
  refreshTick: number;
  /** Reports how many files the REAL repo has pending — the parent uses it to
   *  decide whether the Alterações block is visible at all (reactive dock). */
  onRepoCount?: (n: number) => void;
}) {
  const { t } = useI18n();
  const [repo, setRepo] = useState<GitRepoStatus | null | undefined>(undefined);
  const [openDiff, setOpenDiff] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [ship, setShip] = useState<{ ghReady: boolean; pr: { url: string } | null } | null>(null);
  const [mutating, setMutating] = useState(false);
  // Branch picker (git phase 2) + per-file revert, both with a two-tap
  // confirmation.
  const [branchMenu, setBranchMenu] = useState(false);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [armedBranch, setArmedBranch] = useState<string | null>(null);
  const [armedRevert, setArmedRevert] = useState<string | null>(null);
  useMenuDismiss(branchMenu, () => { setBranchMenu(false); setArmedBranch(null); }, "branch");
  useEffect(() => {
    if (!armedRevert) return;
    const timer = setTimeout(() => setArmedRevert(null), 5000);
    return () => clearTimeout(timer);
  }, [armedRevert]);

  const reload = useCallback(() => {
    if (!cwd) {
      setRepo(null);
      onRepoCount?.(0);
      return;
    }
    // GUARD (found 09/07): `git status` walks up to the PARENT repo — a cwd with
    // no repo inside a versioned /opt/data would show the root repo (with dbs and
    // credentials). Only turn git mode on if the `.git` lives IN the cwd itself.
    void api
      .listFiles(cwd)
      .then((res) => {
        const hasGit = (res.entries ?? []).some((e) => e.is_directory && e.name === ".git");
        if (!hasGit) {
          setRepo(null);
          onRepoCount?.(0);
          return;
        }
        void api
          .gitStatus(cwd)
          .then((s) => {
            setRepo(s);
            onRepoCount?.(s ? s.files.length + (s.ahead > 0 ? 1 : 0) : 0);
            if (s) void api.gitShipInfo(cwd).then(setShip).catch(() => setShip(null));
          })
          .catch(() => {
            setRepo(null);
            onRepoCount?.(0);
          });
      })
      .catch(() => {
        setRepo(null);
        onRepoCount?.(0);
      });
  }, [cwd, onRepoCount]);
  useEffect(() => reload(), [reload, refreshTick]);

  useEffect(() => {
    setDiffText(null);
    if (!cwd || !openDiff || !repo) return;
    const f = repo.files.find((x) => x.path === openDiff);
    let cancelled = false;
    void api
      .gitReviewDiff(cwd, openDiff, !!f?.staged && !f?.untracked ? f.staged : false)
      .then((r) => {
        if (!cancelled) setDiffText(r.diff || "");
      })
      .catch(() => {
        if (!cancelled) setDiffText("");
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, openDiff, repo]);

  const toggleStage = useCallback(
    async (f: GitReviewFile) => {
      if (!cwd) return;
      setMutating(true);
      try {
        if (f.staged) await api.gitUnstage(cwd, f.path);
        else await api.gitStage(cwd, f.path);
        reload();
      } finally {
        setMutating(false);
      }
    },
    [cwd, reload],
  );

  const commit = useCallback(
    async (push: boolean) => {
      if (!cwd) return;
      setMutating(true);
      try {
        const message =
          msg.trim() || `Work4You — ${new Date().toLocaleString()}`;
        await api.gitCommit(cwd, message, push);
        setMsg("");
        reload();
      } finally {
        setMutating(false);
      }
    },
    [cwd, msg, reload],
  );

  // ── No repo (or no project): fallback = the tools' diffs ────────────
  if (repo === null || repo === undefined) {
    return (
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {cwd && repo === null && (
          <p className="px-2 py-1 type-micro text-text-tertiary">{t.chat.gitNoRepo}</p>
        )}
        {changes.length === 0 && (
          <div className="px-2.5 py-4 type-caption text-text-tertiary">
            {t.common.noResults}
          </div>
        )}
        {[...changes].reverse().map((c) => (
          <div key={c.path} className="min-w-0">
            <button
              type="button"
              onClick={() => setOpenDiff((o) => (o === c.path ? null : c.path))}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left type-ui text-foreground transition-colors hover:bg-muted/60"
            >
              <FileDiff className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono type-caption">
                {c.path.split(/[/\\]/).pop()}
              </span>
            </button>
            {openDiff === c.path && (
              <div className="mt-1 px-1">
                <DiffView diff={c.diff} />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── A real git repo (Codex "Commit or push" benchmark) ──────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex items-center gap-2 border-b border-border/70 px-3 py-2">
        {/* Current branch — clicking opens the picker (switch with confirmation;
            NEVER with a turn running). */}
        <button
          type="button"
          disabled={busy || mutating}
          data-menu-trigger="branch"
          title={t.chat.gitSwitchBranch}
          onClick={() => {
            setBranchMenu((v) => !v);
            if (!branchMenu && cwd) {
              setArmedBranch(null);
              void api
                .gitBranches(cwd)
                .then((r) =>
                  setBranches(
                    (r.branches ?? []).map((b) =>
                      typeof b === "string" ? b : (b.name ?? ""),
                    ).filter(Boolean),
                  ),
                )
                .catch(() => setBranches([]));
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
        >
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono type-caption text-foreground">
            {repo.branch ?? "—"}
          </span>
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-text-tertiary transition-transform ${branchMenu ? "rotate-90" : ""}`}
          />
        </button>
        {(repo.ahead > 0 || repo.behind > 0) && (
          <span className="shrink-0 type-micro tabular-nums text-muted-foreground">
            ↑{repo.ahead} ↓{repo.behind}
          </span>
        )}
        <span className="shrink-0 type-caption tabular-nums">
          <span className="font-medium text-success">+{repo.added}</span>{" "}
          <span className="font-medium text-destructive">−{repo.removed}</span>
        </span>
        {branchMenu && (
          <div data-menu-root="branch" className="absolute left-2 top-full z-30 mt-1 max-h-56 w-[calc(100%-16px)] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-pop">
            {branches === null ? (
              <Loader2 className="m-2 h-4 w-4 animate-spin text-muted-foreground" />
            ) : branches.length === 0 ? (
              <p className="px-2.5 py-2 type-caption text-text-tertiary">
                {t.common.noResults}
              </p>
            ) : (
              branches.map((b) => {
                const current = b === repo.branch;
                const armed = armedBranch === b;
                return (
                  <button
                    key={b}
                    type="button"
                    disabled={current || mutating}
                    onClick={() => {
                      if (!armed) {
                        setArmedBranch(b);
                        return;
                      }
                      if (!cwd) return;
                      setMutating(true);
                      void api
                        .gitBranchSwitch(cwd, b)
                        .then(() => {
                          setBranchMenu(false);
                          setArmedBranch(null);
                          reload();
                        })
                        .finally(() => setMutating(false));
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono type-caption transition-colors ${
                      current
                        ? "text-text-tertiary"
                        : armed
                          ? "bg-warning/15 text-warning"
                          : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{b}</span>
                    {current && <Check className="h-3 w-3 shrink-0" />}
                    {armed && (
                      <span className="shrink-0 font-sans type-micro">{t.chat.gitConfirm}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {repo.files.length === 0 && (
          <div className="px-2.5 py-4 type-caption text-text-tertiary">
            {t.common.noResults}
          </div>
        )}
        {repo.files.map((f) => (
          <div key={f.path} className="min-w-0">
            <div className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 type-ui transition-colors hover:bg-muted/60">
              <input
                type="checkbox"
                checked={f.staged}
                disabled={mutating}
                onChange={() => void toggleStage(f)}
                className="h-3.5 w-3.5 shrink-0 accent-[var(--live)]"
                title={f.staged ? "staged" : "unstaged"}
              />
              <button
                type="button"
                onClick={() => setOpenDiff((o) => (o === f.path ? null : f.path))}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="w-4 shrink-0 text-center font-mono type-micro text-muted-foreground">
                  {f.status}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono type-caption text-foreground">
                  {f.path}
                </span>
                <span className="shrink-0 type-micro tabular-nums">
                  <span className="text-success">+{f.added}</span>{" "}
                  <span className="text-destructive">−{f.removed}</span>
                </span>
              </button>
              {/* Revert the file — 2 taps (genuinely destructive). */}
              <button
                type="button"
                disabled={mutating}
                title={armedRevert === f.path ? t.chat.gitConfirm : t.chat.gitRevert}
                onClick={() => {
                  if (armedRevert !== f.path) {
                    setArmedRevert(f.path);
                    return;
                  }
                  if (!cwd) return;
                  setArmedRevert(null);
                  setMutating(true);
                  void api
                    .gitRevert(cwd, f.path)
                    .then(() => reload())
                    .finally(() => setMutating(false));
                }}
                className={`shrink-0 rounded p-1 transition-colors ${
                  armedRevert === f.path
                    ? "bg-warning/15 text-warning"
                    : "text-muted-foreground/0 hover:bg-muted hover:text-destructive group-hover:text-text-tertiary"
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
            {openDiff === f.path && (
              <div className="mb-1 mt-0.5 px-1">
                {diffText === null ? (
                  <Loader2 className="m-2 h-4 w-4 animate-spin text-muted-foreground" />
                ) : diffText ? (
                  <DiffView diff={diffText} />
                ) : (
                  <p className="px-2 py-1 type-micro text-text-tertiary">—</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ship bar — commit/push/PR with double confirmation; NEVER during a turn. */}
      <div className="space-y-2 border-t border-border px-3 py-2.5">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder={t.chat.gitMsgPlaceholder}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 type-ui text-foreground outline-none placeholder:text-text-tertiary focus:border-foreground/30"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <ArmedButton
            label={t.chat.gitCommit}
            confirmLabel={t.chat.gitConfirm}
            disabled={busy || mutating || repo.changed === 0}
            onFire={() => void commit(false)}
          />
          <ArmedButton
            label={t.chat.gitCommitPush}
            confirmLabel={t.chat.gitConfirm}
            primary
            disabled={busy || mutating || (repo.changed === 0 && repo.ahead === 0)}
            onFire={() => void commit(true)}
          />
          {ship?.pr?.url ? (
            <a
              href={ship.pr.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto flex items-center gap-1 type-ui text-live-ink transition-opacity hover:opacity-80"
            >
              {t.chat.gitViewPr}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : ship?.ghReady ? (
            <ArmedButton
              label={t.chat.gitCreatePr}
              confirmLabel={t.chat.gitConfirm}
              disabled={busy || mutating}
              onFire={() => {
                if (!cwd) return;
                setMutating(true);
                void api
                  .gitCreatePr(cwd)
                  .then(() => reload())
                  .finally(() => setMutating(false));
              }}
            />
          ) : (
            <span className="ml-auto type-micro text-text-tertiary">
              {t.chat.gitGhMissing}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Project ─────────────────────────────────────────────────────────── */

function ProjectTab({ project, cwd }: { project: string | null; cwd: string | null }) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const path = project ? `projects/${project}/AGENTS.md` : null;

  // The project's scheduled jobs — same criterion as the ProjectWorkspace: jobs
  // whose workdir is the project's folder (or a subfolder of it).
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  useEffect(() => {
    setJobs(null);
    if (!cwd) return;
    let cancelled = false;
    void api
      .getCronJobs("all")
      .then((all) => {
        if (cancelled) return;
        setJobs(all.filter((j) => j.workdir === cwd || j.workdir?.startsWith(`${cwd}/`)));
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  useEffect(() => {
    setText(null);
    if (!path) return;
    let cancelled = false;
    void api
      .readFile(path)
      .then((r) => {
        if (cancelled) return;
        const [, b64] = r.data_url.split(",", 2);
        try {
          setText(new TextDecoder("utf-8").decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
        } catch {
          setText("");
        }
      })
      .catch(() => {
        if (!cancelled) setText("");
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!project)
    return (
      <p className="px-3.5 py-6 text-center type-caption text-text-tertiary">
        {t.chat.projectTasksEmpty}
      </p>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate type-ui font-semibold text-foreground">
          {project}
        </span>
      </div>
      <label className="type-caption font-medium uppercase tracking-[0.05em] text-muted-foreground">
        {t.chat.instructions}
      </label>
      <textarea
        value={text ?? ""}
        disabled={text === null}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.chat.instructionsPlaceholder}
        className="min-h-0 flex-1 resize-none rounded-lg border border-border bg-background p-2.5 font-mono type-caption text-foreground outline-none placeholder:text-text-tertiary focus:border-foreground/30"
      />
      <div className="flex items-center justify-end gap-2">
        {saved && <span className="type-micro text-success">{t.chat.instructionsSaved}</span>}
        <button
          type="button"
          disabled={saving || text === null}
          onClick={() => {
            if (!path || text === null) return;
            setSaving(true);
            void api
              .uploadFile(path, new File([new Blob([text])], "AGENTS.md"), true)
              .then(() => {
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              })
              .finally(() => setSaving(false));
          }}
          className="rounded-lg bg-foreground px-3.5 py-1.5 type-ui font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? t.common.saving : t.common.save}
        </button>
      </div>

      {/* The project's scheduled jobs — quick read; full management in Agenda. */}
      <div className="space-y-1.5 border-t border-border/70 pt-2.5">
        <div className="flex items-center gap-1.5">
          <span className="type-caption font-medium uppercase tracking-[0.05em] text-muted-foreground">
            {t.chat.scheduledTasks}
          </span>
          <a
            href={cwd ? `/cron?workdir=${encodeURIComponent(cwd)}` : "/cron"}
            className="ml-auto flex items-center gap-1 type-micro text-live-ink transition-opacity hover:opacity-80"
          >
            {t.chat.viewAll}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {jobs === null ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-text-tertiary" />
        ) : jobs.length === 0 ? (
          <p className="type-micro text-text-tertiary">{t.chat.projectTasksEmpty}</p>
        ) : (
          jobs.slice(0, 5).map((j, i) => (
            <div key={`${j.name ?? i}`} className="flex items-center gap-2 type-caption">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-live/70" />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {j.name || j.schedule?.display || j.schedule?.expr || "—"}
              </span>
              {(j.schedule?.display ?? j.schedule?.expr) && (
                <span className="shrink-0 font-mono type-micro text-text-tertiary">
                  {j.schedule?.display ?? j.schedule?.expr}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <a
        href={project ? `/chat?project=${encodeURIComponent(project)}&home=1` : "/chat"}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 type-ui font-medium text-foreground transition-colors hover:bg-muted"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        {t.chat.projectOpenWorkspace}
      </a>
    </div>
  );
}

/* ── Dock shell ──────────────────────────────────────────────────────── */

export function RightDock({
  busy,
  steps,
  subagents,
  urls,
  added,
  removed,
  changes,
  cwd,
  project,
  openSignal,
  refreshTick,
  hero = false,
  outputs,
  sources,
  usedApps,
  result,
  onAttachFiles,
  onSendPrompt,
  onSeedComposer,
}: {
  busy: boolean;
  steps: TaskStep[];
  subagents: SubagentInfo[];
  urls: DockUrl[];
  added: number;
  removed: number;
  changes: DockChange[];
  cwd: string | null;
  project: string | null;
  /** The page tells us to reveal a block (e.g. auto-preview of a generated .html). */
  openSignal?: { tab: DockTab; path?: string; nonce: number } | null;
  /** Bumped at the end of every turn → re-queries git. */
  refreshTick: number;
  /** Hero (new task) — only Fontes/Saídas render; the panel exists before the chat. */
  hero?: boolean;
  /** Files the agent produced this task (chat-parsed MEDIA:/@session tokens). */
  outputs: FileRef[];
  /** Task attachments — accumulated by the page, the owner of the attach flow. */
  sources: DockSource[];
  /** Connected-app toolkit slugs the agent used (Composio tool-name prefixes). */
  usedApps: string[];
  /** How the LAST turn ended (useChatSession lastResult) — Resultados block. */
  result: TurnResult | null;
  /** SAME attach flow as the composer (NativeChatPage owns `attached`). */
  onAttachFiles: (files: File[]) => void;
  /** Sends a prompt in the current session (connect-by-chat). */
  onSendPrompt: (text: string) => void;
  /** Seeds the composer with a sentence start and focuses it (Saídas "+"). */
  onSeedComposer: (text: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(PREF_KEY) === "open";
    } catch {
      return false;
    }
  });
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [codePath, setCodePath] = useState<string | null>(null);

  // Per-block collapse. Fontes/Saídas/Alterações/Pré-visualização open by
  // default; Arquivos/Projeto collapsed by default (curation decision D1).
  // D2 blocks (Resultados/Plano/Subagentes) open by default — they only
  // exist while their data exists.
  const [resultsOpen, setResultsOpen] = useState(true);
  const [planOpen, setPlanOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
  // Live spectator onto ONE active subagent at a time (Onda D2.1) — holds the
  // subagent id; the row data stays live via `subagents`. Closes itself when
  // the backing row disappears (new turn / session switch).
  const [spectatorId, setSpectatorId] = useState<string | null>(null);
  const spectatorAgent = spectatorId
    ? subagents.find((s) => s.id === spectatorId) ?? null
    : null;
  useEffect(() => {
    if (spectatorId && !spectatorAgent) setSpectatorId(null);
  }, [spectatorId, spectatorAgent]);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [outputsOpen, setOutputsOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [codeOpen, setCodeOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);

  // The Alterações block only exists when there IS a diff: tool diffs from the
  // turn, or pending files in the REAL repo (reported by ChangesTab's probe).
  const [repoCount, setRepoCount] = useState(0);
  const hasChanges = changes.length > 0 || repoCount > 0;

  // ── Manual width (request 09/07): drag handle on the left edge + an
  //    expand/shrink button (Manus's ⤢). Persisted. ──
  const [width, setWidth] = useState<number>(() => {
    try {
      const w = Number(window.localStorage.getItem(WIDTH_KEY));
      return w >= MIN_W ? clampW(w) : 340;
    } catch {
      return 340;
    }
  });
  const widthRef = useRef(width);
  widthRef.current = width;
  const preExpandRef = useRef<number | null>(null);
  const persistWidth = (w: number) => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(w));
    } catch {
      /* private mode */
    }
  };
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: MouseEvent) => {
      setWidth(clampW(window.innerWidth - ev.clientX));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
      preExpandRef.current = null;
      persistWidth(widthRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
  const expanded = width >= maxW() - 40;
  const toggleExpand = useCallback(() => {
    if (expanded) {
      const back = clampW(preExpandRef.current ?? 340);
      preExpandRef.current = null;
      setWidth(back);
      persistWidth(back);
    } else {
      preExpandRef.current = widthRef.current;
      const wide = maxW();
      setWidth(wide);
      persistWidth(wide);
    }
  }, [expanded]);

  const setOpenPersist = useCallback((v: boolean) => {
    setOpen(v);
    try {
      window.localStorage.setItem(PREF_KEY, v ? "open" : "closed");
    } catch {
      /* private mode */
    }
  }, []);

  const hasEnvContent =
    steps.length > 0 || subagents.length > 0 || urls.length > 0 || outputs.length > 0;

  // Auto-opens the 1st time a turn runs with content (with no saved pref).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!busy || !hasEnvContent || autoOpenedRef.current || open) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(PREF_KEY);
    } catch {
      /* private mode */
    }
    if (stored === null) {
      autoOpenedRef.current = true;
      setOpen(true);
    }
  }, [busy, hasEnvContent, open]);

  // Signal from the page (auto-preview, open project settings…) — reveals the
  // corresponding block instead of switching tabs.
  const lastSignalRef = useRef(0);
  useEffect(() => {
    if (!openSignal || openSignal.nonce === lastSignalRef.current) return;
    lastSignalRef.current = openSignal.nonce;
    switch (openSignal.tab) {
      case "plan":
        setPlanOpen(true);
        break;
      case "preview":
        if (openSignal.path) setPreviewPath(openSignal.path);
        setPreviewOpen(true);
        break;
      case "code":
        if (openSignal.path) setCodePath(openSignal.path);
        setCodeOpen(true);
        break;
      case "project":
        setProjectOpen(true);
        break;
      case "files":
        setFilesOpen(true);
        break;
      case "changes":
        setChangesOpen(true);
        break;
      default:
        break;
    }
    setOpenPersist(true);
  }, [openSignal, setOpenPersist]);

  const openFromFiles = useCallback((p: string, kind: "preview" | "code") => {
    if (kind === "preview") {
      setPreviewPath(p);
      setPreviewOpen(true);
    } else {
      setCodePath(p);
      setCodeOpen(true);
    }
  }, []);

  // Live header bits — the old "pin" summary, now the panel's permanent header.
  const bits: string[] = [];
  if (steps.length > 0)
    bits.push(`${steps.filter((s) => s.status === "completed").length}/${steps.length}`);
  if (subagents.length > 0) bits.push(`${subagents.length} ${t.chat.envAgents.toLowerCase()}`);
  if (added + removed > 0) bits.push(`+${added} −${removed}`);
  const domains = [...new Set(urls.map((u) => u.domain))];
  if (domains.length > 0) bits.push(domains[domains.length - 1]);

  if (!open) {
    // Handle; with activity, a rich "Ambiente · summary" chip.
    const chipBits: string[] = [];
    if (subagents.length > 0)
      chipBits.push(`${subagents.length} ${t.chat.envAgents.toLowerCase()}`);
    if (added + removed > 0) chipBits.push(`+${added} −${removed}`);
    return (
      <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex flex-col items-end justify-start pt-4 max-md:hidden">
        {busy || hasEnvContent ? (
          <button
            type="button"
            onClick={() => setOpenPersist(true)}
            className="pointer-events-auto mr-4 flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 shadow-pop transition-colors hover:border-foreground/25"
            title={t.chat.envTitle}
          >
            {busy ? (
              <span className="relative grid h-3 w-3 place-items-center">
                <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-live/40" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
              </span>
            ) : (
              <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="type-ui font-medium text-foreground">{t.chat.envTitle}</span>
            {chipBits.length > 0 && (
              <span className="type-caption tabular-nums text-muted-foreground">
                {chipBits.join(" · ")}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpenPersist(true)}
            title={t.chat.envTitle}
            aria-label={t.chat.envTitle}
            className="pointer-events-auto mt-[38vh] rounded-l-xl border border-r-0 border-border bg-card px-1 py-3 text-muted-foreground shadow-card transition-colors hover:text-foreground"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <aside
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-card max-lg:hidden"
    >
      {/* Resize handle — drag to widen/narrow. */}
      <div
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-live/40 active:bg-live/60"
      />
      {/* Fixed header — the live Ambiente summary (the old pin) + controls. */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
        {busy ? (
          <span className="relative grid h-3 w-3 shrink-0 place-items-center">
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-live/40" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
          </span>
        ) : (
          <Monitor className="h-3 w-3 shrink-0 text-text-tertiary" />
        )}
        <span className="min-w-0 flex-1 truncate type-caption tabular-nums text-muted-foreground">
          {bits.length > 0 ? bits.join(" · ") : t.chat.envTitle}
        </span>
        <button
          type="button"
          onClick={toggleExpand}
          title={expanded ? t.common.collapse : t.common.expand}
          aria-label={expanded ? t.common.collapse : t.common.expand}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setOpenPersist(false)}
          aria-label={t.common.close}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Reactive block stack. The relative wrapper hosts the subagent
          spectator overlay OUTSIDE the scroll container, so it stays pinned
          while the dock header (resize/expand/close) remains reachable. */}
      <div className="relative min-h-0 flex-1">
      <div className="h-full overflow-y-auto">
        {/* Resultados — only between message.complete and the next prompt. */}
        {result && !busy && (
          <ResultsBlock
            open={resultsOpen}
            onToggle={() => setResultsOpen((v) => !v)}
            result={result}
            agentsDone={subagents.filter((s) => s.status !== "running").length}
            outputsCount={outputs.length}
            onOpenAgents={() => setAgentsOpen(true)}
            onOpenOutputs={() => setOutputsOpen(true)}
          />
        )}

        {/* Plano — only when the task has steps (todo tool). */}
        {steps.length > 0 && (
          <PlanBlock
            open={planOpen}
            onToggle={() => setPlanOpen((v) => !v)}
            steps={steps}
          />
        )}

        {/* Subagentes — only when there was delegation this task. */}
        {subagents.length > 0 && (
          <AgentsBlock
            open={agentsOpen}
            onToggle={() => setAgentsOpen((v) => !v)}
            subagents={subagents}
            onWatch={(a) => setSpectatorId(a.id)}
          />
        )}

        <SourcesBlock
          open={sourcesOpen}
          onToggle={() => setSourcesOpen((v) => !v)}
          sources={sources}
          usedApps={usedApps}
          onAttachFiles={onAttachFiles}
          onSendPrompt={onSendPrompt}
        />

        <OutputsBlock
          open={outputsOpen}
          onToggle={() => setOutputsOpen((v) => !v)}
          outputs={outputs}
          onSeedComposer={onSeedComposer}
        />

        {previewPath && (
          <DockBlock
            Icon={MonitorSmartphone}
            label={t.chat.dockPreview}
            open={previewOpen}
            onToggle={() => setPreviewOpen((v) => !v)}
            action={
              <BlockAction title={t.common.close} onClick={() => setPreviewPath(null)}>
                <X className="h-3.5 w-3.5" />
              </BlockAction>
            }
          >
            <div className="flex h-[360px] flex-col">
              <PreviewTab path={previewPath} onOpenCode={(p) => openFromFiles(p, "code")} />
            </div>
          </DockBlock>
        )}

        {codePath && (
          <DockBlock
            Icon={Code2}
            label={t.chat.dockCode}
            open={codeOpen}
            onToggle={() => setCodeOpen((v) => !v)}
            action={
              <BlockAction title={t.common.close} onClick={() => setCodePath(null)}>
                <X className="h-3.5 w-3.5" />
              </BlockAction>
            }
          >
            <div className="flex max-h-[340px] flex-col">
              <CodeTab path={codePath} />
            </div>
          </DockBlock>
        )}

        {/* keepMounted: the git probe inside ChangesTab must run even while the
            block is hidden — it is what reports repoCount and reveals the block. */}
        {!hero && (
          <DockBlock
            Icon={FileDiff}
            label={t.chat.envChanges}
            count={repoCount || changes.length}
            open={changesOpen}
            onToggle={() => setChangesOpen((v) => !v)}
            hidden={!hasChanges}
            keepMounted
          >
            <div className="flex max-h-[420px] flex-col">
              <ChangesTab
                cwd={cwd}
                changes={changes}
                busy={busy}
                refreshTick={refreshTick}
                onRepoCount={setRepoCount}
              />
            </div>
          </DockBlock>
        )}

        {!hero && (
          <DockBlock
            Icon={Folder}
            label={t.chat.dockProjectFiles}
            open={filesOpen}
            onToggle={() => setFilesOpen((v) => !v)}
          >
            <div className="flex max-h-[320px] flex-col">
              <FilesTab onOpen={openFromFiles} />
            </div>
          </DockBlock>
        )}

        {project && (!hero || projectOpen) && (
          <DockBlock
            Icon={Settings2}
            label={t.chat.dockProject}
            open={projectOpen}
            onToggle={() => setProjectOpen((v) => !v)}
          >
            <div className="flex h-[440px] flex-col">
              <ProjectTab project={project} cwd={cwd} />
            </div>
          </DockBlock>
        )}
      </div>

      {/* Live spectator — one at a time; keyed by the child session so
          switching targets remounts (clean detach + fresh attach). */}
      {spectatorAgent?.childSessionId && (
        <SpectatorOverlay
          key={spectatorAgent.childSessionId}
          agent={spectatorAgent}
          onClose={() => setSpectatorId(null)}
        />
      )}
      </div>
    </aside>
  );
}
