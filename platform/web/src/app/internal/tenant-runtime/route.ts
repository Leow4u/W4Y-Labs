import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  PLANS,
  ensureOndemandColumns,
  isOverageMeteredConfigured,
  maxOndemandSpendLimitUsd,
  provisionTenantKey,
  type Plan,
} from "@/lib/billing";
import { verifyProvisionerSig } from "@/lib/provisioner";
import { resolveTenantKey } from "@/lib/tenant-runtime-key";
import {
  loadTenantOpenRouterKey,
  storeTenantOpenRouterKey,
  tenantSecretsEnabled,
} from "@/lib/tenant-secrets";

export const dynamic = "force-dynamic";

const TIER_PLAN: Record<string, string> = { super: "pro", ultra: "max" };

type BillingPlanRow = {
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  monthly_credits_usd: string | null;
  ondemand_enabled: boolean | null;
  ondemand_spend_limit_usd: string | null;
};

/** Motor shared chama isto (HMAC) para materializar o home do tenant na 1.a sessao. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-provisioner-sig") ?? "";
  if (!verifyProvisionerSig(raw, sig)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let tenantId = "";
  try {
    const body = JSON.parse(raw) as { tenantId?: string };
    tenantId = String(body.tenantId || "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "missing_tenant" }, { status: 400 });
  }

  const database = db();
  try {
    const r = await database.execute<{ tenant_id: string }>(
      sql`SELECT tenant_id FROM users WHERE tenant_id=${tenantId} LIMIT 1`,
    );
    if (!r.rows[0]?.tenant_id) {
      return NextResponse.json({ ok: false, error: "unknown_tenant" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "registry_unavailable" }, { status: 503 });
  }

  let planPayload: Record<string, unknown> = {
    plan: "free",
    status: "inactive",
    has_customer: false,
    included_usd: 0,
    ondemand: {
      enabled: false,
      spend_limit_usd: 0,
      max_spend_limit_usd: maxOndemandSpendLimitUsd("free"),
      used_usd: null,
      included_used_usd: null,
      metered: isOverageMeteredConfigured(),
      billed_on: isOverageMeteredConfigured() ? "next_invoice" : "ceiling_only",
    },
  };
  let creditsUsd = 0;

  try {
    await ensureOndemandColumns((q) => database.execute(q));
    const r = await database.execute<BillingPlanRow>(
      sql`SELECT plan, status, stripe_customer_id, monthly_credits_usd,
                 ondemand_enabled, ondemand_spend_limit_usd
          FROM billing WHERE tenant_id=${tenantId}`,
    );
    const row = r.rows[0];
    if (row) {
      const planKey = (TIER_PLAN[row.plan] ?? row.plan) as Plan;
      const catalog = PLANS[planKey] ?? PLANS.free;
      const includedUsd = Number(row.monthly_credits_usd ?? catalog.creditsUsd ?? 0);
      creditsUsd = includedUsd;
      const enabled = Boolean(row.ondemand_enabled);
      const spendLimit = enabled ? Number(row.ondemand_spend_limit_usd ?? 0) : 0;
      planPayload = {
        plan: planKey,
        status: row.status,
        has_customer: Boolean((row.stripe_customer_id || "").trim()),
        included_usd: includedUsd,
        ondemand: {
          enabled,
          spend_limit_usd: spendLimit,
          max_spend_limit_usd: maxOndemandSpendLimitUsd(planKey),
          used_usd: null,
          included_used_usd: null,
          metered: isOverageMeteredConfigured(),
          billed_on: isOverageMeteredConfigured() ? "next_invoice" : "ceiling_only",
        },
      };
    }
  } catch {
    /* billing optional — motor still boots with key + default free plan */
  }

  const openrouterKey = await resolveTenantKey(tenantId, creditsUsd, {
    load: loadTenantOpenRouterKey,
    store: storeTenantOpenRouterKey,
    mint: (id, limitUsd) => provisionTenantKey({ tenantId: id, creditsUsd: limitUsd }),
    secretsEnabled: tenantSecretsEnabled,
    log: (message) => console.error(message),
    recordHash: async (id, hash) => {
      try {
        await database.execute(sql`
          UPDATE billing SET openrouter_key_hash=${hash}, key_injected_at=now(), updated_at=now()
          WHERE tenant_id=${id}
        `);
      } catch {
        /* the key works regardless; the hash is for audit and re-limiting */
      }
    },
  });
  if (!openrouterKey) {
    return NextResponse.json({ ok: false, error: "key_unavailable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, openrouterKey, ...planPayload });
}