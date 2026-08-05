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
  wayneImage?: string;
}): Promise<boolean> {
  const wayneImage =
    opts.wayneImage?.trim() ||
    process.env.TENANT_WAYNE_IMAGE?.trim() ||
    undefined;
  try {
    const r = await call("/provision", { ...opts, ...(wayneImage ? { wayneImage } : {}) });
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
// re-deploy com imagem pinada quando TENANT_WAYNE_IMAGE está definido.
export async function requestReconfigure(
  app: string,
  plan: "base" | "premium",
  wayneImage?: string,
): Promise<boolean> {
  try {
    const image =
      wayneImage?.trim() ||
      process.env.TENANT_WAYNE_IMAGE?.trim() ||
      undefined;
    const r = await call("/reconfigure", { app, plan, ...(image ? { wayneImage: image } : {}) });
    return r.ok;
  } catch {
    return false;
  }
}

// Garante a chave capada na máquina do tenant: o provisionador CRIA a runtime
// key OpenRouter (limite = teto) E a injeta como secret OPENROUTER_API_KEY,
// atomicamente, devolvendo só o hash (a key crua nunca trafega). Usado na
// ativação de plano quando é preciso uma chave nova; sem isso a instância
// seguiria na chave antiga (sem o teto rígido). Re-limites reusam a mesma chave
// (via provisionTenantKey) e não passam por aqui. Retorna o hash ou null (falha
// → o reconciliador repara).
export async function requestEnsureKey(
  app: string,
  tenantId: string,
  limitUsd: number,
): Promise<string | null> {
  try {
    const r = await call("/ensure-key", { app, tenantId, limitUsd });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { hash?: string } | null;
    return j?.hash ?? null;
  } catch {
    return null;
  }
}

// Pivô desktop: pede ao provisionador uma runtime key OpenRouter POR
// DISPOSITIVO (nova, separada da key do Fly), com limite = crédito do plano.
// S0 conectores: a resposta pode trazer também uma chave Composio ADICIONAL
// do projeto DEDICADO do tenant (best-effort; null quando a Composio falhou —
// composioError curto explica). É o único fluxo em que chaves CRUAS transitam
// pela casca — seguem direto para o dispositivo do dono (motor local); nunca
// logar nem persistir as keys (o composioKeyId, não-secreto, serve à auditoria).
export async function requestDeviceKey(opts: {
  app: string | null;
  tenantId: string;
  limitUsd: number;
  deviceLabel?: string;
}): Promise<{
  key: string;
  hash: string;
  limitUsd: number;
  name: string;
  composioKey: string | null;
  composioKeyId: string | null;
  composioError: string | null;
  /** Shared platform tool secrets (Firecrawl / Langfuse). Never log values. */
  toolEnv: Record<string, string> | null;
} | null> {
  try {
    const r = await call("/device-key", opts);
    if (!r.ok) return null;
    const j = (await r.json()) as {
      key?: string;
      hash?: string;
      limitUsd?: number;
      name?: string;
      composioKey?: string | null;
      composioKeyId?: string | null;
      composioError?: string | null;
      toolEnv?: Record<string, unknown> | null;
    };
    if (!j.key || !j.hash) return null;
    let toolEnv: Record<string, string> | null = null;
    if (j.toolEnv && typeof j.toolEnv === "object" && !Array.isArray(j.toolEnv)) {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(j.toolEnv)) {
        if (typeof k === "string" && typeof v === "string" && v.trim()) {
          cleaned[k] = v.trim();
        }
      }
      if (Object.keys(cleaned).length) toolEnv = cleaned;
    }
    return {
      key: j.key,
      hash: j.hash,
      limitUsd: Number(j.limitUsd ?? opts.limitUsd),
      name: j.name ?? "",
      composioKey: typeof j.composioKey === "string" && j.composioKey ? j.composioKey : null,
      composioKeyId: typeof j.composioKeyId === "string" && j.composioKeyId ? j.composioKeyId : null,
      composioError: typeof j.composioError === "string" && j.composioError ? j.composioError : null,
      toolEnv,
    };
  } catch {
    return null;
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
