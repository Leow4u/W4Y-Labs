import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { shouldWakeForCron, tenantWakeUrl, wakeTargets } from "@/lib/wake-tenants";

export const dynamic = "force-dynamic";

// Despertador multi-tenant (Cloud Scheduler). Acorda instâncias base (suspend/min=0)
// para o ticker de cron interno fazer catch-up. Premium (min=1) é ignorado.
export async function POST(req: NextRequest) {
  const secret = process.env.WAKE_SECRET?.trim() || process.env.RECYCLE_SECRET?.trim();
  if (!secret || req.headers.get("x-wake-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const database = db();
  let rows: { tenant_id: string; fly_app: string; url: string; plan: string }[] = [];
  try {
    const r = await database.execute<{
      tenant_id: string;
      fly_app: string;
      url: string;
      plan: string;
    }>(sql`
      SELECT i.tenant_id, i.fly_app, i.url, b.plan
      FROM instances i JOIN billing b ON b.tenant_id = i.tenant_id
      WHERE i.status = 'ready' AND i.fly_app IS NOT NULL
        AND b.status IN ('active', 'inactive', 'past_due')
      LIMIT 100
    `);
    rows = r.rows;
  } catch (e) {
    return NextResponse.json(
      { error: "query_failed", detail: String((e as Error).message) },
      { status: 500 },
    );
  }

  const targets = rows
    .filter((row) => shouldWakeForCron(row.plan))
    .map((row) => ({
      tenantId: row.tenant_id,
      flyApp: row.fly_app,
      plan: row.plan,
      wakeUrl: tenantWakeUrl(row.fly_app, row.url),
    }));

  const ignored = rows.length - targets.length;
  const result = await wakeTargets(targets);
  return NextResponse.json(
    { ...result, ignorados: ignored },
    { status: result.alert ? 503 : 200 },
  );
}
