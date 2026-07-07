import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifyProvisionerSig } from "@/lib/provisioner";

export const dynamic = "force-dynamic";

// Callback do serviço provisionador: quando o app Fly do tenant termina de
// subir, grava a URL/credenciais na instância e marca 'ready' (ou 'failed').
// Autenticado por HMAC do corpo — o provisionador é o único que conhece a
// chave compartilhada.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-provisioner-sig") ?? "";
  if (!verifyProvisionerSig(raw, sig)) {
    return NextResponse.json({ error: "bad_sig" }, { status: 401 });
  }
  let body: {
    tenantId: string; ok: boolean; app?: string; url?: string;
    dashboardUsername?: string; dashboardPassword?: string; openrouterKeyHash?: string; error?: string;
  };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const database = db();
  if (!body.ok) {
    await database.execute(sql`UPDATE instances SET status='failed', notes=${"Falha: " + (body.error ?? "desconhecida")} WHERE tenant_id=${body.tenantId}`);
    return NextResponse.json({ ok: true });
  }

  await database.execute(sql`
    UPDATE instances SET
      url=${body.url ?? ""},
      fly_app=${body.app ?? null},
      dashboard_username=${body.dashboardUsername ?? null},
      dashboard_password=${body.dashboardPassword ?? null},
      status='ready', last_active=now()
    WHERE tenant_id=${body.tenantId}
  `);
  if (body.openrouterKeyHash) {
    // Grava o hash da chave de trial do onboarding — MAS só se a ativação de
    // plano ainda não injetou uma chave paga (key_injected_at NULL). Sem isso, o
    // callback do onboarding poderia clobberar a chave paga na corrida.
    await database.execute(
      sql`UPDATE billing SET openrouter_key_hash=${body.openrouterKeyHash} WHERE tenant_id=${body.tenantId} AND key_injected_at IS NULL`,
    );
  }
  return NextResponse.json({ ok: true });
}
