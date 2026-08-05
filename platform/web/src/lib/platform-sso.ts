import "server-only";
import crypto from "node:crypto";

/** Short-lived HMAC ticket for cross-subdomain SSO (platform → app.work4you.ai). */
export function mintPlatformSsoTicket(tenantId: string): string | null {
  const secret = process.env.PROVISIONER_SHARED_SECRET?.trim();
  if (!secret || !tenantId) return null;
  const payload = JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 120,
    tid: tenantId,
  });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}
