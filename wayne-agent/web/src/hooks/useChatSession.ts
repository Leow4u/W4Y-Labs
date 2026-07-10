import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { GatewayClient, type ConnectionState, type GatewayEvent } from "@/lib/gatewayClient";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import {
  stitchHistory,
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

/** Um subagente do Crew (delegate_task) — eventos subagent.* do gateway. */
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
}

export interface ChatProgress {
  steps: TaskStep[];
  /** The live "doing now" line (status.update kind status/goal). */
  statusText: string | null;
  /** When the current turn started (client clock) — drives the elapsed timer. */
  turnStartedAt: number | null;
  running: boolean;
  toolCount: number;
  /** Especialistas do Crew ativos/concluídos neste turno. */
  subagents: SubagentInfo[];
  /** Última atividade do turno (client clock) — detecta "ainda pensando"
   *  quando o provider fica quieto por alguns segundos. */
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

/** Aviso vindo do servidor (notification.show — a "espinha" que o desktop usa
 *  p/ créditos e avisos operacionais). */
export interface ChatNotice {
  key: string;
  text: string;
  level: "info" | "warn" | "error";
}

/** Overrides POR SESSÃO enviados no session.create — o mesmo contrato do
 *  composer do desktop ("ships model/effort on every session.create",
 *  tui_gateway/server.py:4939). Nunca escreve config global. */
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
}

/** Campos ao vivo do session.info (refletem troca de modelo/tier na sessão). */
export interface SessionLiveInfo {
  model?: string;
  /** Bypass de aprovações EFETIVO (config off ∨ yolo da sessão) — session.info. */
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
export function useChatSession(
  resumeId: string | null,
  freshNonce = 0,
  /** Workspace (projeto) da conversa NOVA — vai no session.create {cwd}; o
   *  gateway persiste como o workspace da sessão. Ignorado em resume. */
  cwd?: string,
  /** Segura a conexão até o chamador resolver dependências (ex.: o root
   *  absoluto do workspace ou o tier atual) — evita criar a sessão errada. */
  enabled = true,
  /** Modelo/esforço POR SESSÃO (contrato do desktop). O chamador DEVE passar
   *  uma referência estável (state/memo) — o objeto entra nas deps do effect. */
  overrides?: SessionCreateOverrides | null,
  /** Agente (profile) dono da conversa NOVA — vai no session.create {profile};
   *  o gateway re-vincula WAYNE_HOME àquele agente (server.py: session.create
   *  aceita `profile`). A sessão nasce e vive no state.db DO agente. */
  agentProfile?: string | null,
) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  // true assim que session.create/resume resolve e sessionIdRef está pronto —
  // gatilho pra despachar uma mensagem enfileirada (pendingSendRef).
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
  // Especialistas do Crew (subagent.* — Onda B de paridade com o desktop).
  const [subagents, setSubagents] = useState<SubagentInfo[]>([]);
  // Modelo/tier AO VIVO do session.info (reflete troca de modelo na sessão).
  const [liveInfo, setLiveInfo] = useState<SessionLiveInfo | null>(null);
  // Último instante de atividade do turno (ref — não re-renderiza por delta;
  // lido no render e re-checado pelo ticker do painel de progresso).
  const lastActivityRef = useRef<number | null>(null);
  // Avisos do servidor (notification.show/clear) — créditos, operacional.
  const [notices, setNotices] = useState<ChatNotice[]>([]);
  const noticeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const noticeSeqRef = useRef(0);

  // Estado VIVO da sessão pro sidebar (Onda 1, padrão desktop): "working" =
  // ponto pulsando (agente trabalhando), "attention" = âmbar (esperando VOCÊ —
  // approval/clarify/sudo/secret), "idle" = nada. O SidebarTasks escuta.
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
  // ── Reconexão automática (pré-Onda 3) ───────────────────────────────
  // Deploy/restart derruba o WS e a UI ficava morta até F5 ("gateway not
  // connected"). Queda inesperada → agenda reconexão com backoff; o effect
  // de conexão re-roda (reconnectNonce) e RETOMA a mesma sessão via
  // storedSessionIdRef (espelho — o state não está no closure do onState).
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const storedSessionIdRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  // Classe do último erro sinalizado por status.update "❌ ..." no turno atual.
  // Se o turno fechar vazio, o message.complete promove isso pra bolha (motivo
  // localizado) em vez de "(sem resposta)". Resetado em cada message.start.
  const turnErrorRef = useRef<"billing" | "generic" | null>(null);
  // Já avisamos a sidebar (wayne:session-started) sobre ESTA sessão? Evita
  // inserir a tarefa duas vezes. Resetado quando a sessão muda (reset effect).
  const startedDispatchedRef = useRef(false);
  // Mensagem enviada ANTES da sessão conectar (session.create ainda pendente):
  // fica aqui e é despachada assim que a sessão fica pronta — nunca se perde.
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

