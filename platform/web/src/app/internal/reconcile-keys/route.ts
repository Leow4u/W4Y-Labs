import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findPendingKeyInjections, reconcilePendingKeys } from "@/lib/reconcile-keys";

export const dynamic = "force-dynamic";

// Reconciliador do TETO RÍGIDO (Cloud Scheduler, ~5 min). Repara tenants ATIVOS
// pagos cuja chave capada NÃO confirmou chegar na máquina Fly.
export async function POST(req: NextRequest) {
  const secret = process.env.RECONCILE_SECRET?.trim();
  if (!secret || req.headers.get("x-reconcile-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const database = db();
  let pending;
  try {
    pending = await findPendingKeyInjections(database);
  } catch (e) {
    return NextResponse.json(
      { error: "query_failed", detail: String((e as Error).message) },
      { status: 500 },
    );
  }

  const result = await reconcilePendingKeys(database, pending);
  return NextResponse.json(result, { status: result.alertLevel === "critical" ? 503 : 200 });
}
