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

export interface AgentRoutineDraft {
  /** Preset de agenda (expr de cron real em ROUTINE_PRESETS). */
  preset: "daily_9" | "weekdays_8" | "weekly_mon_9";
  /** O que o agente faz quando a rotina dispara. */
  prompt: string;
}

export interface AgentDraft {
  name: string;
  specialty: string;
  soul: string;
  model: string;
  routine: AgentRoutineDraft | null;
}

export const ROUTINE_PRESETS: Record<AgentRoutineDraft["preset"], { expr: string }> = {
  daily_9: { expr: "0 9 * * *" },
  weekdays_8: { expr: "0 8 * * 1-5" },
  weekly_mon_9: { expr: "0 9 * * 1" },
};

/** Instrução do turno descartável — pt-BR, saída JSON estrita. */
function buildInstruction(request: string, current?: AgentDraft, refinement?: string): string {
  const base = `Você é o assistente de criação de agentes da Work4You. NÃO use ferramentas. Responda SOMENTE com um objeto JSON válido (sem markdown, sem cercas de código, sem comentários) exatamente neste formato:
{"name": "nome curto do agente (ex.: Agente de Marketing)", "specialty": "1 a 2 frases do que ele faz", "soul": "instruções de sistema completas em português, segunda pessoa (Você é...), com responsabilidades, tom e como estruturar entregas — 1 a 3 parágrafos", "model": "slug OpenRouter mais adequado à função (ex.: google/gemini-3.5-flash para tarefas rápidas/volume; anthropic/claude-sonnet-5 para análise/escrita profunda; google/gemini-2.5-flash-image-preview para criação de imagens)", "routine": null OU {"preset": "daily_9"|"weekdays_8"|"weekly_mon_9", "prompt": "o que executar quando a rotina disparar"}}
Só inclua routine se o pedido indicar recorrência (diário, toda segunda, etc.).`;
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
    const raw = JSON.parse(text.slice(start, end + 1)) as Partial<AgentDraft>;
    if (!raw || typeof raw.name !== "string" || typeof raw.soul !== "string") return null;
    const routine =
      raw.routine && typeof raw.routine === "object" && (raw.routine as AgentRoutineDraft).preset in ROUTINE_PRESETS
        ? {
            preset: (raw.routine as AgentRoutineDraft).preset,
            prompt: String((raw.routine as AgentRoutineDraft).prompt ?? ""),
          }
        : null;
    return {
      name: raw.name.trim().slice(0, 60),
      specialty: String(raw.specialty ?? "").trim().slice(0, 280),
      soul: raw.soul.trim(),
      model: String(raw.model ?? "google/gemini-3.5-flash").trim(),
      routine,
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
