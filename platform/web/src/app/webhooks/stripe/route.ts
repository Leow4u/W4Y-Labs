import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { billing, billingEvents } from "@/lib/db/schema";
import { verifyStripeSignature, planByPriceId, PLANS, provisionTenantKey, type Plan } from "@/lib/billing";

export const dynamic = "force-dynamic";

// Webhook da Stripe. Verifica a assinatura HMAC (fonte da verdade do
// pagamento), é idempotente por event.id, e ao ativar uma assinatura
// provisiona a runtime key OpenRouter com limite = crédito do plano.
// Fica sob /webhooks/* (roteado à casca no LB; /api/* é do Wayne).
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  if (!(await verifyStripeSignature(raw, sig))) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const database = db();

  // Idempotência: se já registramos este event.id, não reprocessa.
  const seen = await database.execute(
    sql`INSERT INTO billing_events (id, type, payload) VALUES (${event.id}, ${event.type}, ${JSON.stringify(event)}::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id`,
  );
  if (seen.rows.length === 0) {
    return NextResponse.json({ ok: true, dup: true });
  }

  const obj = event.data.object;

  if (event.type === "checkout.session.completed") {
    const tenantId = String((obj.metadata as Record<string, string>)?.tenant_id || (obj.client_reference_id as string) || "");
    const plan = String((obj.metadata as Record<string, string>)?.plan || "") as Plan;
    const customer = String(obj.customer || "");
    const subscription = String(obj.subscription || "");
    if (tenantId && PLANS[plan]) {
      await activate(database, { tenantId, plan, customer, subscription });
    }
  } else if (event.type === "customer.subscription.updated") {
    const tenantId = String((obj.metadata as Record<string, string>)?.tenant_id || "");
    const items = (obj.items as { data?: { price?: { id?: string } }[] })?.data ?? [];
    const priceId = items[0]?.price?.id ?? "";
    const def = planByPriceId(priceId);
    const active = obj.status === "active" || obj.status === "trialing";
    if (tenantId && def) {
      if (active) {
        await activate(database, { tenantId, plan: def.key, customer: String(obj.customer || ""), subscription: String(obj.id || "") });
      } else {
        await database.execute(sql`UPDATE billing SET status='past_due', updated_at=now() WHERE tenant_id=${tenantId}`);
      }
    }
  } else if (event.type === "customer.subscription.deleted") {
    const tenantId = String((obj.metadata as Record<string, string>)?.tenant_id || "");
    if (tenantId) {
      // volta ao Free e zera o crédito da runtime key (limite 0 → 402 imediato).
      const row = await database.execute<{ openrouter_key_hash: string | null }>(
        sql`SELECT openrouter_key_hash FROM billing WHERE tenant_id=${tenantId}`,
      );
      const hash = row.rows[0]?.openrouter_key_hash;
      if (hash) {
        try {
          await provisionTenantKey({ tenantId, creditsUsd: 0, existingHash: hash });
        } catch {
          /* best-effort — o status já reflete cancelado */
        }
      }
      await database.execute(
        sql`UPDATE billing SET plan='free', status='canceled', monthly_credits_usd=0, updated_at=now() WHERE tenant_id=${tenantId}`,
      );
    }
  }

  return NextResponse.json({ ok: true });
}

// Ativa/atualiza o plano do tenant e provisiona (ou re-limita) a runtime key.
async function activate(
  database: ReturnType<typeof db>,
  opts: { tenantId: string; plan: Plan; customer: string; subscription: string },
) {
  const def = PLANS[opts.plan];
  const existing = await database.execute<{ openrouter_key_hash: string | null }>(
    sql`SELECT openrouter_key_hash FROM billing WHERE tenant_id=${opts.tenantId}`,
  );
  const existingHash = existing.rows[0]?.openrouter_key_hash ?? null;

  let keyHash = existingHash;
  try {
    const prov = await provisionTenantKey({
      tenantId: opts.tenantId,
      creditsUsd: def.creditsUsd,
      existingHash,
    });
    keyHash = prov.hash;
    // TODO(provisionador Fase 3): injetar prov.key como secret na máquina Fly
    // do tenant (OPENROUTER_API_KEY). No MVP single-tenant guardamos só o hash.
  } catch {
    /* provisionamento falhou — mantém o registro; retry manual/observabilidade */
  }

  await database.execute(sql`
    INSERT INTO billing (tenant_id, plan, status, stripe_customer_id, stripe_subscription_id, openrouter_key_hash, monthly_credits_usd, updated_at)
    VALUES (${opts.tenantId}, ${opts.plan}, 'active', ${opts.customer}, ${opts.subscription}, ${keyHash}, ${def.creditsUsd}, now())
    ON CONFLICT (tenant_id) DO UPDATE SET
      plan=EXCLUDED.plan, status='active',
      stripe_customer_id=EXCLUDED.stripe_customer_id,
      stripe_subscription_id=EXCLUDED.stripe_subscription_id,
      openrouter_key_hash=EXCLUDED.openrouter_key_hash,
      monthly_credits_usd=EXCLUDED.monthly_credits_usd,
      updated_at=now()
  `);
}
