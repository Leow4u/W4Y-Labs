import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEV_SESSION_COOKIE } from "@/lib/dev-auth";

// Gate de página apenas para a ÁREA AUTENTICADA. A raiz `/` e as páginas
// institucionais (plataforma, soluções, modelos, clientes, preços, recursos)
// são PÚBLICAS — a landing é o produto. API routes cuidam da própria auth
// via getDevSession() (401 JSON, sem redirect HTML).
export function proxy(request: NextRequest) {
  if (!request.cookies.has(DEV_SESSION_COOKIE)) {
    // Reconstrói a origem a partir do Host encaminhado pelo Load Balancer
    // (o external Application LB preserva o Host = work4you.ai e seta
    // X-Forwarded-Proto). Derivar de request.url apontaria para o host
    // interno do container (0.0.0.0:8080) atrás do LB.
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    const loginUrl = new URL(`${proto}://${host}/login`);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  // /planos é gated (assinatura do tenant logado). /planos/checkout e
  // /webhooks/stripe cuidam da própria auth (checkout via sessão; webhook
  // via assinatura HMAC da Stripe) e ficam FORA do gate de página.
  matcher: ["/instancias", "/instancias/:path*", "/admin", "/admin/:path*", "/planos"],
};
