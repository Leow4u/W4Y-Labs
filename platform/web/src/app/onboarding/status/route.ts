import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getDevSession } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

// Estado do provisionamento da instância do tenant logado — a tela de
// preparação faz polling aqui até 'ready'.
export async function GET() {
  const session = await getDevSession();
  if (!session) return NextResponse.json({ status: "no_session" }, { status: 401 });
  try {
    const r = await db().execute<{ status: string; notes: string | null }>(
      sql`SELECT status, notes FROM instances WHERE tenant_id=${session.tenantId} LIMIT 1`,
    );
    const row = r.rows[0];
    return NextResponse.json({
      status: row?.status ?? "unknown",
      notes: row?.notes ?? null,
    });
  } catch {
    return NextResponse.json({ status: "unknown" });
  }
}
