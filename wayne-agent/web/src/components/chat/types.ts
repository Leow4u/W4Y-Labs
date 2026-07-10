import type { SessionMessage } from "@/lib/api";

/**
 * Normalized chat shape both the persisted history (`SessionMessage`, from
 * `GET /api/sessions/{id}/messages`) and the live gateway events
 * (`message.*`/`tool.*`) convert into. The two wire formats are genuinely
 * different (`id` vs `tool_id`, `function.arguments` string vs `args`
 * object) — this is the seam so render components only ever see one shape.
 */
export type ChatRole = "user" | "assistant" | "system" | "tool";

export type ToolCallStatus = "running" | "done" | "error";

export interface ToolCallState {
  id: string;
  name: string;
  /** Formatted JSON args (history) or the live `context`/`args_text` label. */
  argsPreview?: string;
  status: ToolCallStatus;
  result?: string;
  error?: string;
  durationS?: number;
  inlineDiff?: string;
  /** Todo step (plan item) this tool ran under — set live by the reducer from
   *  the step that was `in_progress` when the tool started. Lets the chat
   *  nest tool lines under their plan step, like the reference (Manus). */
  stepId?: string;
}

/**
 * An assistant turn is a sequence of interleaved blocks — text the model
 * narrated and tool activity — in arrival order, so the UI shows "narrate →
 * run tool → narrate → run tool" like the reference (Manus), instead of all
 * text then a lump of tools. Built live by the reducer; history messages have
 * no blocks (fall back to content + toolCalls).
 */
export type ChatBlock =
  | { kind: "text"; id: string; text: string }
  | { kind: "tool"; tool: ToolCallState };

export interface ChatMessage {
  /** Stable React list key. */
  id: string;
  role: ChatRole;
  content: string | null;
  toolCalls: ToolCallState[];
  /** Ordered interleaved blocks (assistant, live). Absent on history. */
  blocks?: ChatBlock[];
  /** For role:"tool" messages — matches `SessionMessage.tool_name`. */
  toolName?: string;
  streaming?: boolean;
  timestamp?: number;
  /** Imagens anexadas a esta mensagem do usuário (paths relativos ao root de
   *  arquivos — renderizadas via /api/files/read). Só no turno ao vivo. */
  images?: string[];
  /** Raciocínio do modelo (reasoning/thinking) — bloco colapsável no chat.
   *  Alimentado por reasoning.delta/thinking.delta/reasoning.available e pelo
   *  `reasoning` do message.complete (paridade com o desktop). */
  reasoning?: string;
  /** Turno terminou sem conteúdo por causa de um erro que o gateway sinalizou
   *  via status.update "❌ ..." (ex.: HTTP 402 do provedor). Nunca guardamos o
   *  texto cru do provedor (vaza URL/hash da chave) — só a classe do erro, que
   *  o MessageBubble mapeia para uma mensagem localizada e segura. */
  errorKind?: "billing" | "generic";
}

/** A task step for the progress chip. Timing is clocked client-side (the
 *  protocol carries none for todos) — startedAt on first in_progress, frozen
 *  durationS when it completes. */
export interface TaskStep {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  startedAt?: number;
  durationS?: number;
}

function formatArgs(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function toolCallFromHistory(tc: {
  id: string;
  function: { name: string; arguments: string };
}): ToolCallState {
  return {
    id: tc.id,
    name: tc.function.name,
    argsPreview: formatArgs(tc.function.arguments),
    // Historical tool_calls are always resolved by definition — the result
    // (if any) arrives as a separate role:"tool" SessionMessage right after,
    // not attached here. Matches today's ToolCallBlock behavior.
    status: "done",
  };
}

/**
 * `SessionMessage.content` is typed `string | null`, but the backend can
 * legitimately persist a multimodal parts array (from `/image`/`/paste`) —
 * see `wayne_state.py:_decode_content`. Coercing non-string content to
 * `null` here (rather than passing it through) avoids a real crash in
 * `Markdown`'s `.split("\n")` on a non-string. Image rendering is a known
 * gap, deliberately out of scope for v1 — this just fails safe instead of
 * throwing.
 */
export function fromSessionMessage(
  msg: SessionMessage,
  index: number,
): ChatMessage {
  return {
    id: `hist-${index}`,
    role: msg.role,
    content: typeof msg.content === "string" ? msg.content : null,
    toolCalls: (msg.tool_calls ?? []).map(toolCallFromHistory),
    toolName: msg.tool_name,
    timestamp: msg.timestamp,
  };
}

/**
 * Converte o histórico persistido COSTURANDO os resultados de ferramenta de
 * volta às suas chamadas: cada `role:"tool"` carrega `tool_call_id` — o
 * resultado entra no `ToolCallState` correspondente da mensagem do assistente
 * (como no turno ao vivo) e a mensagem-resultado some da lista. Sem isto, o
 * transcript retomado despeja JSON/traceback cru como texto de conversa
 * (visto ao vivo na curadoria). Tool sem par fica na lista (vira ToolLine
 * avulsa no render).
 */
export function stitchHistory(messages: SessionMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const byCallId = new Map<string, ToolCallState>();
  messages.forEach((msg, index) => {
    if (msg.role === "tool" && msg.tool_call_id) {
      const call = byCallId.get(msg.tool_call_id);
      if (call) {
        if (typeof msg.content === "string" && msg.content) {
          call.result = msg.content;
        }
        return; // costurado — não vira linha própria no transcript
      }
    }
    const cm = fromSessionMessage(msg, index);
    for (const tc of cm.toolCalls) byCallId.set(tc.id, tc);
    out.push(cm);
  });
  return out;
}
