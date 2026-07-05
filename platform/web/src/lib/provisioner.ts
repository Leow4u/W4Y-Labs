import "server-only";
import crypto from "node:crypto";

// Cliente do serviço provisionador (app Fly que tem o org token). A casca
// nunca roda flyctl; delega a criação/arquivamento de tenants aqui, sempre
// autenticado por HMAC do corpo (mesma chave dos dois lados).
const URL_BASE = (process.env.PROVISIONER_URL ?? "https://provisioner-w4y.fly.dev").replace(/\/$/, "");
const SECRET = () => process.env.PROVISIONER_SHARED_SECRET?.trim() ?? "";

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET()).update(body).digest("hex");
}

// Verifica o callback do provisionador (/onboarding/complete).
export function verifyProvisionerSig(raw: string, sig: string): boolean {
  const secret = SECRET();
  if (!secret || !sig) return false;
  const expected = sign(raw);
  return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

async function call(path: string, payload: unknown): Promise<Response> {
  const body = JSON.stringify(payload);
  return fetch(`${URL_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-provisioner-sig": sign(body) },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
}

// Dispara o provisionamento (async no lado do serviço; 202 imediato). O
// resultado volta por callback em /onboarding/complete.
export async function requestProvision(opts: {
  tenantId: string;
  slug: string;
  email: string;
  plan: "base" | "premium";
  trialUsd: number;
}): Promise<boolean> {
  try {
    const r = await call("/provision", opts);
    return r.status === 202;
  } catch {
    return false;
  }
}

// Arquiva (snapshot + destrói) o app Fly de um tenant inativo.
export async function requestArchive(app: string): Promise<boolean> {
  try {
    const r = await call("/archive", { app });
    return r.ok;
  } catch {
    return false;
  }
}

// Troca o regime da máquina do tenant (upgrade/downgrade de plano):
// base = dorme ociosa; premium = sempre-acesa. Re-deploy do app (~30s).
export async function requestReconfigure(app: string, plan: "base" | "premium"): Promise<boolean> {
  try {
    const r = await call("/reconfigure", { app, plan });
    return r.ok;
  } catch {
    return false;
  }
}

// slug determinístico-ish e válido (^[a-z0-9-]{2,24}$): parte local do
// e-mail sanitizada + sufixo aleatório curto (evita colisão).
export function slugFor(email: string): string {
  const base = (email.split("@")[0] || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 14) || "user";
  const suffix = crypto.randomBytes(3).toString("hex"); // 6 chars
  return `${base}-${suffix}`;
}
