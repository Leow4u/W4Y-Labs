import { SignJWT, jwtVerify } from "jose";

/** Signed platform session (replaces unsigned JSON cookie). */
export const SESSION_COOKIE = "w4y_session";

export interface SessionPayload {
  email: string;
  tenantId: string;
}

const ISSUER = "work4you.ai";
const AUDIENCE = "w4y-platform";
const MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

function sessionSecret(): Uint8Array | null {
  const raw = process.env.W4Y_SESSION_SECRET?.trim();
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

export function sessionSecretConfigured(): boolean {
  return Boolean(process.env.W4Y_SESSION_SECRET?.trim());
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error("W4Y_SESSION_SECRET is not configured");
  }
  return new SignJWT({ email: payload.email, tenantId: payload.tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const email = String(payload.email ?? "").trim().toLowerCase();
    const tenantId = String(payload.tenantId ?? "").trim();
    if (!email || !tenantId) return null;
    return { email, tenantId };
  } catch {
    return null;
  }
}

export { MAX_AGE_SEC as SESSION_MAX_AGE_SEC };