  // "Nova tarefa" (freshNonce++) ou trocar de conversa (resumeId muda): LIMPA o
  // transcript e todo o estado do turno ANTES de conectar/repopular. Sem isto o
  // chat é montado persistente e o `messages` (estado do componente) sobrevivia
  // — clicar "Nova tarefa" reapresentava a conversa anterior (só F5 remontava e
  // limpava). Para resume, o effect de conexão recarrega o histórico logo após.
  // useLayoutEffect: limpa antes do paint, sem flash da conversa antiga.
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
    setLiveInfo(null);
    setNotices([]);
    setStoredSessionId(null);
    setSessionReady(false);
    streamingIdRef.current = null;
    currentStepRef.current = null;
    turnErrorRef.current = null;
    startedDispatchedRef.current = false;
    pendingSendRef.current = null;
    todoTimingRef.current.clear();
    approvalQueueRef.current = [];
    // Troca REAL de sessão zera a máquina de reconexão (o espelho do id
    // durável é re-populado pelo connect; um timer pendente da sessão
    // anterior não pode reconectar a antiga).
    storedSessionIdRef.current = null;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshNonce, resumeId, cwd, agentProfile]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const gw = new GatewayClient();
    gwRef.current = gw;
    approvalQueueRef.current = [];

    const offState = gw.onState((s) => {
      setConnectionState(s);
      // Queda INESPERADA (deploy/restart do gateway; cleanup seta cancelled
      // antes de fechar): trava os envios na fila (sid nulo → pendingSendRef)
      // e agenda a reconexão com backoff exponencial (1s→15s).
      if (s === "closed" && !cancelled) {
        setSessionReady(false);
        sessionIdRef.current = null;
        const attempt = reconnectAttemptsRef.current++;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => setReconnectNonce((n) => n + 1), delay);
      }
    });

    const offMessageStart = gw.on("message.start", (ev) => {
      if (!acceptsEvent(ev)) return;
      const id = nextLocalId();
      streamingIdRef.current = id;
      turnErrorRef.current = null;
      setBusy(true);
      lastActivityRef.current = Date.now();
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

    // Raciocínio (reasoning/thinking) — acumula no turno em voo, como o
    // desktop renderiza (paridade: server emite reasoning.delta/thinking.delta
    // e o bloco final em reasoning.available / message.complete.reasoning).
    const appendReasoning = (chunk: string | undefined, replace = false) => {
      const id = streamingIdRef.current;
      if (!id || !chunk) return;
      // Raciocínio conta como atividade — senão o "Ainda pensando…" misfira
      // durante um bloco de reasoning longo (que só emite reasoning.delta).
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
    // `thinking.delta` é o texto de "carinha"/spinner do agente, NÃO raciocínio
    // real — o desktop ignora de propósito (gateway-event.ts). Nós o mandávamos
    // pro bloco de Raciocínio e poluía com ruído. Ignorado (paridade).
    const offThinkingDelta = gw.on<ReasoningDeltaPayload>("thinking.delta", () => {});
    const offReasoningAvailable = gw.on<ReasoningDeltaPayload>("reasoning.available", (ev) => {
      if (!acceptsEvent(ev)) return;
      appendReasoning(ev.payload?.text, true);
    });

    // "Preparando ferramenta" — o modelo está montando a chamada (efêmero;
    // tool.start/status.update substituem em seguida).
    const offToolGenerating = gw.on<ToolGeneratingPayload>("tool.generating", (ev) => {
      if (!acceptsEvent(ev)) return;
      const name = ev.payload?.name;
      if (name) setStatusText(t.chat.preparingTool.replace("{name}", name));
    });

    // Crew: ciclo de vida dos subagentes (payload rico — modelo, tokens,
    // duração; ver tui_gateway/server.py:3464-3526).
    type SubagentPayload = {
      subagent_id?: string;
      label?: string;
      task?: string;
      model?: string;
      status?: string;
      duration_seconds?: number;
      input_tokens?: number;
      output_tokens?: number;
      tool_count?: number;
    };
    const offSubStart = gw.on<SubagentPayload>("subagent.start", (ev) => {
      const p = ev.payload;
      const id = p?.subagent_id;
      if (!id) return;
      lastActivityRef.current = Date.now();
      const label = p?.label || p?.task || p?.model || id;
      setSubagents((prev) => [
        ...prev.filter((s) => s.id !== id),
        { id, label, model: p?.model, status: "running", startedAt: Date.now() },
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

    // subagent.text — a PROSA que o especialista produz. Em modo Crew, a
    // resposta pode vir por aqui em vez de message.delta (o agente principal
    // delega e não re-escreve). Sem tratar isto, o turno ficava VAZIO ("Wayne
    // Crew" sem conteúdo — o "travou" que o Leonardo viu). Anexamos ao turno
    // em voo. SEM acceptsEvent: subagent.* podem vir com o session_id do FILHO.
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

    // Avisos do servidor (créditos/operacional) — espinha usada pelo desktop.
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

    // `review.summary` — o agente registra o que aprendeu (memória/skill) ao
    // fim do turno. O desktop mostra isso como linha de sistema; nós dropávamos
    // silenciosamente (o usuário nunca sabia). Vira uma linha meta discreta.
    const offReview = gw.on<{ text?: string; summary?: string }>("review.summary", (ev) => {
      if (!acceptsEvent(ev)) return;
      const text = ev.payload?.text ?? ev.payload?.summary;
      if (!text) return;
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId(), role: "system", content: text, toolCalls: [] },
      ]);
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
            // Turno fechou sem TEXTO final de resposta e um erro foi sinalizado
            // (ex.: 402)? Marca a classe pra bolha mostrar um motivo localizado.
            // Cobre tanto a bolha 100% vazia quanto o caso "rodou ferramentas e
            // depois falhou na síntese" (aí há tools, mas nenhum texto final).
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
      // Falha de turno chega como status.update "❌ ..." (conversation_loop
      // _emit_status). É efêmero (some quando o turno fecha), então guardamos a
      // CLASSE — nunca o texto cru, que carrega a URL/hash da chave do provedor.
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
      if (p?.title) {
        setTitle(p.title);
        // A sidebar (SidebarTasks) usa REST e não escuta o gateway — avisa via
        // evento pra ela recarregar o título auto (paridade: título ao vivo).
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

        // Reconexão de uma tarefa NOVA (sem ?resume na URL) retoma a MESMA
        // sessão pelo id durável espelhado — nunca cria uma segunda sessão.
        const resumeTarget = resumeId ?? storedSessionIdRef.current;

        if (resumeTarget) {
          const [history, resumed] = await Promise.all([
            api.getSessionMessages(resumeTarget).catch(() => null),
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
            // Conversa COM um agente específico: a sessão nasce no WAYNE_HOME dele.
            ...(agentProfile ? { profile: agentProfile } : {}),
            // Overrides POR SESSÃO (contrato do desktop) — nunca config global.
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
        // Conexão/handshake falhou (máquina ainda subindo pós-deploy?):
        // tenta de novo com o mesmo backoff — sem F5.
        if (!cancelled) {
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
      const timers = noticeTimersRef.current;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      gw.close();
      gwRef.current = null;
      sessionIdRef.current = null;
    };
  }, [resumeId, freshNonce, reconnectNonce, cwd, enabled, overrides, agentProfile, t, acceptsEvent, applyTodos]);

  const sendMessage = useCallback(
    (text: string, images?: string[]) => {
      const gw = gwRef.current;
      const sid = sessionIdRef.current;
      const trimmed = text.trim();
      if (!trimmed || busy || pendingPrompt) return;
      // Sessão ainda conectando (session.create pendente)? Enfileira e despacha
      // quando ficar pronta — antes isto caía no early-return e a msg sumia
      // (Composer limpava o texto). Nunca mais perder mensagem por timing.
      if (!gw || !sid) {
        pendingSendRef.current = { text: trimmed, images };
        return;
      }
      // 1ª mensagem de uma tarefa NOVA (não é resume): avisa a sidebar na hora
      // pra a tarefa aparecer em "Tarefas" com a 1ª msg como título provisório
      // (padrão ChatGPT/Manus) — sem esperar o servidor auto-titular. O título
      // real substitui via wayne:session-titled. Dedupe por id na sidebar.
      if (!resumeId && !startedDispatchedRef.current && storedSessionId) {
        startedDispatchedRef.current = true;
        window.dispatchEvent(
          new CustomEvent("wayne:session-started", {
            detail: { id: storedSessionId, title: trimmed.slice(0, 140), cwd: cwd ?? null },
          }),
        );
      }
      setError(null);
      setBusy(true);
      // Fresh task view per request.
      todoTimingRef.current.clear();
      currentStepRef.current = null;
      setSteps([]);
      setStatusText(null);
      setToolCount(0);
      setSubagents([]);
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
      void gw.request("prompt.submit", { session_id: sid, text: trimmed }).catch((err) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : String(err));
      });
    },
    [busy, pendingPrompt, resumeId, storedSessionId, cwd],
  );

  // Sessão ficou pronta e há uma mensagem enfileirada (enviada antes de conectar)
  // → despacha agora. `sendMessage` já tem storedSessionId no closure neste ponto
  // (setado no mesmo commit que sessionReady), então o insert otimista sai certo.
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

  // Anexo NÃO-imagem (PDF, doc, csv…) — `file.attach` foi desenhado pro nosso
  // caso remoto (server.py:9461: "the client uploads data_url bytes and we
  // materialize the file on the gateway"); vira um @file: que o agente lê.
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

  // Orientar SEM interromper (session.steer): o texto cai no próximo resultado
  // de ferramenta e o modelo o vê na iteração seguinte — não cria turno novo.
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

  // Desfaz o último turno (server exige turno parado) e espelha o corte local.
  const undoTurn = useCallback(async (): Promise<boolean> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return false;
    try {
      await gw.request("session.undo", { session_id: sid });
      setMessages((prev) => {
        const next = [...prev];
        while (next.length && next[next.length - 1].role !== "user") next.pop();
        if (next.length) next.pop(); // a própria mensagem do usuário
        return next;
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  // Compacta a conversa e recarrega o transcript persistido (costurado).
  const compressChat = useCallback(async (): Promise<boolean> => {
    const gw = gwRef.current;
    const sid = sessionIdRef.current;
    if (!gw || !sid) return false;
    try {
      await gw.request("session.compress", { session_id: sid });
      const stored = resumeId ?? storedSessionId;
      if (stored) {
        const history = await api.getSessionMessages(stored).catch(() => null);
        if (history) setMessages(stitchHistory(history.messages));
      }
      return true;
    } catch {
      return false;
    }
  }, [resumeId, storedSessionId]);

  // ── Autocomplete de composer (paridade desktop): / e @ ──────────────
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
  // Executa um /comando (slash.exec) — eco do comando + saída como linha de
  // sistema. Alguns comandos já têm botão nativo; isto cobre o resto (/help,
  // /skills, etc.). Retorna a saída p/ o chamador decidir.
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

  // Ocupação da janela de contexto (session.context_breakdown) — o medidor
  // que o desktop mostra; alimenta o popover de Utilização.
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

  // Ramifica a conversa numa sessão nova; retorna o id pra navegar.
  /** Liga/desliga o bypass de aprovações SÓ NESTA SESSÃO (o Shift+Tab do
   *  TUI) — RPC config.set key=yolo scope=session; nunca toca config global
   *  nem cron. O session.info reflete (liveInfo.yolo). */
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
      // Antes engolia em silêncio (return null) — quem chamava não tinha como
      // saber POR QUE falhou (ex.: "nothing to branch — send a message
      // first" numa sessão recém-resumida). Surfaça no banner de erro já
      // existente (error ?? attachError em NativeChatPage) em vez de sumir.
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
    liveInfo,
    notices,
    dismissNotice,
    storedSessionId,
    /** true assim que session.create/resume resolve — gatilho seguro pra
     *  disparar ações que precisam da sessão pronta (ex.: ?branch=1). */
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
