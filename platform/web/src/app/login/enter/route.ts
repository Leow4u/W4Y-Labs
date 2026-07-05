import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getDevSession, DEV_TENANT_ID } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

// SSO Work4You → Wayne, POR TENANT (Fase 3). Resolve a instância do tenant
// no registry (URL + credenciais do dashboard daquela instância), autentica
// nela e COPIA os cookies de sessão verbatim — mesma origem work4you.ai
// atrás do LB. Também grava o cookie de ROTA `w4y_route` (nome do app Fly)
// que o roteador de sessão usa no fly-replay para levar /chat, /sessions,
// /api/* à instância certa. Um login só; o usuário cai direto no Wayne.
//
// Fallback de compatibilidade: tenant default sem linha no registry usa as
// envs globais (comportamento pré-multi-tenant).
const FALLBACK_URL = (process.env.WAYNE_INTERNAL_URL ?? "https://wayne-w4y.fly.dev").replace(/\/$/, "");
const ROUTE_COOKIE = "w4y_route";
const APP_RE = /^wayne-[a-z0-9-]{2,30}$/;

// Redirect com Location RELATIVO (atrás do LB o req.url resolve p/ o host
// interno do container — ver histórico do bug 0.0.0.0:8080).
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

interface Target {
  url: string;
  username?: string;
  password?: string;
  flyApp?: string;
}

async function resolveTarget(tenantId: string): Promise<Target | null> {
  try {
    const r = await db().execute<{
      url: string;
      fly_app: string | null;
      dashboard_username: string | null;
      dashboard_password: string | null;
    }>(sql`SELECT url, fly_app, dashboard_username, dashboard_password FROM instances WHERE tenant_id=${tenantId} LIMIT 1`);
    const row = r.rows[0];
    if (row) {
      return {
        url: row.url.replace(/\/$/, ""),
        username: row.dashboard_username ?? undefined,
        password: row.dashboard_password ?? undefined,
        flyApp: row.fly_app ?? undefined,
      };
    }
  } catch {
    /* registry indisponível — cai no fallback abaixo p/ o tenant default */
  }
  if (tenantId === DEV_TENANT_ID) return { url: FALLBACK_URL, flyApp: "wayne-w4y" };
  return null;
}

export async function GET() {
  const session = await getDevSession();
  if (!session) return redirectTo("/login");

  const target = await resolveTarget(session.tenantId);
  if (!target) {
    // Tenant ainda sem instância provisionada — a página explica o estado.
    return redirectTo("/instancias");
  }

  const res = redirectTo("/chat");

  // Cookie de rota para o roteador (fly-replay). Só grava nomes válidos.
  const flyApp = target.flyApp ?? "";
  if (APP_RE.test(flyApp)) {
    res.cookies.set(ROUTE_COOKIE, flyApp, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  // Credenciais: da instância (por tenant) ou das envs globais (fallback).
  const username = (target.username ?? process.env.WAYNE_DASHBOARD_USERNAME ?? "").trim();
  const password = (target.password ?? process.env.WAYNE_DASHBOARD_PASSWORD ?? "").trim();
  if (username && password) {
    try {
      const w = await fetch(`${target.url}/auth/password-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "basic", username, password, next: "/chat" }),
        cache: "no-store",
        signal: AbortSignal.timeout(20000), // wake de máquina suspensa + login
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
