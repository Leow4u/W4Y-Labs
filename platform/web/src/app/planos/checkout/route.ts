import { NextRequest, NextResponse } from "next/server";
import { getDevSession } from "@/lib/dev-auth";
import { createCheckoutSession, PLANS, type Plan } from "@/lib/billing";

export const dynamic = "force-dynamic";

// Inicia o Checkout hospedado da Stripe para o plano escolhido. Só para
// usuário autenticado; o tenant vem da sessão. Redireciona (303) para a
// página da Stripe — Location relativo não serve aqui (destino externo),
// então usamos a origem encaminhada pelo LB.
export async function POST(req: NextRequest) {
  const session = await getDevSession();
  if (!session) return NextResponse.redirect(new URL("/login?next=/planos", originOf(req)), 303);

  const form = await req.formData();
  const plan = String(form.get("plan") || "") as Plan;
  if (!PLANS[plan] || !PLANS[plan].stripePriceIdMonth) {
    return NextResponse.redirect(new URL("/planos?erro=plano", originOf(req)), 303);
  }

  try {
    const url = await createCheckoutSession({
      plan,
      tenantId: session.tenantId,
      email: session.email,
      origin: originOf(req),
    });
    return NextResponse.redirect(url, 303);
  } catch {
    return NextResponse.redirect(new URL("/planos?erro=stripe", originOf(req)), 303);
  }
}

// Reconstrói a origem pública a partir do Host encaminhado pelo LB (atrás do
// LB o req.url resolve para o host interno do container).
function originOf(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "work4you.ai";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
