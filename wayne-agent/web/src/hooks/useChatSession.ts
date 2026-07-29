import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { GatewayClient, type ConnectionState, type GatewayEvent } from "@/lib/gatewayClient";
import { api, type SessionMessagesResponse } from "@/lib/api";
import {
  CLOUD_NOT_LOGGED_IN,
  cloudGetJson,
  mintCloudWsUrl,
  type RunTarget,
} from "@/lib/cloudSession";
import { ENSURE_COMPOSIO_MCP_EVENT } from "@/lib/ensureComposioMcp";
import { useI18n } from "@/i18n";
import {
  stitchHistory,
  type ChatBlock,
  type ChatMessage,
  type TaskStep,
  type ToolCallState,
} from "@/components/chat/types";
import { toolGeneratingLabel } from "@/components/chat/ToolLine";

export type { ConnectionState };

export type PendingPrompt =
  | { kind: "approval"; command: string; description: string; allowPermanent: boolean }
  | { kind: "clarify"; question: string; choices: string[] | null; requestId: string }
  | { kind: "sudo"; requestId: string }
  | { kind: "secret"; prompt: string; envVar: string; requestId: string };

export type ApprovalChoice = "once" | "session" | "always" | "deny";

/** A Crew subagent (delegate_task) — subagent.* events from the gateway. */
export interface SubagentInfo {
  id: string;
  label: string;
  model?: string;
  status: "running" | "done" | "error";
  startedAt: number;
  durationS?: number;
  tokensIn?: number;
  tokensOut?: number;
  toolCount?: number;
  /** The child's stored session id (subagent.start carries it — server.py:3579).
   *  It is the spectator handle: session.resume {lazy:true} on it attaches a
   *  read-only watch window fed by the gateway's child-session live mirror. */
  childSessionId?: string;
}

export interface ChatProgress {
  steps: TaskStep[];
  /** The live "doing now" line (status.update kind status/goal). */
  statusText: string | null;
  /** When the current turn started (client clock) — drives the elapsed timer. */
  turnStartedAt: number | null;
  running: boolean;
  toolCount: number;
  /** Crew specialists running/finished in this turn. */
  subagents: SubagentInfo[];
  /** Last activity of the turn (client clock) — detects "still thinking" when
   *  the provider goes quiet for a few seconds. */
  lastActivityAt: number | null;
}

/** Cumulative session usage — `_get_usage` payload on message.complete. */
export interface ChatUsage {
  model?: string;
  input?: number;
  output?: number;
  total?: number;
  calls?: number;
}

/** How the last turn ENDED — assembled on message.complete (status + usage)
 *  plus the turn's `review.summary` text when the agent recorded one. Cleared
 *  when the user sends the next prompt (the new turn wipes the result view). */
export interface TurnResult {
  endedAt: number;
  /** Client-clocked turn duration (message.start → message.complete). */
  durationS: number | null;
  status: "complete" | "error" | "interrupted";
  /** Cumulative session usage at turn end (same payload the header panel uses). */
  usage: ChatUsage | null;
  /** The `review.summary` text of this turn, when one arrived. */
  review: string | null;
}

/** Notice coming from the server (notification.show — the "backbone" the
 *  desktop uses for credits and operational notices). */
export interface ChatNotice {
  key: string;
  text: string;
  level: "info" | "warn" | "error";
}

/** PER-SESSION overrides sent on session.create — the same contract as the
 *  desktop composer ("ships model/effort on every session.create",
 *  tui_gateway/server.py:4939). NEVER writes the global config. */
export interface SessionCreateOverrides {
  model?: string;
  provider?: string;
  reasoningEffort?: string;
}

interface MessageDeltaPayload {
  text?: string;
}
interface MessageCompletePayload {
  text?: string;
  status?: "complete" | "error" | "interrupted";
  warning?: string;
  usage?: ChatUsage;
  reasoning?: string;
}
interface ReasoningDeltaPayload {
  text?: string;
}
interface ToolGeneratingPayload {
  name?: string;
}
interface NotificationShowPayload {
  text?: string;
  level?: string;
  kind?: string;
  ttl_ms?: number;
  key?: string;
}
interface NotificationClearPayload {
  key?: string;
}
interface ToolStartPayload {
  tool_id: string;
  name?: string;
  context?: string;
  args_text?: string;
}
interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}
interface ToolCompletePayload {
  tool_id: string;
  name?: string;
  result?: unknown;
  duration_s?: number;
  summary?: string;
  result_text?: string;
  error?: string;
  inline_diff?: string;
  todos?: TodoItem[];
}
interface StatusUpdatePayload {
  kind?: string;
  text?: string;
}
interface ApprovalRequestPayload {
  command: string;
  description: string;
  allow_permanent?: boolean;
}
interface ClarifyRequestPayload {
  question: string;
  choices: string[] | null;
  request_id: string;
}
interface SudoRequestPayload {
  request_id: string;
}
interface SecretRequestPayload {
  prompt: string;
  env_var: string;
  request_id: string;
}
interface SessionInfoPayload {
  title?: string;
  model?: string;
  yolo?: boolean;
  provider?: string;
  reasoning_effort?: string;
  service_tier?: string;
  fast?: boolean;
  /** Where the server says this session runs — the authority on its workspace. */
  cwd?: string;
}

/** Live fields from session.info (reflect a model/tier switch in the session). */
export interface SessionLiveInfo {
  model?: string;
  /** EFFECTIVE approvals bypass (config off ∨ session yolo) — session.info. */
  yolo?: boolean;
  provider?: string;
  reasoningEffort?: string;
  fast?: boolean;
}
interface ErrorPayload {
  message?: string;
}
interface SessionCreateResult {
  session_id: string;
  /** Durable id (session_key) — what /api/sessions endpoints resolve. */
  stored_session_id?: string;
  info?: SessionInfoPayload;
}
interface SessionResumeResult {
  session_id: string;
  info?: SessionInfoPayload;
  running?: boolean;
}

function resultText(payload: ToolCompletePayload): string | undefined {
  if (payload.result_text) return payload.result_text;
  if (payload.summary) return payload.summary;
  if (payload.result === undefined || payload.result === null) return undefined;
  return typeof payload.result === "string"
    ? payload.result
    : JSON.stringify(payload.result, null, 2);
}

function approvalPromptFromPayload(p: ApprovalRequestPayload): PendingPrompt {
  return {
    kind: "approval",
    command: p.command,
    description: p.description,
    // Backend redacts the command for display already. allow_permanent is
    // omitted (not false) on most call sites, so default to allowed.
    allowPermanent: p.allow_permanent !== false,
  };
}

// Status noise we never want as a "doing now" label.
const HIDDEN_STATUS_KINDS = new Set(["ready", "compacting", "compressing", "lifecycle"]);

