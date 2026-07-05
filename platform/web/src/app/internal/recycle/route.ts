import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requestArchive } from "@/lib/provisioner";

export const dynamic = "force-dynamic";

// Reciclagem de tenants Free inativos (chamado pelo Cloud Scheduler, diário).
// Free (billing.plan='free') + status='ready' + sem atividade há >30 dias →
// arquiva: o provisionador tira snapshot e destrói o app Fly (zera custo de
// máquina + volume). Restaurável do snapshot. Autenticado por header secreto.
const INACTIVE_DAYS = Number(process.env.RECYCLE_INACTIVE_DAYS ?? "30");

export async function POST(req: NextRequest) {
  const secret = process.env.RECYCLE_SECRET?.trim();
  if (!secret || req.headers.get("x-recycle-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const database = db();
  let candidates: { tenant_id: string; fly_app: string | null }[] = [];
  try {
    const r = await database.execute<{ tenant_id: string; fly_app: string | null }>(sql`
      SELECT i.tenant_id, i.fly_app
      FROM instances i JOIN billing b ON b.tenant_id = i.tenant_id
      WHERE b.plan = 'free' AND i.status = 'ready'
        AND i.last_active < now() - (${INACTIVE_DAYS} || ' days')::interval
        AND i.tenant_id <> 'dev-tenant'
    `);
    candidates = r.rows;
  } catch (e) {
    return NextResponse.json({ error: "query_failed", detail: String((e as Error).message) }, { status: 500 });
  }

  const archived: string[] = [];
  const falhou: string[] = [];
  for (const c of candidates) {
    if (!c.fly_app) continue;
    const ok = await requestArchive(c.fly_app);
    if (ok) {
      await database.execute(sql`UPDATE instances SET status='archived', notes='Arquivado por inatividade' WHERE tenant_id=${c.tenant_id}`);
      archived.push(c.tenant_id);
    } else {
      falhou.push(c.tenant_id);
    }
  }
  return NextResponse.json({ ok: true, considerados: candidates.length, arquivados: archived, falhas: falhou });
}
