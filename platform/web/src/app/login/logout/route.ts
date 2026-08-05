import { NextRequest, NextResponse } from "next/server";
import { DEV_SESSION_COOKIE } from "@/lib/dev-auth";
import { cookieDomain } from "@/lib/site-origins";

// Cookies de sessão do Wayne. Sob HTTPS (produção, atrás do Load Balancer)
// o Wayne emite os nomes com prefixo __Host- (hardening de browser: exige
// Secure + Path=/ + sem Domain). Em loopback HTTP seriam os nomes crus.
// Como não sabemos qual variante o browser guarda, expiramos TODAS — e o
// __Host-/__Secure- só some se a deleção também vier com Secure.
const WAYNE_COOKIES = ["wayne_session_at", "wayne_session_rt", "wayne_session_pkce", "wayne_sso_attempt"];
// Cookie de rota do multi-tenant (roteador fly-replay) — limpo no logout.
const ROUTE_COOKIE = "w4y_route";
const PREFIXES = ["__Host-", "__Secure-", ""] as const;

// Sair da Work4You: limpa a sessão da plataforma E os cookies do Wayne
// (mesma origem work4you.ai, então dá para expirá-los aqui). Fica sob
// /login/* para ser roteado à casca (o /api/* agora é do Wayne).
export async function POST(req: NextRequest) {
  // Location relativo: atrás do Load Balancer o req.url resolve para o host
  // interno (0.0.0.0:8080); um redirect absoluto derivado dele apontaria
  // para fora do domínio. Relativo o browser resolve contra work4you.ai.
  const res = new NextResponse(null, { status: 303, headers: { Location: "/" } });
  res.cookies.delete(DEV_SESSION_COOKIE);
  const domain = cookieDomain();
  res.cookies.set(ROUTE_COOKIE, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    ...(domain ? { domain } : {}),
  });

  // Em produção (LB) o tráfego é sempre HTTPS; o header X-Forwarded-Proto
  // pode não chegar ao req.url, então marcamos Secure quando o protocolo
  // encaminhado é https OU quando a variante exige (prefixadas).
  const secure = (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https";
  for (const base of WAYNE_COOKIES) {
    for (const prefix of PREFIXES) {
      // __Host-/__Secure- só podem ser (re)escritos em contexto Secure;
      // as variantes prefixadas exigem secure=true para a deleção “pegar”.
      const needsSecure = prefix !== "";
      res.cookies.set(`${prefix}${base}`, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: needsSecure || secure,
      });
    }
  }
  return res;
}
