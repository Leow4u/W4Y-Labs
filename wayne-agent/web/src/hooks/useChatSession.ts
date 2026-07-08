import { useCallback, useEffect, useRef, useState } from "react";

import { GatewayClient, type ConnectionState, type GatewayEvent } from "@/lib/gatewayClient";
import { api } from "@/lib/api";
import {
  fromSessionMessage,
  type ChatBlock,
  type ChatMessage,
  type TaskStep,
  type ToolCallState,
} from "@/components/chat/types";

export type { ConnectionState };

export type PendingPrompt =
  | { kind: "approval"; command: string; description: string; allowPermanent: boolean }
  | { kind: "clarify"; question: string; choices: string[] | null; requestId: string }
  | { kind: "sudo"; requestId: string }
  | { kind: "secret"; prompt: string; envVar: string; requestId: string };

export type ApprovalChoice = "once" | "session" | "always" | "deny";

export interface ChatProgress {
  steps: TaskStep[];
  /** The live "doing now" line (status.update kind status/goal). */
  statusText: string | null;
  /** When the current turn started (client clock) — drives the elapsed timer. */
  turnStartedAt: number | null;
  running: boolean;
  toolCount: number;
}

interface MessageDeltaPayload {
  text?: string;
}
interface MessageCompletePayload {
  text?: string;
  status?: "complete" | "error" | "interrupted";
  warning?: string;
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
}
interface ErrorPayload {
  message?: string;
}
interface SessionCreateResult {
  session_id: string;
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
function appendText(blocks: ChatBlock[], chunk: string): ChatBlock[] {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === "text") {
    return [...blocks.slice(0, -1), { ...last, text: last.text + chunk }];
  }
  return [...blocks, { kind: "text", id: nextLocalId(), text: chunk }];
}
function pushTool(blocks: ChatBlock[], tool: ToolCallState): ChatBlock[] {
  return [...blocks, { kind: "tool", tool }];
}
function patchTool(blocks: ChatBlock[], toolId: string, patch: Partial<ToolCallState>): ChatBlock[] {
  return blocks.map((b) =>
    b.kind === "tool" && b.tool.id === toolId ? { kind: "tool", tool: { ...b.tool, ...patch } } : b,
  );
}

/**
 * Owns the connection + session lifecycle + event reducer for the native chat.
 * Talks directly to /api/ws (session.create/resume, prompt.submit,
 * approval/clarify/sudo/secret.respond) — no PTY. Builds the assistant turn as
 * ordered interleaved blocks (text/tool) and a task-progress view (todo steps
 * with client-clocked timing + the live status line). See
 * ui-tui/src/app/createGatewayEventHandler.ts for the reference reducer.
 */
export function useChatSession(resumeId: string | null, freshNonce = 0) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [busy, setBusy] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const [toolCount, setToolCount] = useState(0);

  const gwRef = useRef<GatewayClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const approvalQueueRef = useRef<ApprovalRequestPayload[]>([]);
  // Client-side per-step timing (the protocol carries none for todos): id →
  // {startedAt when first in_progress, durationS frozen on completion}.
  const todoTimingRef = useRef<Map<string, { startedAt?: number; durationS?: number }>>(new Map());

  const acceptsEvent = useCallback((ev: GatewayEvent) => {
    const sid = sessionIdRef.current;
    return !sid || !ev.session_id || ev.session_id === sid;
  }, []);

  const applyTodos = useCallback((todos: TodoItem[]) => {
    const now = Date.now();
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

  useEffect(() => {
    let cancelled = false;
    const gw = new GatewayClient();
    gwRef.current = gw;
    approvalQueueRef.current = [];

    const offState = gw.onState((s) => setConnectionState(s));

    const offMessageStart = gw.on("message.start", (ev) => {
      if (!acceptsEvent(ev)) return;
      const id = nextLocalId();
      streamingIdRef.current = id;
      setBusy(true);
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, content: (m.content ?? "") + chunk, blocks: appendText(m.blocks ?? [], chunk) }
            : m,
        ),
      );
    });

    const offMessageComplete = gw.on<MessageCompletePayload>("message.complete", (ev) => {
      if (!acceptsEvent(ev)) return;
      const id = streamingIdRef.current;
      streamingIdRef.current = null;
      setBusy(false);
      setTurnStartedAt(null);
      setStatusText(null);
      const payload = ev.payload;
      if (id) {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, streaming: false } : m)),
        );
      }
      if (payload?.status === "error" && payload.warning) setError(payload.warning);
    });

    const offToolStart = gw.on<ToolStartPayload>("tool.start", (ev) => {
      if (!acceptsEvent(ev)) return;
      const msgId = streamingIdRef.current;
      const p = ev.payload;
      if (!msgId || !p) return;
      setToolCount((n) => n + 1);
      const call: ToolCallState = {
        id: p.tool_id,
        name: p.name ?? "tool",
        argsPreview: p.args_text ?? p.context,
        status: "running",
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
      if (ev.payload?.title) setTitle(ev.payload.title);
    });

    const offError = gw.on<ErrorPayload>("error", (ev) => {
      if (!acceptsEvent(ev)) return;
      if (ev.payload?.message) setError(ev.payload.message);
    });

    void (async () => {
      try {
        await gw.connect();
        if (cancelled) return;

        if (resumeId) {
          const [history, resumed] = await Promise.all([
            api.getSessionMessages(resumeId).catch(() => null),
            gw.request<SessionResumeResult>("session.resume", { session_id: resumeId }),
          ]);
          if (cancelled) return;
          sessionIdRef.current = resumed.session_id;
          if (history) setMessages(history.messages.map((m, i) => fromSessionMessage(m, i)));
          setTitle(resumed.info?.title ?? null);
          setBusy(!!resumed.running);
        } else {
          const created = await gw.request<SessionCreateResult>("session.create", {});
          if (cancelled) return;
          sessionIdRef.current = created.session_id;
          setTitle(created.info?.title ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
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
      offStatus();
      offApproval();
      offClarify();
      offSudo();
      offSecret();
      offSessionInfo();
      offError();
      gw.close();
      gwRef.current = null;
      sessionIdRef.current = null;
    };
  }, [resumeId, freshNonce, acceptsEvent, applyTodos]);

  const sendMessage = useCallback(
    (text: string) => {
      const gw = gwRef.current;
      const sid = sessionIdRef.current;
      const trimmed = text.trim();
      if (!gw || !sid || !trimmed || busy || pendingPrompt) return;
      setError(null);
      setBusy(true);
      // Fresh task view per request.
      todoTimingRef.current.clear();
      setSteps([]);
      setStatusText(null);
      setToolCount(0);
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId(), role: "user", content: trimmed, toolCalls: [] },
      ]);
      void gw.request("prompt.submit", { session_id: sid, text: trimmed }).catch((err) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : String(err));
      });
    },
    [busy, pendingPrompt],
  );

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

  const progress: ChatProgress = { steps, statusText, turnStartedAt, running: busy, toolCount };

  return {
    messages,
    connectionState,
    busy,
    pendingPrompt,
    title,
    error,
    progress,
    sendMessage,
    respondApproval,
    respondClarify,
    respondSudo,
    respondSecret,
  };
}
