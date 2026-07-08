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
