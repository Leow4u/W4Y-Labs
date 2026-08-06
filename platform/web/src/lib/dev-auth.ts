import { cookies } from "next/headers";
import { cookieDomain } from "@/lib/site-origins";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  signSession,
  verifySession,
  type SessionPayload,
} from "@/lib/session-cookie";

/** @deprecated Use SESSION_COOKIE — kept for middleware import compatibility. */
export const DEV_SESSION_COOKIE = SESSION_COOKIE;

export interface DevSession {
  email: string;
  tenantId: string;
  role: "admin" | "member";
}

// Platform operators. Role is derived at read time from email — never stored in
// the signed token payload extensions (custom claims later with Identity Platform).
function resolveRole(email: string): DevSession["role"] {
  const admins = (process.env.ADMIN_EMAILS ?? "leonardo@dutelog.com.br")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase()) ? "admin" : "member";
}

export async function getDevSession(): Promise<DevSession | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const verified = await verifySession(raw);
  if (verified) {
    return { ...verified, role: resolveRole(verified.email) };
  }

  // Legacy unsigned cookie (dev migration only). Reject in production.
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as SessionPayload;
    if (!parsed.email || !parsed.tenantId) return null;
    return { email: parsed.email, tenantId: parsed.tenantId, role: resolveRole(parsed.email) };
  } catch {
    return null;
  }
}

export const DEV_TENANT_ID = "dev-tenant";

export async function setDevSession(email: string, tenantId?: string): Promise<void> {
  const store = await cookies();
  const payload: SessionPayload = { email, tenantId: tenantId || DEV_TENANT_ID };
  const token = await signSession(payload);
  const domain = cookieDomain();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
    ...(domain ? { domain } : {}),
  });
}

export async function clearDevSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
