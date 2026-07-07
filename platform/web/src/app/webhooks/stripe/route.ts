import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { billing, billingEvents } from "@/lib/db/schema";
import {
  verifyStripeSignature, planByPriceId, planRegime, renewTenantCredits,
  PLANS, provisionTenantKey, type Plan,
} from "@/lib/billing";
import { requestReconfigure, requestEnsureKey } from "@/lib/provisioner";

export const dynamic = "force-dynamic";

// Tipos nomeados (evita object-literal em posição de expressão, que o
// parser do Turbopack recusa em alguns casts/generics).
type BillingRow = { openrouter_key_hash: string | null; plan: string | null };
type SubDetails = { metadata?: Record<string, string> };
type FlyAppRow = { fly_app: string | null };

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
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    // RENOVAÇÃO MENSAL: a cada fatura paga, recarrega o crédito da runtime
    // key do tenant (com rollover) — no dia exato do ciclo dele.
    const subDetails = obj.subscription_details as SubDetails | undefined;
    const subMeta = subDetails?.metadata ?? (obj.metadata as Record<string, string> | undefined);
    const invTenant = String(subMeta?.tenant_id || "");
    if (invTenant) {
      const row = await database.execute(sql`SELECT plan, openrouter_key_hash FROM billing WHERE tenant_id=${invTenant}`);
      const b = row.rows[0] as BillingRow | undefined;
      const bplan = (b?.plan ?? "free") as Plan;
      if (b?.openrouter_key_hash && PLANS[bplan]?.creditsUsd) {
        try {
          await renewTenantCredits({ tenantId: invTenant, keyHash: b.openrouter_key_hash, plan: bplan });
          await database.execute(sql`UPDATE billing SET updated_at=now() WHERE tenant_id=${invTenant}`);
        } catch {
          /* renovação falhou — evento fica no log p/ retry manual */
        }
      }
    }
  } else if (event.type === "customer.subscription.deleted") {
    const tenantId = String((obj.metadata as Record<string, string>)?.tenant_id || "");
    if (tenantId) {
      // volta ao Free e zera o crédito da runtime key (limite 0 → 402 imediato).
      const row = await database.execute(sql`SELECT plan, openrouter_key_hash FROM billing WHERE tenant_id=${tenantId}`);
      const b = row.rows[0] as BillingRow | undefined;
      const wasPremium = planRegime((b?.plan ?? "free") as Plan) === "premium";
      if (b?.openrouter_key_hash) {
        try {
          await provisionTenantKey({ tenantId, creditsUsd: 0, existingHash: b.openrouter_key_hash });
        } catch {
          /* best-effort — o status já reflete cancelado */
        }
      }
      await database.execute(sql`UPDATE billing SET plan='free', status='canceled', monthly_credits_usd=0, updated_at=now() WHERE tenant_id=${tenantId}`);
      // Máquina 24h volta a dormir (base) quando o plano premium cai.
      if (wasPremium) {
        const inst = await database.execute(sql`SELECT fly_app FROM instances WHERE tenant_id=${tenantId} AND status='ready' LIMIT 1`);
        const app = (inst.rows[0] as FlyAppRow | undefined)?.fly_app;
        if (app) await requestReconfigure(app, "base");
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// Ativa/atualiza o plano do tenant, provisiona/re-limita a runtime key e,
// se o REGIME da máquina mudou (base↔premium), reconfigura o app Fly.
async function activate(
  database: ReturnType<typeof db>,
  opts: { tenantId: string; plan: Plan; customer: string; subscription: string },
) {
  const def = PLANS[opts.plan];
  const existing = await database.execute(sql`SELECT openrouter_key_hash, plan FROM billing WHERE tenant_id=${opts.tenantId}`);
  const prev = existing.rows[0] as BillingRow | undefined;
  const existingHash = prev?.openrouter_key_hash ?? null;
  const previousPlan = (prev?.plan ?? "free") as Plan;

  let keyHash = existingHash;
  // se já havia chave, ela já está como secret na máquina (injetada no
  // onboarding/ativação anterior); re-limites não trocam a chave.
  let keyInjected = existingHash != null;
  if (existingHash) {
    // MESMA chave: só reajusta o limite ao novo plano (casca; sem reinjeção —
    // o valor da chave não muda). Se falhar, a chave segue na máquina e o
    // limite pega na próxima renovação/evento.
    try {
      const prov = await provisionTenantKey({
        tenantId: opts.tenantId,
        creditsUsd: def.creditsUsd,
        existingHash,
      });
      keyHash = prov.hash;
    } catch {
      /* re-limite falhou — chave (mesmo valor) segue capada na máquina */
    }
  } else if (def.creditsUsd > 0) {
    // Chave NOVA capada: o provisionador é a FONTE ÚNICA — cria E injeta e
    // devolve o hash (a key crua nunca chega aqui). MAS só quando a instância
    // está 'ready': se ainda está provisionando, o onboarding está em voo
    // criando a chave de TRIAL, e criar a paga agora faria as duas competirem
    // pelo secret da máquina (corrida de chave dupla). Nesse caso DIFERIMOS —
    // a máquina roda na chave de trial (capada, seguro) até o reconciliador
    // (internal/reconcile-keys, que só toca instâncias 'ready') aplicar o teto
    // pago. Assim nunca fica SEM teto e nunca há corrida.
    const inst = await database.execute(
      sql`SELECT fly_app, status FROM instances WHERE tenant_id=${opts.tenantId} LIMIT 1`,
    );
    const row = inst.rows[0] as { fly_app: string | null; status: string } | undefined;
    const app = row?.fly_app ?? null;
    const ready = row?.status === "ready";
    if (app && ready) {
      const newHash = await requestEnsureKey(app, opts.tenantId, def.creditsUsd);
      if (newHash) {
        keyHash = newHash;
        keyInjected = true;
      } else {
        keyInjected = false; // provisionador falhou → key_injected_at NULL → reconciliador repara
        console.error(
          `[billing] chave capada nao injetada tenant=${opts.tenantId} app=${app} plan=${opts.plan}`,
        );
      }
    } else {
      // Instância provisionando / sem app → difere p/ o reconciliador (evita a
      // corrida com a chave de trial do onboarding). key_injected_at fica NULL.
      keyInjected = false;
      console.error(
        `[billing] ativacao diferida (instancia nao-ready) tenant=${opts.tenantId} status=${row?.status ?? "none"} plan=${opts.plan}`,
      );
    }
  }

  const injectedAt = keyInjected ? sql`now()` : sql`NULL`;
  await database.execute(sql`
    INSERT INTO billing (tenant_id, plan, status, stripe_customer_id, stripe_subscription_id, openrouter_key_hash, key_injected_at, monthly_credits_usd, updated_at)
    VALUES (${opts.tenantId}, ${opts.plan}, 'active', ${opts.customer}, ${opts.subscription}, ${keyHash}, ${injectedAt}, ${def.creditsUsd}, now())
    ON CONFLICT (tenant_id) DO UPDATE SET
      plan=EXCLUDED.plan, status='active',
      stripe_customer_id=EXCLUDED.stripe_customer_id,
      stripe_subscription_id=EXCLUDED.stripe_subscription_id,
      openrouter_key_hash=EXCLUDED.openrouter_key_hash,
      key_injected_at=EXCLUDED.key_injected_at,
      monthly_credits_usd=EXCLUDED.monthly_credits_usd,
      updated_at=now()
  `);

  // Upgrade/downgrade de REGIME (ex.: Plus→Super = máquina vira 24h acesa).
  if (planRegime(previousPlan) !== planRegime(opts.plan)) {
    try {
      const inst = await database.execute(
        sql`SELECT fly_app FROM instances WHERE tenant_id=${opts.tenantId} AND status='ready' LIMIT 1`,
      );
      const app = (inst.rows[0] as FlyAppRow | undefined)?.fly_app;
      if (app) await requestReconfigure(app, planRegime(opts.plan));
    } catch {
      /* reconfigure é best-effort; créditos já valem — regime pega no retry */
    }
  }
}
