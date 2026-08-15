import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingEvents } from "@/lib/db/schema";
import {
  verifyStripeSignature,
  planFromSubscriptionItems,
  renewTenantCredits,
  PLANS,
  provisionTenantKey,
  planRegime,
  reportCycleOverage,
  ensureOverageSubscriptionItem,
  type Plan,
} from "@/lib/billing";
import { requestReconfigure, requestEnsureKey } from "@/lib/provisioner";

export const dynamic = "force-dynamic";

type BillingRow = {
  openrouter_key_hash: string | null;
  plan: string | null;
  ondemand_enabled?: boolean | null;
  ondemand_spend_limit_usd?: string | null;
  cycle_usage_baseline_usd?: string | null;
  stripe_subscription_id?: string | null;
};
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
    const def = planFromSubscriptionItems(items);
    const active = obj.status === "active" || obj.status === "trialing";
    if (tenantId && def) {
      if (active) {
        await activate(database, {
          tenantId,
          plan: def.key,
          customer: String(obj.customer || ""),
          subscription: String(obj.id || ""),
        });
      } else {
        await database.execute(sql`UPDATE billing SET status='past_due', updated_at=now() WHERE tenant_id=${tenantId}`);
      }
    }
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    // 1) Report previous-cycle on-demand overage → next Stripe invoice
    // 2) Renew OpenRouter ceiling + reset cycle baseline
    const subDetails = obj.subscription_details as SubDetails | undefined;
    const subMeta = subDetails?.metadata ?? (obj.metadata as Record<string, string> | undefined);
    const invTenant = String(subMeta?.tenant_id || "");
    const invoiceSub = String(
      (typeof obj.subscription === "string" ? obj.subscription : "") ||
        (obj.subscription as { id?: string } | undefined)?.id ||
        "",
    );
    if (invTenant) {
      const row = await database.execute(
        sql`SELECT plan, openrouter_key_hash, ondemand_enabled, ondemand_spend_limit_usd,
                   cycle_usage_baseline_usd, stripe_subscription_id
            FROM billing WHERE tenant_id=${invTenant}`,
      );
      const b = row.rows[0] as BillingRow | undefined;
      const bplan = (b?.plan ?? "free") as Plan;
      const keyHash = (b?.openrouter_key_hash || "").trim();
      const subscriptionId = (invoiceSub || b?.stripe_subscription_id || "").trim();
      if (keyHash && PLANS[bplan]?.creditsUsd) {
        try {
          const spend = b?.ondemand_enabled ? Number(b.ondemand_spend_limit_usd ?? 0) : 0;
          const baseline =
            b?.cycle_usage_baseline_usd != null ? Number(b.cycle_usage_baseline_usd) : null;

          if (subscriptionId && spend > 0 && baseline != null) {
            try {
              await reportCycleOverage({
                subscriptionId,
                keyHash,
                plan: bplan,
                baselineUsd: baseline,
                spendLimitUsd: spend,
                idempotencyKey: `overage:${event.id}`,
              });
            } catch (err) {
              console.error(`[billing] overage report failed tenant=${invTenant}`, err);
            }
          }

          const renewed = await renewTenantCredits({
            tenantId: invTenant,
            keyHash,
            plan: bplan,
            spendLimitUsd: spend,
          });
          if (renewed) {
            await database.execute(
              sql`UPDATE billing SET cycle_usage_baseline_usd=${renewed.usage}, updated_at=now() WHERE tenant_id=${invTenant}`,
            );
          } else {
            await database.execute(sql`UPDATE billing SET updated_at=now() WHERE tenant_id=${invTenant}`);
          }
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
      await database.execute(
        sql`UPDATE billing SET plan='free', status='canceled', monthly_credits_usd=0, ondemand_enabled=false, ondemand_spend_limit_usd=0, updated_at=now() WHERE tenant_id=${tenantId}`,
      );
      if (wasPremium) {
        const inst = await database.execute(
          sql`SELECT fly_app FROM instances WHERE tenant_id=${tenantId} AND status='ready' LIMIT 1`,
        );
        const app = (inst.rows[0] as FlyAppRow | undefined)?.fly_app;
        if (app) {
          const ok = await requestReconfigure(app, "base");
          if (!ok) {
            console.error(`[billing] downgrade reconfigure falhou tenant=${tenantId} app=${app}`);
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function activate(
  database: ReturnType<typeof db>,
  opts: { tenantId: string; plan: Plan; customer: string; subscription: string },
) {
  const def = PLANS[opts.plan];
  const existing = await database.execute(
    sql`SELECT openrouter_key_hash, plan, ondemand_enabled, ondemand_spend_limit_usd, cycle_usage_baseline_usd
        FROM billing WHERE tenant_id=${opts.tenantId}`,
  );
  const prev = existing.rows[0] as BillingRow | undefined;
  const existingHash = prev?.openrouter_key_hash ?? null;
  const previousPlan = (prev?.plan ?? "free") as Plan;
  const spendLimit = prev?.ondemand_enabled ? Number(prev.ondemand_spend_limit_usd ?? 0) : 0;

  let keyHash = existingHash;
  let keyInjected = existingHash != null;
  if (existingHash) {
    try {
      const prov = await provisionTenantKey({
        tenantId: opts.tenantId,
        creditsUsd: def.creditsUsd,
        existingHash,
        spendLimitUsd: spendLimit,
        cumulative: true,
      });
      keyHash = prov.hash;
    } catch {
      /* re-limite falhou — chave (mesmo valor) segue capada na máquina */
    }
  } else if (def.creditsUsd > 0) {
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
        keyInjected = false;
        console.error(
          `[billing] chave capada nao injetada tenant=${opts.tenantId} app=${app} plan=${opts.plan}`,
        );
      }
    } else {
      keyInjected = false;
      console.error(
        `[billing] ativacao diferida (instancia nao-ready) tenant=${opts.tenantId} status=${row?.status ?? "none"} plan=${opts.plan}`,
      );
    }
  }

  // Attach metered overage item for new/updated paid subs (best-effort).
  if (opts.subscription) {
    try {
      await ensureOverageSubscriptionItem(opts.subscription);
    } catch (err) {
      console.error(`[billing] ensure overage item failed tenant=${opts.tenantId}`, err);
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

  if (planRegime(previousPlan) !== planRegime(opts.plan)) {
    const inst = await database.execute(
      sql`SELECT fly_app FROM instances WHERE tenant_id=${opts.tenantId} AND status='ready' LIMIT 1`,
    );
    const app = (inst.rows[0] as FlyAppRow | undefined)?.fly_app;
    if (app) {
      const regime = planRegime(opts.plan);
      const ok = await requestReconfigure(app, regime);
      if (!ok) {
        console.error(
          `[billing] reconfigure regime=${regime} falhou tenant=${opts.tenantId} app=${app}`,
        );
      }
    }
  }
}
