import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getDevSession } from "@/lib/dev-auth";
import { requestProvision, slugFor } from "@/lib/provisioner";
import { FREE_ALLOWANCE_USD } from "@/lib/billing";

export const dynamic = "force-dynamic";

// Re-dispara provisionamento quando falhou ou o utilizador pediu retry.
export async function POST() {
  const session = await getDevSession();
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 401 });

  const database = db();
  const tenantId = session.tenantId;
  const inst = await database.execute<{ status: string; fly_app: string | null; notes: string | null }>(
    sql`SELECT status, fly_app, notes FROM instances WHERE tenant_id=${tenantId} LIMIT 1`,
  );
  const row = inst.rows[0];
  if (!row) return NextResponse.json({ error: "no_instance" }, { status: 404 });
  if (row.status === "ready") {
    return NextResponse.json({ ok: true, status: "ready" });
  }
  if (row.status === "provisioning") {
    return NextResponse.json({ ok: true, status: "provisioning" });
  }

  const slug = row.fly_app?.replace(/^wayne-/, "") ?? slugFor(session.email);
  await database.execute(
    sql`UPDATE instances SET status='provisioning', notes='Retry manual do onboarding' WHERE tenant_id=${tenantId}`,
  );
  const started = await requestProvision({
    tenantId,
    slug,
    email: session.email,
    plan: "base",
    trialUsd: FREE_ALLOWANCE_USD,
  });
  if (!started) {
    await database.execute(
      sql`UPDATE instances SET status='failed', notes='Retry: provisionador indisponível' WHERE tenant_id=${tenantId}`,
    );
    return NextResponse.json({ error: "provision_failed" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, status: "provisioning" });
}
