import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getDevSession } from "@/lib/dev-auth";
import { type Plan } from "@/lib/billing";

export const dynamic = "force-dynamic";

// GET /planos/plan — plano do tenant para o gating de tiers no chat
// (TierPicker do Wayne busca same-origin com credentials; o LB roteia
// /planos* para a casca e o cookie de sessão viaja junto). Exige sessão;
// sem sessão → 401 JSON, que o TierPicker trata como plan null (fail-open
// por design: o teto real de gasto é a chave OpenRouter capada).
// Fica FORA de /api/* de propósito — mesma razão do /device/engine-key:
// no LB do domínio único, /api/* é roteado ao Wayne.
//
// Contrato (ditado pelo TierPicker — tierLocked lê estes valores):
//   { plan: "free"|"plus"|"pro"|"max", status: "inactive"|"active"|"past_due"|"canceled" }
//   · "pro"  → desbloqueia Expert          (registry: super)
//   · "max"  → desbloqueia Expert + Crew   (registry: ultra)
//   · demais → Expert/Crew travados        (registry: free/plus, repassados crus)
// O vocabulário do registry (free/plus/super/ultra) é traduzido AQUI para o
// do picker (Expert=Pro+, Crew=Business — docs/BILLING-ARQUITETURA.md §2);
// mudar o gating de plano = mudar só este mapa.
const TIER_PLAN: Partial<Record<Plan, string>> = { super: "pro", ultra: "max" };

export async function GET() {
  const session = await getDevSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const r = await db().execute<{ plan: string; status: string }>(
      sql`SELECT plan, status FROM billing WHERE tenant_id=${session.tenantId}`,
    );
    // Sem linha em billing = tenant nunca assinou → Free.
    const row = r.rows[0] ?? { plan: "free", status: "inactive" };
    const plan = TIER_PLAN[row.plan as Plan] ?? row.plan;
    return NextResponse.json(
      { plan, status: row.status },
      // Cache curto no navegador (private: por usuário) — o TierPicker busca a
      // cada mount do chat; 60s evita bater no registry a cada navegação.
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch {
    // Registry indisponível → não sabemos o plano; o TierPicker trata !ok
    // como null e NÃO trava nada (fail-open). Sem header de cache: erro
    // transitório não deve ficar 60s no navegador.
    return NextResponse.json({ error: "registry_unavailable" }, { status: 503 });
  }
}
