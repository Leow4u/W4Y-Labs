/**
 * agent-draft — o cérebro do "Início rápido" de Agentes (Onda 1): transforma
 * o pedido do usuário em linguagem natural numa CONFIGURAÇÃO de agente
 * editável (nome, especialidade, alma, modelo, rotina).
 *
 * Zero backend novo: abre uma sessão DESCARTÁVEL no gateway (o mesmo
 * protocolo do chat), roda UM turno no modelo rápido (gemini flash, low)
 * instruído a responder SÓ JSON, parseia e APAGA a sessão (pra não poluir
 * Recentes). Mesmo padrão de client efêmero do usage.account.
 */
import { api } from "@/lib/api";
import { GatewayClient } from "@/lib/gatewayClient";
import { DEFAULT_SCHEDULE_STATE, type ScheduleBuilderState, type Weekday } from "@/lib/schedule";

export interface AgentRoutineDraft {
  /** Agenda estruturada (mesma do compositor da tela de Cron — freq/hora/dia
   *  livres). Vira string de backend via buildScheduleString na hora de criar. */
  schedule: ScheduleBuilderState;
  /** O que o agente faz quando a rotina dispara. */
  prompt: string;
}

export interface AgentDraft {
  name: string;
  specialty: string;
  soul: string;
  model: string;
  /** Um agente pode ter VÁRIAS rotinas (contextos diferentes — ex.: postar às
   *  9h + mandar e-mail às 12h). Cada item vira um cron job próprio. */
  routines: AgentRoutineDraft[];
}

/** Agenda padrão de uma rotina nova (todo dia às 9h) — ponto de partida do
 *  "+ Adicionar rotina" e fallback do rascunho do LLM. */
export function defaultRoutineSchedule(): ScheduleBuilderState {
  return { ...DEFAULT_SCHEDULE_STATE, mode: "daily", timeOfDay: "09:00" };
}

/** Converte a rotina que o LLM propõe (frequência + hora + dia) na agenda
 *  estruturada. Defensivo: qualquer campo inválido cai no padrão diário 9h. */
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

/** Instrução do turno descartável — pt-BR, saída JSON estrita. */
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

/** Extrai o primeiro objeto JSON plausível do texto do modelo. */
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
    // Aceita `routines` (lista, novo) ou `routine` (objeto único, compat).
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
 * Gera (ou refina) um rascunho de agente. Sessão descartável: flash + low,
 * um turno, apaga do histórico ao final. Lança em timeout/parse-fail.
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
        // Só o turno da NOSSA sessão descartável.
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
    // Limpa o rascunho do histórico (best-effort — não bloqueia o fluxo).
    if (storedId) void api.deleteSession(storedId).catch(() => {});
  }
}
