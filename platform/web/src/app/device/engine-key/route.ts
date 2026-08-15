import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getDevSession } from "@/lib/dev-auth";
import { rateLimit } from "@/lib/rate-limit";
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

// Rate-limit per session email — device key creation is rare (1/min).
const DEVICE_KEY_RATE = { limit: 3, windowMs: 60_000 };

export async function POST(req: NextRequest) {
  const session = await getDevSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = rateLimit(`device-key:${session.email}`, DEVICE_KEY_RATE.limit, DEVICE_KEY_RATE.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

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

  // Registra o HASH (nunca a key) para auditoria/revogação granular. O id da
  // key Composio (não-secreto) entra no payload; a key crua, jamais.
  // Reusa billing_events (sem migração); id = devkey:<hash> é idempotente.
  // Pendência: tabela device_keys própria quando houver passada de schema.
  try {
    await database.execute(sql`
      INSERT INTO billing_events (id, tenant_id, type, payload)
      VALUES (
        ${"devkey:" + dk.hash}, ${session.tenantId}, 'device_key.created',
        ${JSON.stringify({ hash: dk.hash, name: dk.name, deviceLabel: deviceLabel || null, limitUsd: dk.limitUsd, app, email: session.email, composioKeyId: dk.composioKeyId, composioError: dk.composioError })}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `);
  } catch {
    /* registro é best-effort — a key já existe e pertence ao dono */
  }

  // S0 conectores: repassa a chave Composio do projeto dedicado quando o
  // provisionador conseguiu criá-la (o app grava COMPOSIO_API_KEY no .env do
  // motor local). Ausente/null = motor segue sem conectores (best-effort).
  // toolEnv: Firecrawl / Langfuse shared platform secrets for the desktop .env.
  return NextResponse.json({
    key: dk.key,
    openrouterApiKey: dk.key,
    limitUsd: dk.limitUsd,
    envVar: "OPENROUTER_API_KEY",
    tenantId: session.tenantId,
    email: session.email,
    plan,
    ...(dk.composioKey ? { composioKey: dk.composioKey, composioEnvVar: "COMPOSIO_API_KEY" } : {}),
    ...(dk.toolEnv ? { toolEnv: dk.toolEnv } : {}),
  });
}
