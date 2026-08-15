import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getDevSession, DEV_TENANT_ID } from "@/lib/dev-auth";
import { mintPlatformSsoTicket } from "@/lib/platform-sso";
import { loadTenantDashboardCreds } from "@/lib/tenant-secrets";
import {
  appSubdomainEnabled,
  appOrigin,
  cookieDomain,
} from "@/lib/site-origins";
import { pokeTenantWake } from "@/lib/wake-tenant";
import { sharedMotorEnabled, sharedMotorUrl, sharedFlyApp, desktopLaunchMode, postLoginDestination } from "@/lib/shared-motor";

export const dynamic = "force-dynamic";

// SSO Work4You → Wayne, POR TENANT (Fase 3). Resolve a instância do tenant
// no registry (URL + credenciais do dashboard daquela instância), autentica
// nela e COPIA os cookies de sessão verbatim — ou, com app.work4you.ai (E1),
// redirecciona para /auth/platform-sso no subdomínio app (cookies __Host-
// só podem ser emitidos na origem do tenant). Grava o cookie de ROTA
// `w4y_route` (Domain=.work4you.ai) para o router fly-replay.
const FALLBACK_URL = (process.env.WAYNE_INTERNAL_URL ?? "https://wayne-w4y.fly.dev").replace(/\/$/, "");
const ROUTE_COOKIE = "w4y_route";
const APP_RE = /^wayne-[a-z0-9-]{2,30}$/;

function ssoAppBase(): string {
  // Motor partilhado: app.work4you.ai quando DNS/router estiverem live;
  // até lá, hostname Fly directo (wayne-w4y.fly.dev).
  if (sharedMotorEnabled()) return sharedMotorUrl();
  return appOrigin();
}

function ssoAppPath(path: string): string {
  const base = ssoAppBase().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

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
      let password = row.dashboard_password ?? undefined;
      if (!password) {
        const sm = await loadTenantDashboardCreds(tenantId);
        if (sm) password = sm.password;
      }
      return {
        url: row.url.replace(/\/$/, ""),
        username: row.dashboard_username ?? undefined,
        password,
        flyApp: row.fly_app ?? undefined,
      };
    }
  } catch {
    /* registry indisponível — cai no fallback abaixo */
  }
  if (sharedMotorEnabled()) {
    return { url: sharedMotorUrl(), flyApp: sharedFlyApp() };
  }
  if (tenantId === DEV_TENANT_ID) return { url: FALLBACK_URL, flyApp: "wayne-w4y" };
  return null;
}

function setRouteCookie(res: NextResponse, flyApp: string): void {
  if (!APP_RE.test(flyApp)) return;
  const domain = cookieDomain();
  res.cookies.set(ROUTE_COOKIE, flyApp, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    ...(domain ? { domain } : {}),
  });
}

export async function GET() {
  const session = await getDevSession();
  if (!session) return redirectTo("/login");

  if (desktopLaunchMode()) {
    return redirectTo(postLoginDestination());
  }

  const target = await resolveTarget(session.tenantId);
  if (!target) {
    return redirectTo("/instancias");
  }

  void db()
    .execute(sql`UPDATE instances SET last_active=now() WHERE tenant_id=${session.tenantId}`)
    .catch(() => {
      /* não bloqueia o login se o registry oscilar */
    });

  const flyApp = target.flyApp ?? "";
  if (flyApp) {
    await pokeTenantWake(flyApp, target.url, { maxWaitMs: 25_000 });
  }

  const useAppHost = appSubdomainEnabled() && cookieDomain();
  const ticket = useAppHost ? mintPlatformSsoTicket(session.tenantId, session.email) : null;

  if (useAppHost && ticket) {
    const res = redirectTo(
      ssoAppPath(`/auth/platform-sso?ticket=${encodeURIComponent(ticket)}`),
    );
    setRouteCookie(res, sharedMotorEnabled() ? sharedFlyApp() : flyApp);
    return res;
  }

  if (useAppHost && !ticket) {
    return redirectTo("/login?error=sso");
  }

  // Same-origin fallback (local dev ou W4Y_APP_SUBDOMAIN=0).
  const res = redirectTo("/chat");
  setRouteCookie(res, sharedMotorEnabled() ? sharedFlyApp() : flyApp);

  const username = (target.username ?? process.env.WAYNE_DASHBOARD_USERNAME ?? "").trim();
  const password = (target.password ?? process.env.WAYNE_DASHBOARD_PASSWORD ?? "").trim();
  if (username && password) {
    try {
      const w = await fetch(`${target.url}/auth/password-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "basic", username, password, next: "/chat" }),
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (w.ok) {
        for (const sc of w.headers.getSetCookie()) {
          res.headers.append("set-cookie", sc);
        }
      }
    } catch {
      /* Wayne indisponível — /chat pede login se faltar cookie */
    }
  }
  return res;
}
