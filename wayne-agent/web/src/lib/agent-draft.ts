/**
 * agent-draft — the brain behind the Agents "Início rápido" (Onda 1): turns
 * the user's natural-language request into an editable agent CONFIGURATION
 * (name, specialty, soul, model, routine).
 *
 * Zero new backend: opens a THROWAWAY session on the gateway (the same
 * protocol as the chat), runs ONE turn on the fast model (gemini flash, low)
 * instructed to answer with JSON ONLY, parses it and DELETES the session (so
 * it doesn't pollute "Recentes"). Same ephemeral-client pattern as usage.account.
 */
import { api } from "@/lib/api";
import { GatewayClient } from "@/lib/gatewayClient";
import { DEFAULT_SCHEDULE_STATE, type ScheduleBuilderState, type Weekday } from "@/lib/schedule";

export interface AgentRoutineDraft {
  /** Structured schedule (same as the Cron screen's composer — free
   *  freq/time/day). Becomes a backend string via buildScheduleString on create. */
  schedule: ScheduleBuilderState;
  /** What the agent does when the routine fires. */
  prompt: string;
}

export interface AgentDraft {
  name: string;
  specialty: string;
  soul: string;
  model: string;
  /** An agent can have SEVERAL routines (different contexts — e.g. post at
   *  9am + send e-mail at noon). Each item becomes its own cron job. */
  routines: AgentRoutineDraft[];
  /** Squad templates: the agent is born with an AREA and named subagent
   *  ROLES (team.json sidecar) — the delegate crew it commands. */
  team?: {
    area: string;
    subagents: { name: string; role: string; icon: string }[];
  };
}

/** Default schedule for a new routine (every day at 9am) — the starting point
 *  for "+ Adicionar rotina" and the fallback for the LLM draft. */
export function defaultRoutineSchedule(): ScheduleBuilderState {
  return { ...DEFAULT_SCHEDULE_STATE, mode: "daily", timeOfDay: "09:00" };
}

/** Converts the routine the LLM proposes (frequency + time + day) into the
 *  structured schedule. Defensive: any invalid field falls back to daily 9am. */
function scheduleFromLLM(raw: unknown): ScheduleBuilderState {
  const r = (raw ?? {}) as {
    frequency?: string;
    time?: string;
    weekdays?: unknown;
    day?: unknown;
  };
  const time = typeof r.time === "string" && /^\d{1,2}:\d{2}$/.test(r.time) ? r.time : "09:00";
  if (r.frequency === "weekly") {
    const wd = (Array.isArray(r.weekdays) ? r.weekdays : [])
      .filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6)
      .map((n) => n as Weekday);
    return { ...DEFAULT_SCHEDULE_STATE, mode: "weekly", timeOfDay: time, weekdays: wd.length ? wd : [1] };
  }
  if (r.frequency === "weekdays") {
    return { ...DEFAULT_SCHEDULE_STATE, mode: "weekly", timeOfDay: time, weekdays: [1, 2, 3, 4, 5] };
  }
  if (r.frequency === "monthly") {
    const d = Number.isInteger(r.day) && (r.day as number) >= 1 && (r.day as number) <= 31 ? (r.day as number) : 1;
    return { ...DEFAULT_SCHEDULE_STATE, mode: "monthly", timeOfDay: time, dayOfMonth: d };
  }
  return { ...DEFAULT_SCHEDULE_STATE, mode: "daily", timeOfDay: time };
}

