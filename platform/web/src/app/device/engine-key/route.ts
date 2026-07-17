import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getDevSession } from "@/lib/dev-auth";
import { PLANS, type Plan } from "@/lib/billing";
import { requestDeviceKey } from "@/lib/provisioner";

export const dynamic = "force-dynamic";

// POST /device/engine-key — entrega da CHAVE DE MODELO para o app desktop
// (pivô desktop: motor local). Exige sessão logada; o tenant vem da sessão.
// Pede ao provisionador uma runtime key OpenRouter NOVA por dispositivo
// (separada da key do Fly, mesmo limite do plano) e devolve a chave CRUA —
// única vez que ela transita: o app grava em ~/.wayne/.env e ela nunca mais
// sai do dispositivo. NUNCA logar a resposta.
// Fica FORA de /api/* de propósito: no LB do domínio único, /api/* é
// roteado ao Wayne (ver webhooks/stripe/route.ts); rotas da casca vivem
// na raiz (/planos, /onboarding, /device/...).

// Rate-limit por sessão (e-mail), janela deslizante em memória — mesmo
// padrão de login/exists. Criar key é ação rara; 1/min segura retry-loop.
const WINDOW_MS = 60_000;
const lastHit = new Map<string, number>();

function limited(who: string): boolean {
  const now = Date.now();
  const prev = lastHit.get(who) ?? 0;
  if (now - prev < WINDOW_MS) return true;
  lastHit.set(who, now);
  return false;
}

export async function POST(req: NextRequest) {
  const session = await getDevSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (limited(session.email)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  // corpo opcional: {deviceLabel} — só para identificação humana no registro
  let deviceLabel = "";
  try {
    const body = await req.json();
    deviceLabel = String(body?.deviceLabel ?? "").trim().slice(0, 60);
  } catch {
    /* sem corpo → sem label */
  }

  const database = db();

  // limite da device key = crédito do plano do tenant (registry/billing);
  // monthly_credits_usd é a fonte (inclui trial), catálogo PLANS é fallback.
  const b = await database.execute<{ plan: string; monthly_credits_usd: string | null }>(
    sql`SELECT plan, monthly_credits_usd FROM billing WHERE tenant_id=${session.tenantId}`,
  );
  const row = b.rows[0];
  const plan = (row?.plan ?? "free") as Plan;
  const fromRegistry = Number(row?.monthly_credits_usd ?? 0);
  const limitUsd = fromRegistry > 0 ? fromRegistry : (PLANS[plan]?.creditsUsd ?? 0);
  if (limitUsd <= 0) return NextResponse.json({ error: "no_credits" }, { status: 402 });

  // app Fly do tenant — só para auditoria no provisionador/registro
  const inst = await database.execute<{ fly_app: string | null }>(
    sql`SELECT fly_app FROM instances WHERE tenant_id=${session.tenantId} LIMIT 1`,
  );
  const app = inst.rows[0]?.fly_app ?? null;

  const dk = await requestDeviceKey({
    app,
    tenantId: session.tenantId,
    limitUsd,
    deviceLabel: deviceLabel || undefined,
  });
  if (!dk) return NextResponse.json({ error: "provisioner_failed" }, { status: 502 });

  // Registra o HASH (nunca a key) para auditoria/revogação granular.
  // Reusa billing_events (sem migração); id = devkey:<hash> é idempotente.
  // Pendência: tabela device_keys própria quando houver passada de schema.
  try {
    await database.execute(sql`
      INSERT INTO billing_events (id, tenant_id, type, payload)
      VALUES (
        ${"devkey:" + dk.hash}, ${session.tenantId}, 'device_key.created',
        ${JSON.stringify({ hash: dk.hash, name: dk.name, deviceLabel: deviceLabel || null, limitUsd: dk.limitUsd, app, email: session.email })}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `);
  } catch {
    /* registro é best-effort — a key já existe e pertence ao dono */
  }

  return NextResponse.json({ key: dk.key, limitUsd: dk.limitUsd, envVar: "OPENROUTER_API_KEY" });
}
