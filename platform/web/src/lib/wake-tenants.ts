import type { Plan } from "@/lib/billing";
import { planRegime } from "@/lib/billing";

/** Path HTTP que acorda uma máquina Fly suspensa (autostart). */
export const TENANT_WAKE_PATH = "/api/auth/providers";

/** URL de wake para um app tenant Fly. */
export function tenantWakeUrl(flyApp: string, baseUrl?: string | null): string {
  const base = (baseUrl?.trim() || `https://${flyApp}.fly.dev`).replace(/\/$/, "");
  return `${base}${TENANT_WAKE_PATH}`;
}

/** Planos base (suspend/min=0) precisam de wake agendado para cron/catch-up. */
export function shouldWakeForCron(plan: string): boolean {
  return planRegime(plan as Plan) === "base";
}

export interface WakeTarget {
  tenantId: string;
  flyApp: string;
  wakeUrl: string;
  plan: string;
}

export interface WakeBatchResult {
  ok: true;
  considerados: number;
  acordados: string[];
  falhas: string[];
  ignorados: number;
  alert: boolean;
}

/** Dispara GET wake em paralelo (limitado). */
export async function wakeTargets(
  targets: WakeTarget[],
  opts?: { concurrency?: number; timeoutMs?: number },
): Promise<WakeBatchResult> {
  const concurrency = opts?.concurrency ?? 8;
  const timeoutMs = opts?.timeoutMs ?? 12000;
  const acordados: string[] = [];
  const falhou: string[] = [];

  async function poke(t: WakeTarget): Promise<void> {
    try {
      const r = await fetch(t.wakeUrl, {
        method: "GET",
        headers: { "User-Agent": "Work4You-WakeCron/1" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (r.ok || r.status === 401 || r.status === 403) {
        // 401/403 ainda acordam a máquina — a rota respondeu.
        acordados.push(t.tenantId);
      } else {
        falhou.push(t.tenantId);
      }
    } catch {
      falhou.push(t.tenantId);
    }
  }

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    await Promise.all(batch.map((t) => poke(t)));
  }

  if (falhou.length) {
    console.error(`[wake-tenants] falhas=${falhou.join(",")}`);
  }

  return {
    ok: true,
    considerados: targets.length,
    acordados,
    falhas: falhou,
    ignorados: 0,
    alert: falhou.length > 0,
  };
}
