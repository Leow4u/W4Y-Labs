import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requestEnsureKey } from "@/lib/provisioner";
import { PLANS, type Plan } from "@/lib/billing";

export const dynamic = "force-dynamic";

// Reconciliador do TETO RÍGIDO (chamado pelo Cloud Scheduler, a cada poucos
// minutos). Repara tenants ATIVOS pagos cuja chave capada NÃO confirmou chegar
// na máquina Fly (billing.key_injected_at IS NULL) — ex.: a injeção falhou na
// ativação porque o provisionador estava fora ou a instância ainda estava
// provisionando. Sem isto, uma injeção falha deixaria o tenant rodando na chave
// antiga SEM teto, silenciosamente (o bug que já queimou dinheiro).
//
// O provisionador é a FONTE ÚNICA: recria a runtime key capada E injeta,
// devolvendo o hash. Idempotente p/ retry (a chave anterior, nunca injetada,
// fica órfã e inofensiva). Autenticado por header secreto (só o scheduler).
export async function POST(req: NextRequest) {
  const secret = process.env.RECONCILE_SECRET?.trim();
  if (!secret || req.headers.get("x-reconcile-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const database = db();
  let pending: { tenant_id: string; plan: string; fly_app: string | null }[] = [];
  try {
    const r = await database.execute<{ tenant_id: string; plan: string; fly_app: string | null }>(sql`
      SELECT b.tenant_id, b.plan, i.fly_app
      FROM billing b JOIN instances i ON i.tenant_id = b.tenant_id
      WHERE b.status = 'active' AND b.plan <> 'free'
        AND b.key_injected_at IS NULL
        AND i.fly_app IS NOT NULL AND i.status = 'ready'
      LIMIT 50
    `);
    pending = r.rows;
  } catch (e) {
    return NextResponse.json(
      { error: "query_failed", detail: String((e as Error).message) },
      { status: 500 },
    );
  }

  const reparados: string[] = [];
  const falhou: string[] = [];
  for (const p of pending) {
    const credits = PLANS[p.plan as Plan]?.creditsUsd ?? 0;
    if (!p.fly_app || credits <= 0) continue;
    const hash = await requestEnsureKey(p.fly_app, p.tenant_id, credits);
    if (hash) {
      await database.execute(
        sql`UPDATE billing SET openrouter_key_hash=${hash}, key_injected_at=now(), updated_at=now() WHERE tenant_id=${p.tenant_id}`,
      );
      reparados.push(p.tenant_id);
    } else {
      falhou.push(p.tenant_id);
    }
  }
  return NextResponse.json({ ok: true, pendentes: pending.length, reparados, falhas: falhou });
}
