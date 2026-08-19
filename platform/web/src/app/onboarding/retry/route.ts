import { NextResponse } from "next/server";
import { getDevSession } from "@/lib/dev-auth";
import { ensureDedicatedFlyInstance } from "@/lib/ensure-dedicated-fly";

export const dynamic = "force-dynamic";

// Re-dispara provisionamento (falha, retry manual, ou migração fora do wayne-w4y).
export async function POST() {
  const session = await getDevSession();
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 401 });

  const status = await ensureDedicatedFlyInstance({
    tenantId: session.tenantId,
    email: session.email,
  });
  if (status === "failed") {
    return NextResponse.json({ error: "provision_failed" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, status });
}