let localIdSeq = 0;
const nextLocalId = () => `local-${++localIdSeq}`;

// ── Block builders (interleaved assistant turn) ───────────────────────
// Exported: the subagent spectator (RightDock) builds its mirrored turn with
// the same primitives, so both transcripts interleave text/tools identically.
export function appendText(blocks: ChatBlock[], chunk: string): ChatBlock[] {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === "text") {
    return [...blocks.slice(0, -1), { ...last, text: last.text + chunk }];
  }
  return [...blocks, { kind: "text", id: nextLocalId(), text: chunk }];
}
export function pushTool(blocks: ChatBlock[], tool: ToolCallState): ChatBlock[] {
  return [...blocks, { kind: "tool", tool }];
}
export function patchTool(blocks: ChatBlock[], toolId: string, patch: Partial<ToolCallState>): ChatBlock[] {
  return blocks.map((b) =>
    b.kind === "tool" && b.tool.id === toolId ? { kind: "tool", tool: { ...b.tool, ...patch } } : b,
  );
}

/**
 * Turn watchdog thresholds. We look at SILENCE (no inbound gateway event at
 * all), never at elapsed turn time: a healthy long turn keeps streaming deltas
 * and tool events, so quiet is the only honest signal that it died. The window
 * is deliberately generous — a single bash tool defaults to a 120s timeout, so
 * anything under ~2.5min of quiet can still be a legitimate long command.
 */
const TURN_STALL_MS = 240_000;
const TURN_STALL_CHECK_MS = 15_000;

/**
 * Owns the connection + session lifecycle + event reducer for the native chat.
 * Talks directly to /api/ws (session.create/resume, prompt.submit,
 * approval/clarify/sudo/secret.respond) — no PTY. Builds the assistant turn as
 * ordered interleaved blocks (text/tool) and a task-progress view (todo steps
 * with client-clocked timing + the live status line). See
 * ui-tui/src/app/createGatewayEventHandler.ts for the reference reducer.
 */
