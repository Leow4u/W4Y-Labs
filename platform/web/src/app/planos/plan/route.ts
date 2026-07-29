import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import {
  PLANS,
  ensureOndemandColumns,
  fetchKeyUsage,
  isOverageMeteredConfigured,
  maxOndemandSpendLimitUsd,
  type Plan,
} from "@/lib/billing";
import { db } from "@/lib/db";
import { getDevSession } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

// GET /planos/plan — plano + on-demand spend limit state for Conta / TierPicker.
const TIER_PLAN: Record<string, string> = { super: "pro", ultra: "max" };

type BillingPlanRow = {
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  openrouter_key_hash: string | null;
  monthly_credits_usd: string | null;
  ondemand_enabled: boolean | null;
  ondemand_spend_limit_usd: string | null;
  cycle_usage_baseline_usd: string | null;
};

export async function GET() {
  const session = await getDevSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const database = db();
  try {
    await ensureOndemandColumns((q) => database.execute(q));
  } catch {
    /* best-effort schema */
  }

  try {
    const r = await database.execute<BillingPlanRow>(
      sql`SELECT plan, status, stripe_customer_id, openrouter_key_hash, monthly_credits_usd,
                 ondemand_enabled, ondemand_spend_limit_usd, cycle_usage_baseline_usd
          FROM billing WHERE tenant_id=${session.tenantId}`,
    );
    const row = r.rows[0] ?? {
      plan: "free",
      status: "inactive",
      stripe_customer_id: null,
      openrouter_key_hash: null,
      monthly_credits_usd: null,
      ondemand_enabled: false,
      ondemand_spend_limit_usd: "0",
      cycle_usage_baseline_usd: null,
    };
    const planKey = (TIER_PLAN[row.plan] ?? row.plan) as Plan;
    const catalog = PLANS[planKey] ?? PLANS.free;
    const includedUsd = Number(row.monthly_credits_usd ?? catalog.creditsUsd ?? 0);
    const enabled = Boolean(row.ondemand_enabled);
    const spendLimit = enabled ? Number(row.ondemand_spend_limit_usd ?? 0) : 0;
    const maxSpend = maxOndemandSpendLimitUsd(planKey);
    const metered = isOverageMeteredConfigured();

    let ondemandUsed: number | null = null;
    let includedUsed: number | null = null;
    const keyHash = (row.openrouter_key_hash || "").trim();
    let baseline = row.cycle_usage_baseline_usd != null ? Number(row.cycle_usage_baseline_usd) : null;

    if (keyHash) {
      try {
        const snap = await fetchKeyUsage(keyHash);
        if (baseline == null || !Number.isFinite(baseline)) {
          // Approximate: assume ceiling ≈ baseline + included + spend.
          baseline = Math.max(0, snap.limit - includedUsd - spendLimit);
        }
        const cycleUsage = Math.max(0, snap.usage - baseline);
        includedUsed = Math.min(includedUsd, cycleUsage);
        ondemandUsed = Math.max(0, cycleUsage - includedUsd);
      } catch {
        /* meter optional */
      }
    }

    return NextResponse.json(
      {
        plan: planKey,
        status: row.status,
        has_customer: Boolean((row.stripe_customer_id || "").trim()),
        included_usd: includedUsd,
        ondemand: {
          enabled,
          spend_limit_usd: spendLimit,
          max_spend_limit_usd: maxSpend,
          used_usd: ondemandUsed,
          included_used_usd: includedUsed,
          metered,
          billed_on: metered ? "next_invoice" : "ceiling_only",
        },
      },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch {
    return NextResponse.json({ error: "registry_unavailable" }, { status: 503 });
  }
}
