import "server-only";

import { sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { PLANS, type Plan } from "@/lib/billing";
import { requestEnsureKey } from "@/lib/provisioner";

/** Tenants pagos activos cuja chave capada ainda não chegou à máquina Fly. */
export interface PendingKeyInjection {
  tenantId: string;
  plan: string;
  flyApp: string | null;
  /** Minutos desde updated_at do billing (para alertas de stale). */
  staleMinutes: number;
}

export type ReconcileAlertLevel = "ok" | "warning" | "critical";

export interface ReconcileResult {
  ok: true;
  pendentes: number;
  reparados: string[];
  falhas: string[];
  alert: boolean;
  alertLevel: ReconcileAlertLevel;
  stale: string[];
}

/** Limite (min) acima do qual key_injected_at NULL vira alerta critical. */
export const STALE_KEY_INJECTION_MINUTES = 15;

export async function findPendingKeyInjections(
  database: ReturnType<typeof db>,
  limit = 50,
): Promise<PendingKeyInjection[]> {
  const r = await database.execute<{
    tenant_id: string;
    plan: string;
    fly_app: string | null;
    stale_minutes: number;
  }>(sql`
    SELECT b.tenant_id, b.plan, i.fly_app,
           GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(b.updated_at, i.created_at))) / 60)::int AS stale_minutes
    FROM billing b JOIN instances i ON i.tenant_id = b.tenant_id
    WHERE b.status = 'active' AND b.plan <> 'free'
      AND b.key_injected_at IS NULL
      AND i.fly_app IS NOT NULL AND i.status = 'ready'
    ORDER BY b.updated_at ASC NULLS FIRST
    LIMIT ${limit}
  `);
  return r.rows.map((row) => ({
    tenantId: row.tenant_id,
    plan: row.plan,
    flyApp: row.fly_app,
    staleMinutes: Math.max(0, Math.floor(Number(row.stale_minutes) || 0)),
  }));
}

function computeAlertLevel(reparados: string[], falhas: string[], stale: string[]): ReconcileAlertLevel {
  if (falhas.length > 0 || stale.length > 0) return "critical";
  if (reparados.length > 0) return "warning";
  return "ok";
}

/** @internal exported for contract tests */
export const computeReconcileAlertLevel = computeAlertLevel;

/** Repara injecções pendentes via provisionador /ensure-key (idempotente). */
export async function reconcilePendingKeys(
  database: ReturnType<typeof db>,
  pending: PendingKeyInjection[],
): Promise<ReconcileResult> {
  const reparados: string[] = [];
  const falhou: string[] = [];
  const stale = pending
    .filter((p) => p.staleMinutes >= STALE_KEY_INJECTION_MINUTES)
    .map((p) => p.tenantId);

  for (const p of pending) {
    const credits = PLANS[p.plan as Plan]?.creditsUsd ?? 0;
    if (!p.flyApp || credits <= 0) continue;
    const hash = await requestEnsureKey(p.flyApp, p.tenantId, credits);
    if (hash) {
      await database.execute(
        sql`UPDATE billing SET openrouter_key_hash=${hash}, key_injected_at=now(), updated_at=now() WHERE tenant_id=${p.tenantId}`,
      );
      reparados.push(p.tenantId);
    } else {
      falhou.push(p.tenantId);
    }
  }

  const level = computeAlertLevel(reparados, falhou, stale);
  const alert = level !== "ok";

  if (falhou.length) {
    console.error(`[reconcile-keys] CRITICAL falhas=${falhou.join(",")}`);
  }
  if (stale.length) {
    console.error(
      `[reconcile-keys] CRITICAL stale>${STALE_KEY_INJECTION_MINUTES}m tenants=${stale.join(",")}`,
    );
  }
  if (reparados.length) {
    console.warn(`[reconcile-keys] reparados=${reparados.join(",")}`);
  }

  return {
    ok: true,
    pendentes: pending.length,
    reparados,
    falhas: falhou,
    alert,
    alertLevel: level,
    stale,
  };
}
