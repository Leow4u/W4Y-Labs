import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  FREE_ALLOWANCE_USD,
  PLANS,
  ensureOndemandColumns,
  isOverageMeteredConfigured,
  maxOndemandSpendLimitUsd,
  provisionTenantKey,
  type Plan,
} from "@/lib/billing";
import { verifyProvisionerSig } from "@/lib/provisioner";
import {
  loadTenantOpenRouterKey,
  storeTenantOpenRouterKey,
  tenantSecretsEnabled,
} from "@/lib/tenant-secrets";

export const dynamic = "force-dynamic";

const TIER_PLAN: Record<string, string> = { super: "pro", ultra: "max" };

// One mint per tenant at a time. The shared motor bootstraps on first request,
// so a tenant opening the app in three tabs would otherwise mint three
// OpenRouter keys and keep only the last hash.
const minting = new Map<string, Promise<string>>();

/** Stored key for the tenant, minting and persisting one if none exists yet.
 *
 * Tenants created before the shared motor shipped never got a Secret Manager
 * copy of their key (only signup writes one), so the motor bootstrapped their
 * home with no `.env` and every model call failed. Repairing here means the
 * key still only ever lives in the cloud.
 */
async function resolveTenantKey(
  tenantId: string,
  creditsUsd: number,
  recordHash: (hash: string) => Promise<void>,
): Promise<string> {
  const stored = (await loadTenantOpenRouterKey(tenantId))?.trim();
  if (stored) return stored;
  // Without a secret store we could mint a key but never find it again, so
  // every bootstrap would burn a new one.
  if (!tenantSecretsEnabled()) return "";

  const inflight = minting.get(tenantId);
  if (inflight) return inflight;

  const job = (async () => {
    // A key with a zero ceiling is refused by OpenRouter and would strand the
    // tenant; the free allowance is the floor every plan is entitled to.
    const limitUsd = creditsUsd > 0 ? creditsUsd : FREE_ALLOWANCE_USD;
    let key = "";
    let hash = "";
    try {
      ({ key, hash } = await provisionTenantKey({ tenantId, creditsUsd: limitUsd }));
    } catch (err) {
      console.error(`[tenant-runtime] key mint failed tenant=${tenantId}`, err);
      return "";
    }
    if (!key) return "";
    const persisted = await storeTenantOpenRouterKey(tenantId, key);
    if (!persisted) {
      // Returning it anyway would hand the motor a key we can never look up
      // again — the next bootstrap would mint yet another one.
      console.error(`[tenant-runtime] key store failed tenant=${tenantId}`);
      return "";
    }
    if (hash) await recordHash(hash);
    return key;
  })().finally(() => minting.delete(tenantId));

  minting.set(tenantId, job);
  return job;
}

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

  const openrouterKey = await resolveTenantKey(tenantId, creditsUsd, async (hash) => {
    try {
      await database.execute(sql`
        UPDATE billing SET openrouter_key_hash=${hash}, key_injected_at=now(), updated_at=now()
        WHERE tenant_id=${tenantId}
      `);
    } catch {
      /* the key works regardless; the hash is for audit and re-limiting */
    }
  });
  if (!openrouterKey) {
    return NextResponse.json({ ok: false, error: "key_unavailable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, openrouterKey, ...planPayload });
}