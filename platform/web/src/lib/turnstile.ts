import "server-only";

// Verifica o token do Turnstile (Cloudflare) no servidor. Sem secret
// configurada, o gate é transparente (retorna true). Usado no /login/verify
// para proteger o auto-provisionamento (ponto caro).
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET?.trim();
  if (!secret) return true;
  if (!token) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    });
    const d = (await r.json()) as { success?: boolean };
    return d.success === true;
  } catch {
    return false; // fail-closed
  }
}