/** Instruction for the throwaway turn — pt-BR, strict JSON output. */
function buildInstruction(request: string, current?: AgentDraft, refinement?: string): string {
  const base = `Você é o assistente de criação de agentes da Work4You. NÃO use ferramentas. Responda SOMENTE com um objeto JSON válido (sem markdown, sem cercas de código, sem comentários) exatamente neste formato:
{"name": "nome curto do agente (ex.: Agente de Marketing)", "specialty": "1 a 2 frases do que ele faz", "soul": "instruções de sistema completas em português, segunda pessoa (Você é...), com responsabilidades, tom e como estruturar entregas — 1 a 3 parágrafos", "model": "slug OpenRouter mais adequado à função (ex.: google/gemini-3.5-flash para tarefas rápidas/volume; anthropic/claude-sonnet-5 para análise/escrita profunda; google/gemini-2.5-flash-image-preview para criação de imagens)", "routines": [] OU uma lista de rotinas, cada uma {"frequency": "daily"|"weekdays"|"weekly"|"monthly", "time": "HH:MM em 24h (ex.: 09:00)", "weekdays": [0-6, 0=domingo, só se frequency=weekly], "day": 1-31 (só se frequency=monthly), "prompt": "o que executar quando ESTA rotina disparar"}}
Um agente pode ter VÁRIAS rotinas em horários/contextos diferentes (ex.: "postar às 9h" e "mandar e-mail às 12h" = duas rotinas). Inclua uma entrada por recorrência que o pedido mencionar; lista vazia [] se não houver nenhuma. Deduza a hora/dia de cada uma; se não vier, use 09:00.`;
  if (current && refinement) {
    return `${base}
Configuração atual: ${JSON.stringify(current)}
Ajuste pedido pelo usuário: ${refinement}
Devolva o JSON COMPLETO já ajustado.`;
  }
  return `${base}
Pedido do usuário: ${request}`;
}

/** Extracts the first plausible JSON object from the model's text. */
function parseDraft(text: string): AgentDraft | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as {
      name?: unknown;
      specialty?: unknown;
      soul?: unknown;
      model?: unknown;
      routines?: unknown;
      routine?: unknown;
    };
    if (!raw || typeof raw.name !== "string" || typeof raw.soul !== "string") return null;
    // Accepts `routines` (list, new) or `routine` (single object, compat).
    const rawList = Array.isArray(raw.routines)
      ? raw.routines
      : raw.routine && typeof raw.routine === "object"
        ? [raw.routine]
        : [];
    const routines: AgentRoutineDraft[] = rawList
      .filter((r): r is object => Boolean(r) && typeof r === "object")
      .map((r) => ({
        schedule: scheduleFromLLM(r),
        prompt: String((r as { prompt?: unknown }).prompt ?? ""),
      }));
    return {
      name: raw.name.trim().slice(0, 60),
      specialty: String(raw.specialty ?? "").trim().slice(0, 280),
      soul: raw.soul.trim(),
      model: String(raw.model ?? "google/gemini-3.5-flash").trim(),
      routines,
    };
  } catch {
    return null;
  }
}

/**
 * Generates (or refines) an agent draft. Throwaway session: flash + low,
 * one turn, deleted from history at the end. Throws on timeout/parse-fail.
 */
export async function draftAgent(
  request: string,
  current?: AgentDraft,
  refinement?: string,
): Promise<AgentDraft> {
  const gw = new GatewayClient();
  let storedId: string | null = null;
  try {
    await gw.connect();
    const created = await gw.request<{ session_id: string; stored_session_id?: string }>(
      "session.create",
      {
        title: "Rascunho de agente",
        model: "google/gemini-3.5-flash",
        provider: "openrouter",
        reasoning_effort: "low",
      },
    );
    storedId = created.stored_session_id ?? null;

    const text = await new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        off();
        reject(new Error("draft timeout"));
      }, 90_000);
      const off = gw.on<{ text?: string; status?: string }>("message.complete", (ev) => {
        // Only the turn from OUR throwaway session.
        if ((ev as { session_id?: string }).session_id !== created.session_id) return;
        window.clearTimeout(timer);
        off();
        resolve(ev.payload?.text ?? "");
      });
      void gw
        .request("prompt.submit", {
          session_id: created.session_id,
          text: buildInstruction(request, current, refinement),
        })
        .catch((e) => {
          window.clearTimeout(timer);
          off();
          reject(e instanceof Error ? e : new Error(String(e)));
        });
    });

    const draft = parseDraft(text);
    if (!draft) throw new Error("draft parse failed");
    return draft;
  } finally {
    gw.close();
    // Clears the draft from history (best-effort — does not block the flow).
    if (storedId) void api.deleteSession(storedId).catch(() => {});
  }
}
