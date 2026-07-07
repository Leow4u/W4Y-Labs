import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDevSession } from "@/lib/dev-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Plano do tenant logado — fonte para o gating de tier na TierPicker do agente
// (Expert=Pro+, Crew=Max). Lido AO VIVO da casca (a plataforma é dona do plano;
// a instância Wayne não o guarda). A SPA do agente busca isto via mesma origem
// (`work4you.ai`), então o cookie de sessão viaja junto e o LB roteia /planos*
// para a casca. Sem sessão / sem linha de billing → "free" (fail-safe).
export async function GET() {
  const session = await getDevSession();
  if (!session) return NextResponse.json({ plan: "free", status: "inactive" });

  let plan = "free";
  let status = "inactive";
  try {
    const r = await db().execute<{ plan: string; status: string }>(
      sql`SELECT plan, status FROM billing WHERE tenant_id=${session.tenantId}`,
    );
    if (r.rows[0]) {
      plan = r.rows[0].plan;
      status = r.rows[0].status;
    }
  } catch {
    /* registry indisponível → trata como free */
  }
  return NextResponse.json({ plan, status });
}
