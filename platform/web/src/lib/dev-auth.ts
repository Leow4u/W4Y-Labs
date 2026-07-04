import { cookies } from "next/headers";

/**
 * TEMPORARY stand-in for Identity Platform (docs/ARQUITETURA.md §7 — no
 * GCP/Firebase project exists yet). Trusts an unsigned cookie; local dev
 * only. Delete this file once real auth is wired and swap callers to the
 * Identity Platform session.
 */
export const DEV_SESSION_COOKIE = "w4y_dev_session";

export interface DevSession {
  email: string;
  tenantId: string;
  role: "admin" | "member";
}

// Operadores da plataforma (visão Admin). Derivado do e-mail a cada leitura —
// nada de role no cookie (evita cookie stale e adulteração trivial no stub).
// Com o Identity Platform, isso vira custom claim.
function resolveRole(email: string): DevSession["role"] {
  const admins = (process.env.ADMIN_EMAILS ?? "leonardo@dutelog.com.br")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase()) ? "admin" : "member";
}

export async function getDevSession(): Promise<DevSession | null> {
  const store = await cookies();
  const raw = store.get(DEV_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { email: string; tenantId: string };
    if (!parsed.email || !parsed.tenantId) return null;
    return { email: parsed.email, tenantId: parsed.tenantId, role: resolveRole(parsed.email) };
  } catch {
    return null;
  }
}

// Tenant fixo do stub de dev — o Identity Platform substitui isso.
export const DEV_TENANT_ID = "dev-tenant";

export async function setDevSession(email: string): Promise<void> {
  const store = await cookies();
  // role NÃO vai no cookie — é derivado do e-mail em getDevSession().
  const session = { email, tenantId: DEV_TENANT_ID };
  store.set(DEV_SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearDevSession(): Promise<void> {
  const store = await cookies();
  store.delete(DEV_SESSION_COOKIE);
}