export function useChatSession(
  resumeId: string | null,
  freshNonce = 0,
  /** Workspace (project) of the NEW conversation — goes in session.create
   *  {cwd}; the gateway persists it as the session workspace. Ignored on resume. */
  cwd?: string,
  /** Holds the connection until the caller resolves dependencies (e.g. the
   *  absolute workspace root or the current tier) — avoids creating the WRONG
   *  session. */
  enabled = true,
  /** PER-SESSION model/effort (desktop contract). The caller MUST pass a stable
   *  reference (state/memo) — the object goes into the effect deps. */
  overrides?: SessionCreateOverrides | null,
  /** Agent (profile) owning the NEW conversation — goes in session.create
   *  {profile}; the gateway re-binds WAYNE_HOME to that agent (server.py:
   *  session.create accepts `profile`). The session is born and lives in the
   *  AGENT's state.db. */
  agentProfile?: string | null,
  /** Awaited right before EVERY prompt.submit — the caller uses it to guarantee
   *  a side-effect landed on the server first (desktop Local mode: local.session.set
   *  must switch env_type before the turn runs, or the first hero message races
   *  ahead of it and runs in the cloud). Covers the direct AND the queued
   *  (pendingSend) send paths. Must be idempotent; a no-op when unused. */
  beforeSubmit?: () => Promise<void> | void,
  /** WHERE this chat runs (S1 mini-computer, local-engine desktop only).
   *  "cloud" connects the SAME protocol to the user's CLOUD computer: the
   *  GatewayClient gets a URL provider that asks the shell for a freshly
   *  ticketed wss:// URL on every connect/reconnect (tickets are single-use
   *  and short-lived). Everything the chat does — session.create,
   *  prompt.submit, streaming, approvals, steering — already rides this WS,
   *  so the whole conversation moves with it. Default "local" = unchanged. */
  runTarget: RunTarget = "local",
) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  // true as soon as session.create/resume resolves and sessionIdRef is ready —
  // the trigger to dispatch a queued message (pendingSendRef).
  const [sessionReady, setSessionReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const [toolCount, setToolCount] = useState(0);
  // Durable id (the one /api/sessions endpoints resolve) — resume target or
  // stored_session_id from session.create. Feeds header actions (rename/
  // archive/delete/export) and the usage panel.
  const [storedSessionId, setStoredSessionId] = useState<string | null>(null);
  // Cumulative session usage from the last message.complete.
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  // Crew specialists (subagent.* — Onda B of desktop parity).
  const [subagents, setSubagents] = useState<SubagentInfo[]>([]);
  // How the LAST turn ended (dock "Resultados") — built on message.complete,
  // cleared by the next sendMessage. Refs feed it: the turn start stamp (the
  // state clears on complete, before we can read it) and the review text
  // (review.summary arrives before/after complete depending on the loop).
  const [lastResult, setLastResult] = useState<TurnResult | null>(null);
  const turnStartedRef = useRef<number | null>(null);
  const pendingReviewRef = useRef<string | null>(null);
  // LIVE model/tier from session.info (reflects a model switch in the session).
  const [liveInfo, setLiveInfo] = useState<SessionLiveInfo | null>(null);
  // Last activity instant of the turn (ref — does not re-render per delta; read
  // on render and re-checked by the progress panel's ticker).
  const lastActivityRef = useRef<number | null>(null);
  // Server notices (notification.show/clear) — credits, operational.
  const [notices, setNotices] = useState<ChatNotice[]>([]);
  const noticeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const noticeSeqRef = useRef(0);

  // Turn watchdog. `busy` is only cleared by message.complete, so a gateway that
  // hangs (dropped stream, turn looping without ever emitting the terminal
  // event) left the composer locked on "Thinking" forever — the only escape was
  // reloading the page. Stamped by gw.onAny below.
  const lastEventAtRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => {
      if (Date.now() - lastEventAtRef.current < TURN_STALL_MS) return;
      // Release the composer and say so. This does NOT interrupt the turn: if
      // it is still alive, its answer still lands when it arrives.
      setBusy(false);
      setNotices((prev) => [
        ...prev.filter((n) => n.key !== "turn-stalled"),
        { key: "turn-stalled", text: t.chat.turnStalled, level: "warn" },
      ]);
    }, TURN_STALL_CHECK_MS);
    return () => window.clearInterval(id);
  }, [busy, t]);

  // LIVE session state for the sidebar (Onda 1, desktop pattern): "working" =
  // pulsing dot (agent working), "attention" = amber (waiting on YOU —
  // approval/clarify/sudo/secret), "idle" = nothing. SidebarTasks listens.
  useEffect(() => {
    if (!storedSessionId) return;
    const state = pendingPrompt ? "attention" : busy ? "working" : "idle";
    window.dispatchEvent(
      new CustomEvent("wayne:session-activity", {
        detail: { id: storedSessionId, state },
      }),
    );
  }, [busy, pendingPrompt, storedSessionId]);

  const gwRef = useRef<GatewayClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Submit gate (see the `beforeSubmit` param). Held in a ref so sendMessage — a
  // stable callback — always awaits the latest one without going into its deps.
  const beforeSubmitRef = useRef(beforeSubmit);
  useEffect(() => {
    beforeSubmitRef.current = beforeSubmit;
  }, [beforeSubmit]);
  // ── Automatic reconnection (pre-Onda 3) ─────────────────────────────
  // A deploy/restart drops the WS and the UI stayed dead until F5 ("gateway not
  // connected"). Unexpected drop → schedules a reconnect with backoff; the
  // connection effect re-runs (reconnectNonce) and RESUMES the same session via
  // storedSessionIdRef (mirror — the state is not in the onState closure).
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const storedSessionIdRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  // Class of the last error signalled by a status.update "❌ ..." in the current
  // turn. If the turn closes empty, message.complete promotes it to the bubble
  // (localized reason) instead of "(no reply)". Reset on every message.start.
  const turnErrorRef = useRef<"billing" | "generic" | null>(null);
  // The cwd the SERVER reports for this session (session.info). Authoritative:
  // the `cwd` prop is only what we ASKED for at session.create, and the server
  // may have moved the session since (Local folder pick, project move).
  const serverCwdRef = useRef<string | null>(null);
  // Have we already told the sidebar (wayne:session-started) about THIS session?
  // Avoids inserting the task twice. Reset when the session changes (reset effect).
  const startedDispatchedRef = useRef(false);
  // Message sent BEFORE the session connected (session.create still pending):
  // it waits here and is dispatched as soon as the session is ready — never lost.
  const pendingSendRef = useRef<{ text: string; images?: string[] } | null>(null);
  const approvalQueueRef = useRef<ApprovalRequestPayload[]>([]);
  // Client-side per-step timing (the protocol carries none for todos): id →
  // {startedAt when first in_progress, durationS frozen on completion}.
  const todoTimingRef = useRef<Map<string, { startedAt?: number; durationS?: number }>>(new Map());
  // The plan step currently in_progress — stamped onto tools as they start so
  // the transcript can nest tool lines under their step (Manus-style).
  const currentStepRef = useRef<string | null>(null);

  const acceptsEvent = useCallback((ev: GatewayEvent) => {
    const sid = sessionIdRef.current;
    return !sid || !ev.session_id || ev.session_id === sid;
  }, []);

  const applyTodos = useCallback((todos: TodoItem[]) => {
    const now = Date.now();
    currentStepRef.current = todos.find((td) => td.status === "in_progress")?.id ?? null;
    const timing = todoTimingRef.current;
    const next: TaskStep[] = todos.map((td) => {
      let t = timing.get(td.id) ?? {};
      if (td.status === "in_progress" && t.startedAt == null) t = { ...t, startedAt: now };
      if (
        (td.status === "completed" || td.status === "cancelled") &&
        t.startedAt != null &&
        t.durationS == null
      ) {
        t = { ...t, durationS: (now - t.startedAt) / 1000 };
      }
      timing.set(td.id, t);
      return { id: td.id, content: td.content, status: td.status, startedAt: t.startedAt, durationS: t.durationS };
    });
    setSteps(next);
  }, []);

  // "Nova tarefa" (freshNonce++) or switching conversation (resumeId changes):
  // CLEARS the transcript and all turn state BEFORE connecting/repopulating.
  // Without this the chat is mounted persistently and `messages` (component
  // state) survived — clicking "Nova tarefa" re-showed the previous conversation
  // (only F5 remounted and cleared it). For resume, the connection effect
  // reloads the history right after.
  // useLayoutEffect: clears before paint, with no flash of the old conversation.
  useLayoutEffect(() => {
    setMessages([]);
    setTitle(null);
    setBusy(false);
    setError(null);
    setPendingPrompt(null);
    setSteps([]);
    setStatusText(null);
    setTurnStartedAt(null);
    setToolCount(0);
    setSubagents([]);
    setUsage(null);
    setLastResult(null);
    setLiveInfo(null);
    setNotices([]);
    setStoredSessionId(null);
    setSessionReady(false);
    streamingIdRef.current = null;
    turnStartedRef.current = null;
    pendingReviewRef.current = null;
    currentStepRef.current = null;
    turnErrorRef.current = null;
    startedDispatchedRef.current = false;
    pendingSendRef.current = null;
    todoTimingRef.current.clear();
    approvalQueueRef.current = [];
    // A REAL session switch resets the reconnection machine (the durable id
    // mirror is re-populated by connect; a pending timer from the previous
    // session must NOT reconnect the old one).
    storedSessionIdRef.current = null;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshNonce, resumeId, cwd, agentProfile, runTarget]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const cloud = runTarget === "cloud";
    // Cloud target: the client asks the shell for a freshly ticketed cloud WS
    // URL on every connect (mintCloudWsUrl) — reconnects re-mint, never reuse.
    const gw = new GatewayClient(cloud ? mintCloudWsUrl : undefined);
    gwRef.current = gw;
    approvalQueueRef.current = [];

    const offState = gw.onState((s) => {
      setConnectionState(s);
      // UNEXPECTED drop (gateway deploy/restart; the cleanup sets cancelled
      // before closing): holds sends in the queue (null sid → pendingSendRef)
      // and schedules the reconnect with exponential backoff (1s→15s).
      if (s === "closed" && !cancelled) {
        setSessionReady(false);
        sessionIdRef.current = null;
        const attempt = reconnectAttemptsRef.current++;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => setReconnectNonce((n) => n + 1), delay);
      }
    });

    // Turn watchdog input: stamp every inbound gateway event. We measure
    // SILENCE, not elapsed time — a legitimately long turn keeps emitting
    // deltas/tool events, so only total quiet means the turn is hung.
    const offAny = gw.onAny(() => {
      lastEventAtRef.current = Date.now();
    });

    const offMessageStart = gw.on("message.start", (ev) => {
      if (!acceptsEvent(ev)) return;
      const id = nextLocalId();
      streamingIdRef.current = id;
      turnErrorRef.current = null;
      setBusy(true);
      lastActivityRef.current = Date.now();
      if (turnStartedRef.current == null) turnStartedRef.current = Date.now();
      setTurnStartedAt((prev) => prev ?? Date.now());
      setMessages((prev) => [
        ...prev,
        { id, role: "assistant", content: "", toolCalls: [], blocks: [], streaming: true },
      ]);
    });

    const offMessageDelta = gw.on<MessageDeltaPayload>("message.delta", (ev) => {
      if (!acceptsEvent(ev)) return;
      const id = streamingIdRef.current;
      const chunk = ev.payload?.text;
      if (!id || !chunk) return;
      lastActivityRef.current = Date.now();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, content: (m.content ?? "") + chunk, blocks: appendText(m.blocks ?? [], chunk) }
            : m,
        ),
      );
    });

    // Reasoning (reasoning/thinking) — accumulates on the in-flight turn, the
    // way the desktop renders it (parity: the server emits reasoning.delta/
    // thinking.delta and the final block in reasoning.available /
    // message.complete.reasoning).
    const appendReasoning = (chunk: string | undefined, replace = false) => {
      const id = streamingIdRef.current;
      if (!id || !chunk) return;
      // Reasoning counts as activity — otherwise the "Ainda pensando…" misfires
      // during a long reasoning block (which only emits reasoning.delta).
      lastActivityRef.current = Date.now();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                reasoning: replace
                  ? chunk
                  : (m.reasoning ?? "") + chunk,
              }
            : m,
        ),
      );
    };

    const offReasoningDelta = gw.on<ReasoningDeltaPayload>("reasoning.delta", (ev) => {
      if (!acceptsEvent(ev)) return;
      appendReasoning(ev.payload?.text);
    });
    // `thinking.delta` is the agent's "face"/spinner text, NOT real reasoning —
    // the desktop ignores it on purpose (gateway-event.ts). We were sending it
    // to the Reasoning block and it polluted it with noise. Ignored (parity).
    const offThinkingDelta = gw.on<ReasoningDeltaPayload>("thinking.delta", () => {});
    const offReasoningAvailable = gw.on<ReasoningDeltaPayload>("reasoning.available", (ev) => {
      if (!acceptsEvent(ev)) return;
      appendReasoning(ev.payload?.text, true);
    });

    // "Preparing tool" — the model is building the call (ephemeral;
    // tool.start/status.update replace it right after).
    const offToolGenerating = gw.on<ToolGeneratingPayload>("tool.generating", (ev) => {
      if (!acceptsEvent(ev)) return;
      const name = ev.payload?.name;
      // NEVER leak the raw technical name (e.g. mcp_composio_COMPOSIO_SEARCH_TOOLS)
      // into the status — use the friendly, already-translated verb (toolGeneratingLabel).
      if (name) setStatusText(toolGeneratingLabel(name, t));
    });

    // Crew: subagent lifecycle (rich payload — model, tokens, duration; see
    // tui_gateway/server.py:3464-3526).
    type SubagentPayload = {
      subagent_id?: string;
      label?: string;
      task?: string;
      goal?: string;
      model?: string;
      status?: string;
      duration_seconds?: number;
      input_tokens?: number;
      output_tokens?: number;
      tool_count?: number;
      child_session_id?: string;
    };
    const offSubStart = gw.on<SubagentPayload>("subagent.start", (ev) => {
      const p = ev.payload;
      const id = p?.subagent_id;
      if (!id) return;
      lastActivityRef.current = Date.now();
      const label = p?.label || p?.task || p?.goal || p?.model || id;
      setSubagents((prev) => [
        ...prev.filter((s) => s.id !== id),
        {
          id,
          label,
          model: p?.model,
          status: "running",
          startedAt: Date.now(),
          childSessionId: p?.child_session_id,
        },
      ]);
    });
    const offSubComplete = gw.on<SubagentPayload>("subagent.complete", (ev) => {
      const p = ev.payload;
      const id = p?.subagent_id;
      if (!id) return;
      setSubagents((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                status: p?.status === "error" ? "error" : "done",
                durationS: p?.duration_seconds ?? (Date.now() - s.startedAt) / 1000,
                tokensIn: p?.input_tokens,
                tokensOut: p?.output_tokens,
                toolCount: p?.tool_count ?? s.toolCount,
              }
            : s,
        ),
      );
    });
    const offSubTool = gw.on<SubagentPayload>("subagent.tool", (ev) => {
      const id = ev.payload?.subagent_id;
      if (!id) return;
      lastActivityRef.current = Date.now();
      setSubagents((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, toolCount: (s.toolCount ?? 0) + 1 } : s,
        ),
      );
    });

    // subagent.text — the PROSE the specialist produces. In Crew mode, the reply
    // can come through here instead of message.delta (the main agent delegates
    // and does not rewrite). Without handling this, the turn stayed EMPTY ("Wayne
    // Crew" with no content — the "it froze" Leonardo saw). We append it to the
    // in-flight turn. NO acceptsEvent: subagent.* may carry the CHILD's session_id.
    const offSubText = gw.on<{ subagent_id?: string; text?: string }>(
      "subagent.text",
      (ev) => {
        const id = streamingIdRef.current;
        const chunk = ev.payload?.text;
        if (!id || !chunk) return;
        lastActivityRef.current = Date.now();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  content: (m.content ?? "") + chunk,
                  blocks: appendText(m.blocks ?? [], chunk),
                }
              : m,
          ),
        );
      },
    );

    // Server notices (credits/operational) — the backbone the desktop uses.
    const offNotifShow = gw.on<NotificationShowPayload>("notification.show", (ev) => {
      const p = ev.payload;
      if (!p?.text) return;
      const key = p.key || `notice-${++noticeSeqRef.current}`;
      const level: ChatNotice["level"] =
        p.level === "error" ? "error" : p.level === "warn" ? "warn" : "info";
      setNotices((prev) => [
        ...prev.filter((n) => n.key !== key),
        { key, text: p.text as string, level },
      ]);
      const timers = noticeTimersRef.current;
      const old = timers.get(key);
      if (old) clearTimeout(old);
      if (p.ttl_ms && p.ttl_ms > 0) {
        timers.set(
          key,
          setTimeout(() => {
            setNotices((prev) => prev.filter((n) => n.key !== key));
            timers.delete(key);
          }, p.ttl_ms),
        );
      }
    });
    const offNotifClear = gw.on<NotificationClearPayload>("notification.clear", (ev) => {
      const key = ev.payload?.key;
      setNotices((prev) => (key ? prev.filter((n) => n.key !== key) : []));
    });

    // `review.summary` — the agent records what it learned (memory/skill) at the
    // end of the turn. The desktop shows this as a system line; we were dropping
    // it silently (the user never knew). It becomes a discreet meta line.
    const offReview = gw.on<{ text?: string; summary?: string }>("review.summary", (ev) => {
      if (!acceptsEvent(ev)) return;
      const text = ev.payload?.text ?? ev.payload?.summary;
      if (!text) return;
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId(), role: "system", content: text, toolCalls: [] },
      ]);
      // Feed the dock "Resultados": hold for the upcoming message.complete, and
      // patch the already-built result when the summary lands after it.
      pendingReviewRef.current = text;
      setLastResult((prev) => (prev ? { ...prev, review: text } : prev));
    });

    const offMessageComplete = gw.on<MessageCompletePayload>("message.complete", (ev) => {
      if (!acceptsEvent(ev)) return;
      const id = streamingIdRef.current;
      const payload = ev.payload;
      if (id) {
        const errKind = turnErrorRef.current;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== id) return m;
            const reasoning = m.reasoning ?? payload?.reasoning;
            // Turn closed with no final reply TEXT and an error was signalled
            // (e.g. 402)? Mark the class so the bubble shows a localized reason.
            // Covers both the 100% empty bubble and the "ran tools and then failed
            // at the synthesis" case (there are tools, but no final text).
            const hasFinalText = !!(m.content && m.content.trim());
            return {
              ...m,
              streaming: false,
              reasoning,
              errorKind: errKind && !hasFinalText ? errKind : m.errorKind,
            };
          }),
        );
      }
      streamingIdRef.current = null;
      turnErrorRef.current = null;
      setBusy(false);
      setTurnStartedAt(null);
      setStatusText(null);
      if (payload?.usage) setUsage(payload.usage);
      if (payload?.status === "error" && payload.warning) setError(payload.warning);
      // Turn-end snapshot for the dock "Resultados" (only for turns that ran
      // in THIS view — history loads never fire message.complete).
      const startedAt = turnStartedRef.current;
      turnStartedRef.current = null;
      setLastResult({
        endedAt: Date.now(),
        durationS: startedAt != null ? (Date.now() - startedAt) / 1000 : null,
        status: payload?.status ?? "complete",
        usage: payload?.usage ?? null,
        review: pendingReviewRef.current,
      });
      pendingReviewRef.current = null;
    });

    const offToolStart = gw.on<ToolStartPayload>("tool.start", (ev) => {
      if (!acceptsEvent(ev)) return;
      const msgId = streamingIdRef.current;
      const p = ev.payload;
      if (!msgId || !p) return;
      lastActivityRef.current = Date.now();
      setToolCount((n) => n + 1);
      const call: ToolCallState = {
        id: p.tool_id,
        name: p.name ?? "tool",
        argsPreview: p.args_text ?? p.context,
        status: "running",
        stepId: currentStepRef.current ?? undefined,
      };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, toolCalls: [...m.toolCalls, call], blocks: pushTool(m.blocks ?? [], call) }
            : m,
        ),
      );
    });

    const offToolComplete = gw.on<ToolCompletePayload>("tool.complete", (ev) => {
      if (!acceptsEvent(ev)) return;
      const p = ev.payload;
      if (!p) return;
      // The todo tool is the task plan — feed the progress chip, don't render as
      // a tool card.
      if (p.name === "todo" && p.todos) {
        applyTodos(p.todos);
        return;
      }
      const msgId = streamingIdRef.current;
      if (!msgId) return;
      const patch: Partial<ToolCallState> = {
        status: p.error ? "error" : "done",
        result: resultText(p),
        error: p.error,
        durationS: p.duration_s,
        inlineDiff: p.inline_diff,
      };
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId) return m;
          return {
            ...m,
            toolCalls: m.toolCalls.map((tc) => (tc.id === p.tool_id ? { ...tc, ...patch } : tc)),
            blocks: patchTool(m.blocks ?? [], p.tool_id, patch),
          };
        }),
      );
    });

    const offStatus = gw.on<StatusUpdatePayload>("status.update", (ev) => {
      if (!acceptsEvent(ev)) return;
      const p = ev.payload;
      const kind = p?.kind ?? "status";
      if (!p?.text || HIDDEN_STATUS_KINDS.has(kind)) return;
      lastActivityRef.current = Date.now();
      // A turn failure arrives as a status.update "❌ ..." (conversation_loop
      // _emit_status). It is ephemeral (gone once the turn closes), so we keep the
      // CLASS — NEVER the raw text, which carries the provider key's URL/hash.
      if (p.text.startsWith("❌")) {
        turnErrorRef.current = /402|credit|billing|entitlement|exhaust/i.test(p.text)
          ? "billing"
          : "generic";
      }
      setStatusText(p.text);
    });

    const offApproval = gw.on<ApprovalRequestPayload>("approval.request", (ev) => {
      if (!acceptsEvent(ev) || !ev.payload) return;
      const payload = ev.payload;
      setPendingPrompt((cur) => {
        if (cur) {
          approvalQueueRef.current.push(payload);
          return cur;
        }
        return approvalPromptFromPayload(payload);
      });
    });

    const offClarify = gw.on<ClarifyRequestPayload>("clarify.request", (ev) => {
      if (!acceptsEvent(ev) || !ev.payload) return;
      setPendingPrompt({
        kind: "clarify",
        question: ev.payload.question,
        choices: ev.payload.choices,
        requestId: ev.payload.request_id,
      });
    });

    const offSudo = gw.on<SudoRequestPayload>("sudo.request", (ev) => {
      if (!acceptsEvent(ev) || !ev.payload) return;
      setPendingPrompt({ kind: "sudo", requestId: ev.payload.request_id });
    });

    const offSecret = gw.on<SecretRequestPayload>("secret.request", (ev) => {
      if (!acceptsEvent(ev) || !ev.payload) return;
      setPendingPrompt({
        kind: "secret",
        prompt: ev.payload.prompt,
        envVar: ev.payload.env_var,
        requestId: ev.payload.request_id,
      });
    });

    const offSessionInfo = gw.on<SessionInfoPayload>("session.info", (ev) => {
      if (!acceptsEvent(ev)) return;
      const p = ev.payload;
      // The cwd the SERVER says this session runs in. It is the only honest
      // source: `cwd` here is what WE asked for at session.create, and it goes
      // stale the moment anything else moves the session (picking a folder on
      // the user's machine, a project workspace move). Holding the stale value
      // is what filed a chat under the previous project in the sidebar.
      if (typeof p?.cwd === "string" && p.cwd) serverCwdRef.current = p.cwd;
      if (p?.title) {
        setTitle(p.title);
        // The sidebar (SidebarTasks) uses REST and does not listen to the gateway
        // — tell it via an event to reload the auto title (parity: live title).
        window.dispatchEvent(new CustomEvent("wayne:session-titled"));
      }
      if (
        typeof p?.model === "string" ||
        typeof p?.provider === "string" ||
        typeof p?.reasoning_effort === "string" ||
        typeof p?.fast === "boolean" ||
        typeof p?.yolo === "boolean"
      ) {
        setLiveInfo((prev) => ({
          model: typeof p.model === "string" ? p.model : prev?.model,
          provider: typeof p.provider === "string" ? p.provider : prev?.provider,
          reasoningEffort:
            typeof p.reasoning_effort === "string"
              ? p.reasoning_effort
              : prev?.reasoningEffort,
          yolo: typeof p.yolo === "boolean" ? p.yolo : prev?.yolo,
          fast: typeof p.fast === "boolean" ? p.fast : prev?.fast,
        }));
      }
    });

    const offError = gw.on<ErrorPayload>("error", (ev) => {
      if (!acceptsEvent(ev)) return;
      if (ev.payload?.message) setError(ev.payload.message);
    });

    void (async () => {
      try {
        await gw.connect();
        if (cancelled) return;

        // Reconnecting a NEW task (no ?resume in the URL) resumes the SAME
        // session via the mirrored durable id — NEVER creates a second session.
        const resumeTarget = resumeId ?? storedSessionIdRef.current;

        if (resumeTarget) {
          // Cloud session: same-origin REST would ask the LOCAL gateway for a
          // session that lives in the cloud — read the history through the
          // shell's cloud API bridge instead (null on failure keeps whatever
          // transcript is already on screen; reconnects never wipe it).
          const historyPromise = cloud
            ? cloudGetJson<SessionMessagesResponse>(
                `/api/sessions/${encodeURIComponent(resumeTarget)}/messages`,
              )
            : api.getSessionMessages(resumeTarget).catch(() => null);
          const [history, resumed] = await Promise.all([
            historyPromise,
            gw.request<SessionResumeResult>("session.resume", { session_id: resumeTarget }),
          ]);
          if (cancelled) return;
          sessionIdRef.current = resumed.session_id;
          // The resume target from the URL IS the durable id.
          setStoredSessionId(resumeTarget);
          storedSessionIdRef.current = resumeTarget;
          if (history) setMessages(stitchHistory(history.messages));
          setTitle(resumed.info?.title ?? null);
          setBusy(!!resumed.running);
          reconnectAttemptsRef.current = 0;
          setError(null);
          setSessionReady(true);
        } else {
          const created = await gw.request<SessionCreateResult>("session.create", {
            ...(cwd ? { cwd } : {}),
            // Chat WITH a specific agent: the session is born in ITS WAYNE_HOME.
            ...(agentProfile ? { profile: agentProfile } : {}),
            // PER-SESSION overrides (desktop contract) — NEVER the global config.
            ...(overrides?.model ? { model: overrides.model } : {}),
            ...(overrides?.provider ? { provider: overrides.provider } : {}),
            ...(overrides?.reasoningEffort
              ? { reasoning_effort: overrides.reasoningEffort }
              : {}),
          });
          if (cancelled) return;
          sessionIdRef.current = created.session_id;
          setStoredSessionId(created.stored_session_id ?? null);
          storedSessionIdRef.current = created.stored_session_id ?? null;
          setTitle(created.info?.title ?? null);
          reconnectAttemptsRef.current = 0;
          setError(null);
          setSessionReady(true);
        }
      } catch (err) {
        // Connection/handshake failed (machine still coming up post-deploy?):
        // retries with the same backoff — no F5.
        if (!cancelled) {
          // Cloud target without a live login: this is a STATE, not a fault.
          // Show the localized "sign in" line and do NOT schedule reconnects —
          // hammering the mint endpoint can't sign the user in.
          if (err instanceof Error && err.message === CLOUD_NOT_LOGGED_IN) {
            setError(t.chat.runCloudSignIn);
            return;
          }
          setError(err instanceof Error ? err.message : String(err));
          const attempt = reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * 2 ** attempt, 15000);
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => setReconnectNonce((n) => n + 1), delay);
        }
      }
    })();

    return () => {
      cancelled = true;
      offState();
      offMessageStart();
      offMessageDelta();
      offMessageComplete();
      offToolStart();
      offToolComplete();
      offSubStart();
      offSubComplete();
      offSubTool();
      offSubText();
      offReasoningDelta();
      offThinkingDelta();
      offReasoningAvailable();
      offToolGenerating();
      offNotifShow();
      offNotifClear();
      offReview();
      offStatus();
      offApproval();
      offClarify();
      offSudo();
      offSecret();
      offSessionInfo();
      offError();
      offAny();
      const timers = noticeTimersRef.current;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      gw.close();
      gwRef.current = null;
      sessionIdRef.current = null;
    };
  }, [resumeId, freshNonce, reconnectNonce, cwd, enabled, overrides, agentProfile, runTarget, t, acceptsEvent, applyTodos]);

  const sendMessage = useCallback(
    (text: string, images?: string[]) => {
      const gw = gwRef.current;
      const sid = sessionIdRef.current;
      const trimmed = text.trim();
      if (!trimmed || busy || pendingPrompt) return;
      // Session still connecting (session.create pending)? Queue it and dispatch
      // when it is ready — before, this hit the early-return and the msg vanished
      // (the Composer cleared the text). NEVER lose a message to timing again.
      if (!gw || !sid) {
        pendingSendRef.current = { text: trimmed, images };
        return;
      }
      // 1st message of a NEW task (not a resume): tell the sidebar right away so
      // the task shows up under "Tarefas" with the 1st msg as a provisional title
      // (ChatGPT/Manus pattern) — without waiting for the server to auto-title.
      // The real title replaces it via wayne:session-titled. Dedupe by id in the
      // sidebar. Cloud sessions (0.3.5) now ride the SAME event carrying their
      // origin (`cloud`) — this hook KNOWS the run target, so the sidebar can
      // badge the row instantly and resume it with ?run=cloud instead of
      // waiting for the first titled reload.
      if (!resumeId && !startedDispatchedRef.current && storedSessionId) {
        startedDispatchedRef.current = true;
        window.dispatchEvent(
          new CustomEvent("wayne:session-started", {
            detail: {
              id: storedSessionId,
              title: trimmed.slice(0, 140),
              // The server's cwd wins over the one we asked for. This row decides
              // which project the task appears under, and guessing it wrong filed
              // a local-folder chat under the previous project.
              cwd: serverCwdRef.current ?? cwd ?? null,
              // Origin of the session: true = born on the user's CLOUD computer
              // (the sidebar shows the badge and resumes with ?run=cloud).
              cloud: runTarget === "cloud",
            },
          }),
        );
      }
      setError(null);
      setBusy(true);
      // Start the watchdog window from this turn, not from the last event of
      // the previous one (which could already be minutes old).
      lastEventAtRef.current = Date.now();
      // Fresh task view per request.
      todoTimingRef.current.clear();
      currentStepRef.current = null;
      setSteps([]);
      setStatusText(null);
      setToolCount(0);
      setSubagents([]);
      // The new turn wipes the previous result (dock "Resultados" hides).
      setLastResult(null);
      pendingReviewRef.current = null;
      setMessages((prev) => [
        ...prev,
        {
          id: nextLocalId(),
          role: "user",
          content: trimmed,
          toolCalls: [],
          images: images && images.length > 0 ? images : undefined,
        },
      ]);
      // Arm any per-session prerequisite (desktop Local mode: local.session.set)
      // BEFORE the turn runs — awaited here so it covers the queued (pendingSend)
      // path too, which dispatches through this callback without going through
      // handleSend. The optimistic user bubble above already painted, so the UI
      // stays responsive while the (idempotent, sub-second) gate resolves.
      void (async () => {
        try {
          await beforeSubmitRef.current?.();
        } catch {
          /* arming failed — still submit so the message is never lost; the turn
             may fall back to the cloud and the user can retry. */
        }
        try {
          await gw.request("prompt.submit", { session_id: sid, text: trimmed });
        } catch (err) {
          setBusy(false);
          setError(err instanceof Error ? err.message : String(err));
        }
      })();
    },
    [busy, pendingPrompt, resumeId, storedSessionId, cwd, runTarget],
  );

  // Session became ready and there is a queued message (sent before connecting)
  // → dispatch now. `sendMessage` already has storedSessionId in its closure at
  // this point (set in the same commit as sessionReady), so the optimistic
  // insert lands right.
  useEffect(() => {
    if (!sessionReady) return;
    const pending = pendingSendRef.current;
    if (!pending) return;
    pendingSendRef.current = null;
    sendMessage(pending.text, pending.images);
  }, [sessionReady, sendMessage]);

  // Stop the running turn — same RPC the TUI's Ctrl+C path uses
  // (ui-tui/src/app/turnController.ts). The server aborts the turn and emits
  // message.complete status:"interrupted", which resets `busy` naturally.
  const interrupt = useCallback(() => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return;
    void gw.request("session.interrupt", { session_id: sid }).catch(() => {});
  }, []);

  // Attach a server-side image file to the NEXT prompt — the same
  // `image.attach` RPC the TUI's /image command uses; the gateway queues it on
  // the session (`attached_images`) and consumes it on prompt.submit. `path`
  // must be an absolute path on the server (we upload via /api/files first).
  const attachImage = useCallback(async (path: string): Promise<boolean> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return false;
    try {
      await gw.request("image.attach", { session_id: sid, path });
      return true;
    } catch {
      return false;
    }
  }, []);

  // NON-image attachment (PDF, doc, csv…) — `file.attach` was designed for our
  // remote case (server.py:9461: "the client uploads data_url bytes and we
  // materialize the file on the gateway"); it becomes an @file: the agent reads.
  const attachFile = useCallback(
    async (name: string, dataUrl: string): Promise<boolean> => {
      const gw = gwRef.current;
      const sid = sessionIdRef.current;
      if (!gw || !sid) return false;
      try {
        await gw.request("file.attach", {
          session_id: sid,
          path: name,
          data_url: dataUrl,
          name,
        });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  // Steer WITHOUT interrupting (session.steer): the text lands in the next tool
  // result and the model sees it on the next iteration — it creates no new turn.
  const steer = useCallback(async (text: string): Promise<boolean> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    const trimmed = text.trim();
    if (!gw || !sid || !trimmed) return false;
    try {
      const res = await gw.request<{ status?: string }>("session.steer", {
        session_id: sid,
        text: trimmed,
      });
      if (res?.status !== "queued") return false;
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId(), role: "user", content: trimmed, toolCalls: [] },
      ]);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Undoes the last turn (the server requires a stopped turn) and mirrors the cut locally.
  const undoTurn = useCallback(async (): Promise<boolean> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return false;
    try {
      await gw.request("session.undo", { session_id: sid });
      setMessages((prev) => {
        const next = [...prev];
        while (next.length && next[next.length - 1].role !== "user") next.pop();
        if (next.length) next.pop(); // the user message itself
        return next;
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  // Compacts the conversation and reloads the persisted (stitched) transcript.
  const compressChat = useCallback(async (): Promise<boolean> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return false;
    try {
      await gw.request("session.compress", { session_id: sid });
      const stored = resumeId ?? storedSessionId;
      if (stored) {
        // Cloud session: the transcript lives on the cloud gateway — reload it
        // through the shell bridge (null keeps the on-screen transcript).
        const history =
          runTarget === "cloud"
            ? await cloudGetJson<SessionMessagesResponse>(
                `/api/sessions/${encodeURIComponent(stored)}/messages`,
              )
            : await api.getSessionMessages(stored).catch(() => null);
        if (history) setMessages(stitchHistory(history.messages));
      }
      return true;
    } catch {
      return false;
    }
  }, [resumeId, storedSessionId, runTarget]);

  // ── Composer autocomplete (desktop parity): / and @ ─────────────────
  type CompletionItem = { text: string; display?: string; meta?: string };
  const completeSlash = useCallback(async (text: string): Promise<CompletionItem[]> => {
    const gw = gwRef.current;
    if (!gw) return [];
    try {
      const r = await gw.request<{ items?: CompletionItem[] }>("complete.slash", { text });
      return r?.items ?? [];
    } catch {
      return [];
    }
  }, []);
  const completePath = useCallback(async (word: string): Promise<CompletionItem[]> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw) return [];
    try {
      const r = await gw.request<{ items?: CompletionItem[] }>("complete.path", {
        word,
        session_id: sid ?? undefined,
      });
      return r?.items ?? [];
    } catch {
      return [];
    }
  }, []);
  // Runs a /command (slash.exec) — echoes the command + the output as a system
  // line. Some commands already have a native button; this covers the rest
  // (/help, /skills, etc.). Returns the output for the caller to decide.
  const execSlash = useCallback(async (command: string): Promise<void> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return;
    setMessages((prev) => [
      ...prev,
      { id: nextLocalId(), role: "user", content: command, toolCalls: [] },
    ]);
    try {
      const r = await gw.request<{ output?: string }>("slash.exec", {
        command,
        session_id: sid,
      });
      const out = r?.output;
      if (out) {
        setMessages((prev) => [
          ...prev,
          { id: nextLocalId(), role: "system", content: out, toolCalls: [] },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Context window occupancy (session.context_breakdown) — the gauge the
  // desktop shows; feeds the Usage popover.
  const contextBreakdown = useCallback(async (): Promise<{
    context_percent?: number;
    context_used?: number;
    context_max?: number;
  } | null> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return null;
    try {
      return await gw.request("session.context_breakdown", { session_id: sid });
    } catch {
      return null;
    }
  }, []);

  // Branches the conversation into a new session; returns the id to navigate to.
  /** Turns the approvals bypass on/off ONLY IN THIS SESSION (the TUI's
   *  Shift+Tab) — RPC config.set key=yolo scope=session; NEVER touches the
   *  global config nor cron. session.info reflects it (liveInfo.yolo). */
  const setSessionYolo = useCallback(async (on: boolean): Promise<boolean> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return false;
    try {
      await gw.request("config.set", {
        session_id: sid,
        key: "yolo",
        value: on ? "on" : "off",
        scope: "session",
      });
      setLiveInfo((prev) => ({ ...(prev ?? {}), yolo: on }));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  /** Replaces the set of connector toolkits switched OFF for THIS session
   *  (composer Conectores toggles) — RPC config.set key=connectors.disabled
   *  scope=session. Enforcement lives at the engine's MCP call door
   *  (tools/mcp_tool.py); this never touches global config nor other sessions. */
  const setSessionConnectorsDisabled = useCallback(async (slugs: string[]): Promise<boolean> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return false;
    try {
      await gw.request("config.set", {
        session_id: sid,
        key: "connectors.disabled",
        value: slugs,
        scope: "session",
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  // Local engine (desktop-shell): attach mcp_servers.composio + reload.mcp so
  // mcp_composio_* tools exist before the first Gmail/etc. turn. Without this,
  // the UI shows connectors ACTIVE while the agent falls back to skills/SDK.
  useEffect(() => {
    if (!sessionReady || runTarget === "cloud") return;

    let lastOkAt = 0;
    const COOLDOWN_MS = 30_000;
    let alive = true;

    const run = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastOkAt < COOLDOWN_MS) return;
      try {
        await api.attachConnectors("global");
      } catch {
        /* no COMPOSIO_API_KEY / route — still attempt reload if config exists */
      }
      if (!alive) return;
      const gw = gwRef.current;
      const sid = sessionIdRef.current;
      if (!gw || !sid) return;
      try {
        await gw.request("reload.mcp", { confirm: true, session_id: sid });
        lastOkAt = Date.now();
      } catch {
        /* best-effort */
      }
    };

    void run(false);
    const onEvt = (ev: Event) => {
      const force = Boolean((ev as CustomEvent<{ force?: boolean }>).detail?.force);
      void run(force);
    };
    window.addEventListener(ENSURE_COMPOSIO_MCP_EVENT, onEvt);
    return () => {
      alive = false;
      window.removeEventListener(ENSURE_COMPOSIO_MCP_EVENT, onEvt);
    };
  }, [sessionReady, runTarget]);

  const branchChat = useCallback(async (): Promise<string | null> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return null;
    try {
      const res = await gw.request<{
        session_id?: string;
        stored_session_id?: string;
      }>("session.branch", { session_id: sid });
      return res?.stored_session_id ?? res?.session_id ?? null;
    } catch (err) {
      // It used to swallow this silently (return null) — the caller had no way
      // to know WHY it failed (e.g. "nothing to branch — send a message
      // first" on a freshly resumed session). Surface it in the already-existing
      // error banner (error ?? attachError in NativeChatPage) instead of vanishing.
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const advanceApprovalQueue = useCallback(() => {
    const next = approvalQueueRef.current.shift();
    setPendingPrompt(next ? approvalPromptFromPayload(next) : null);
  }, []);

  const respondApproval = useCallback(
    (choice: ApprovalChoice) => {
      const gw = gwRef.current;
      const sid = sessionIdRef.current;
      if (!gw || !sid) return;
      void gw.request("approval.respond", { session_id: sid, choice }).finally(advanceApprovalQueue);
    },
    [advanceApprovalQueue],
  );

  const respondClarify = useCallback((requestId: string, answer: string) => {
    const gw = gwRef.current;
    if (!gw) return;
    setPendingPrompt(null);
    void gw.request("clarify.respond", { request_id: requestId, answer });
  }, []);

  const respondSudo = useCallback((requestId: string, password: string) => {
    const gw = gwRef.current;
    if (!gw) return;
    setPendingPrompt(null);
    void gw.request("sudo.respond", { request_id: requestId, password });
  }, []);

  const respondSecret = useCallback((requestId: string, value: string) => {
    const gw = gwRef.current;
    if (!gw) return;
    setPendingPrompt(null);
    void gw.request("secret.respond", { request_id: requestId, value });
  }, []);

  // Turns the "Local (desktop)" environment on/off for this session (Onda 5):
  // the gateway starts routing file/shell to the executor on the user's machine.
  const localEnv = useCallback(async (enabled: boolean, cwd?: string) => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return;
    await gw.request("local.session.set", {
      session_id: sid,
      enabled,
      cwd: cwd || "",
    });
  }, []);

  // Reads a file from the USER'S MACHINE through the session's desktop
  // executor (gateway RPC local.fs.read — the same channel Local mode's
  // file/shell rides). Returns the /api/fs/read-data-url shape ({data_url})
  // so the dock reuses its decode paths; null when no session is live. RPC
  // errors (not local mode, executor off, binary, too large) reject — the
  // lib/localFile seam turns that into a clean null for the UI.
  const readLocalFile = useCallback(
    async (
      path: string,
    ): Promise<{ data_url: string; mime?: string; size?: number; name?: string } | null> => {
      const gw = gwRef.current;
      const sid = sessionIdRef.current;
      if (!gw || !sid) return null;
      return await gw.request<{
        data_url: string;
        mime?: string;
        size?: number;
        name?: string;
      }>("local.fs.read", { session_id: sid, path });
    },
    [],
  );

  const dismissNotice = useCallback((key: string) => {
    setNotices((prev) => prev.filter((n) => n.key !== key));
    const timer = noticeTimersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      noticeTimersRef.current.delete(key);
    }
  }, []);

  const progress: ChatProgress = {
    steps,
    statusText,
    turnStartedAt,
    running: busy,
    toolCount,
    subagents,
    lastActivityAt: lastActivityRef.current,
  };

  return {
    messages,
    connectionState,
    busy,
    pendingPrompt,
    title,
    error,
    progress,
    usage,
    /** How the LAST turn ended — null while running or after the next send. */
    lastResult,
    liveInfo,
    notices,
    dismissNotice,
    localEnv,
    /** Read a user-machine file via the session's local executor (Local mode). */
    readLocalFile,
    storedSessionId,
    /** true as soon as session.create/resume resolves — a safe trigger to fire
     *  actions that need the session ready (e.g. ?branch=1). */
    sessionReady,
    sendMessage,
    interrupt,
    attachImage,
    attachFile,
    steer,
    undoTurn,
    compressChat,
    branchChat,
    setSessionYolo,
    setSessionConnectorsDisabled,
    contextBreakdown,
    completeSlash,
    completePath,
    execSlash,
    respondApproval,
    respondClarify,
    respondSudo,
    respondSecret,
  };
}
