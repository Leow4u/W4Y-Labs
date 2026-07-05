import { NextResponse } from "next/server";
import { getDevSession } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

// SSO Work4You → Wayne. Depois do login da plataforma, autentica no Wayne
// (credenciais do Secret Manager) e COPIA os cookies de sessão do Wayne
// verbatim para a resposta — como casca e Wayne compartilham a origem
// work4you.ai (atrás do Load Balancer), o browser passa a mandar esses
// cookies para /chat, /sessions, etc. Um login só; o usuário cai direto
// no Wayne Agent. Nenhuma mudança no Wayne.
const WAYNE = (process.env.WAYNE_INTERNAL_URL ?? "https://wayne-w4y.fly.dev").replace(/\/$/, "");

// Redirect com Location RELATIVO. Atrás do Load Balancer o req.url do Next
// resolve para o host interno do container (0.0.0.0:8080), então
// `new URL("/chat", req.url)` geraria um Location absoluto errado. Um
// Location relativo é resolvido pelo browser contra a origem atual
// (work4you.ai) — imune ao host interno.
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function GET() {
  const session = await getDevSession();
  if (!session) return redirectTo("/login");

  const res = redirectTo("/chat");

  // .trim() espelha o .strip() que o Wayne aplica ao registrar o hash a
  // partir do env — o secret do password pode carregar um \n final e, sem
  // o trim, o hash não bateria (401 silencioso no SSO).
  const username = process.env.WAYNE_DASHBOARD_USERNAME?.trim();
  const password = process.env.WAYNE_DASHBOARD_PASSWORD?.trim();
  if (username && password) {
    try {
      const w = await fetch(`${WAYNE}/auth/password-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "basic", username, password, next: "/chat" }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (w.ok) {
        // getSetCookie() preserva cada Set-Cookie exatamente como o Wayne
        // emitiu (valor + atributos) — sem reencodar o token.
        for (const sc of w.headers.getSetCookie()) {
          res.headers.append("set-cookie", sc);
        }
      }
    } catch {
      // Wayne indisponível: segue para /chat; o próprio Wayne pedirá login
      // se faltar o cookie (fallback, não trava a porta).
    }
  }
  return res;
}
