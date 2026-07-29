import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import {
  PLANS,
  applyTenantKeyCeiling,
  ensureOndemandColumns,
  ensureOverageSubscriptionItem,
  fetchKeyUsage,
  isOverageMeteredConfigured,
  maxOndemandSpendLimitUsd,
  type Plan,
} from "@/lib/billing";
import { db } from "@/lib/db";
import { getDevSession } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

type BillingOndemandRow = {
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  openrouter_key_hash: string | null;
  ondemand_enabled: boolean | null;
  ondemand_spend_limit_usd: string | null;
  cycle_usage_baseline_usd: string | null;
};

/**
 * PATCH /planos/spend-limit — enable on-demand and set monthly spend limit ($).
 * Raises the tenant OpenRouter key ceiling (hard gate). When
 * STRIPE_PRICE_OVERAGE is configured, overage is reported at cycle end and
 * billed on the next Stripe invoice (honest MVP).
 *
 * Body: { enabled: boolean, spend_limit_usd: number }
 */
export async function PATCH(req: NextRequest) {
  const session = await getDevSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { enabled?: unknown; spend_limit_usd?: unknown };
  try {
    body = (await req.json()) as { enabled?: unknown; spend_limit_usd?: unknown };
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const enabled = Boolean(body.enabled);
  const spendRaw = Number(body.spend_limit_usd ?? 0);
  if (!Number.isFinite(spendRaw) || spendRaw < 0) {
    return NextResponse.json({ error: "invalid_spend_limit" }, { status: 400 });
  }

  const database = db();
  try {
    await ensureOndemandColumns((q) => database.execute(q));
  } catch {
    /* columns may already exist / ALTER race — continue */
  }

  const r = await database.execute<BillingOndemandRow>(
    sql`SELECT plan, status, stripe_customer_id, stripe_subscription_id, openrouter_key_hash,
               ondemand_enabled, ondemand_spend_limit_usd, cycle_usage_baseline_usd
        FROM billing WHERE tenant_id=${session.tenantId}`,
  );
  const row = r.rows[0];
  if (!row) {
    return NextResponse.json({ error: "no_billing" }, { status: 404 });
  }

  const plan = (row.plan || "free") as Plan;
  const hasCustomer = Boolean((row.stripe_customer_id || "").trim());
  const maxSpend = maxOndemandSpendLimitUsd(plan);
  const subscriptionId = (row.stripe_subscription_id || "").trim();

  if (enabled) {
    if (!hasCustomer || !PLANS[plan]?.creditsUsd) {
      return NextResponse.json({ error: "subscription_required" }, { status: 402 });
    }
    if (row.status !== "active" && row.status !== "trialing") {
      return NextResponse.json({ error: "subscription_inactive" }, { status: 402 });
    }
  }

  const spendLimit = enabled ? Math.min(spendRaw, maxSpend) : 0;
  if (enabled && spendLimit <= 0) {
    return NextResponse.json({ error: "spend_limit_required" }, { status: 400 });
  }

  const keyHash = (row.openrouter_key_hash || "").trim();
  let baseline = row.cycle_usage_baseline_usd != null ? Number(row.cycle_usage_baseline_usd) : null;
  let usage: number | null = null;

  if (keyHash && PLANS[plan]?.creditsUsd) {
    try {
      const snap = await fetchKeyUsage(keyHash);
      usage = snap.usage;
      if (baseline == null || !Number.isFinite(baseline)) {
        baseline = snap.usage;
      }
      await applyTenantKeyCeiling({
        keyHash,
        includedUsd: PLANS[plan].creditsUsd,
        spendLimitUsd: spendLimit,
      });
    } catch {
      return NextResponse.json({ error: "key_update_failed" }, { status: 502 });
    }
  }

  if (enabled && subscriptionId) {
    try {
      await ensureOverageSubscriptionItem(subscriptionId);
    } catch {
      /* metered attach is best-effort — ceiling still applies */
    }
  }

  await database.execute(sql`
    UPDATE billing SET
      ondemand_enabled=${enabled},
      ondemand_spend_limit_usd=${spendLimit},
      cycle_usage_baseline_usd=${baseline},
      updated_at=now()
    WHERE tenant_id=${session.tenantId}
  `);

  const included = PLANS[plan]?.creditsUsd ?? 0;
  const cycleUsage = usage != null && baseline != null ? Math.max(0, usage - baseline) : null;
  const includedUsed = cycleUsage != null ? Math.min(included, cycleUsage) : null;
  const ondemandUsed = cycleUsage != null ? Math.max(0, cycleUsage - included) : null;
  const metered = isOverageMeteredConfigured();

  return NextResponse.json({
    ok: true,
    plan,
    ondemand: {
      enabled,
      spend_limit_usd: spendLimit,
      max_spend_limit_usd: maxSpend,
      used_usd: ondemandUsed,
      included_used_usd: includedUsed,
      included_usd: included,
      metered,
      billed_on: metered ? "next_invoice" : "ceiling_only",
    },
  });
}
