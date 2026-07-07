import { NextRequest, NextResponse } from "next/server";
import { getDevSession } from "@/lib/dev-auth";
import {
  createEmbeddedCheckoutSession,
  PLANS,
  type BillingInterval,
  type Plan,
} from "@/lib/billing";

export const dynamic = "force-dynamic";

// Cria a sessão de checkout EMBEDDED e devolve o client_secret para o
// <EmbeddedCheckout> montar dentro do Work4You. Autenticado por sessão; o
// tenant/email vêm da sessão (nunca do corpo). O cartão fica 100% no iframe da
// Stripe — a casca nunca toca em dados de cartão.
export async function POST(req: NextRequest) {
  const session = await getDevSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    plan?: string;
    interval?: string;
  };
  const plan = String(body.plan || "") as Plan;
  const interval: BillingInterval = body.interval === "year" ? "year" : "month";
  if (!PLANS[plan] || plan === "free") {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  try {
    const clientSecret = await createEmbeddedCheckoutSession({
      plan,
      interval,
      tenantId: session.tenantId,
      email: session.email,
      origin: originOf(req),
    });
    return NextResponse.json({ clientSecret });
  } catch (e) {
    // price ID ainda não configurado (go-live) ou erro da Stripe.
    return NextResponse.json(
      { error: "checkout_failed", detail: String((e as Error).message) },
      { status: 500 },
    );
  }
}

function originOf(req: NextRequest): string {
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "work4you.ai";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
