import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "off",
};

function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://apis.google.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: blob:",
        "font-src 'self' data:",
        "connect-src 'self' https://work4you.ai https://*.work4you.ai https://storage.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://challenges.cloudflare.com",
        "frame-src https://challenges.cloudflare.com https://accounts.google.com",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    );
  }
  return response;
}

function loginRedirect(request: NextRequest): NextResponse {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  const loginUrl = new URL(`${proto}://${host}/login`);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return withSecurityHeaders(NextResponse.redirect(loginUrl));
}

// Gate de página apenas para a ÁREA AUTENTICADA. A raiz `/` e as páginas
// institucionais são PÚBLICAS. API routes cuidam da própria auth via getDevSession().
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected =
    pathname === "/instancias" ||
    pathname.startsWith("/instancias/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");

  if (isProtected && !request.cookies.has(SESSION_COOKIE)) {
    return loginRedirect(request);
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
