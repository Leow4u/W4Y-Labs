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
    const r = await db().execute<{ status: string }>(
      sql`SELECT status FROM instances WHERE tenant_id=${session.tenantId} LIMIT 1`,
    );
    return NextResponse.json({ status: r.rows[0]?.status ?? "unknown" });
  } catch {
    return NextResponse.json({ status: "unknown" });
  }
}
