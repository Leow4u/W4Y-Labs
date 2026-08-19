import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getDevSession } from "@/lib/dev-auth";
import { mintPlatformSsoTicket } from "@/lib/platform-sso";
import { loadTenantDashboardCreds } from "@/lib/tenant-secrets";
import {
  appSubdomainEnabled,
  appOrigin,
  cookieDomain,
} from "@/lib/site-origins";
import { pokeTenantWake } from "@/lib/wake-tenant";
import {
  isForbiddenCustomerFlyApp,
  desktopLaunchMode,
  postLoginDestination,
} from "@/lib/shared-motor";
import { ensureDedicatedFlyInstance } from "@/lib/ensure-dedicated-fly";

export const dynamic = "force-dynamic";

// SSO Work4You → dedicated Fly tenant (Claude v1 / F1).
 // Cookie `w4y_route` steers app.work4you.ai via router-w4y.
 // Shared lab app `wayne-w4y` is never a customer target.
const ROUTE_COOKIE = "w4y_route";
const APP_RE = /^wayne-[a-z0-9-]{2,30}$/;

function ssoAppPath(path: string): string {
  const base = appOrigin().replace(/\/$/, "");
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
      status: string | null;
    }>(
      sql`SELECT url, fly_app, dashboard_username, dashboard_password, status FROM instances WHERE tenant_id=${tenantId} LIMIT 1`,
    );
    const row = r.rows[0];
    if (!row) return null;
    if (isForbiddenCustomerFlyApp(row.fly_app)) return null;
    if (row.status && row.status !== "ready") return null;
    if (!row.url?.trim()) return null;

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
  } catch {
    return null;
  }
}

function setRouteCookie(res: NextResponse, flyApp: string): void {
  if (!APP_RE.test(flyApp) || isForbiddenCustomerFlyApp(flyApp)) return;
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

  let target = await resolveTarget(session.tenantId);
  if (!target) {
    const status = await ensureDedicatedFlyInstance({
      tenantId: session.tenantId,
      email: session.email,
    });
    if (status === "failed") {
      return redirectTo("/instancias?erro=provision");
    }
    // Dedicated machine still provisioning — onboarding / instancias wait UI.
    return redirectTo("/instancias?migrar=dedicada");
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
  const ticket = useAppHost
    ? mintPlatformSsoTicket(session.tenantId, session.email)
    : null;

  if (useAppHost && ticket) {
    const res = redirectTo(
      ssoAppPath(`/auth/platform-sso?ticket=${encodeURIComponent(ticket)}`),
    );
    setRouteCookie(res, flyApp);
    return res;
  }

  if (useAppHost && !ticket) {
    return redirectTo("/login?error=sso");
  }

  const res = redirectTo("/chat");
  setRouteCookie(res, flyApp);

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
