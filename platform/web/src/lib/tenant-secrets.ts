import "server-only";

import crypto from "node:crypto";

const PROJECT_ID = process.env.GCP_PROJECT_ID?.trim() || "project-67a4bd4d-a990-406b-9e7";

function secretId(tenantId: string): string {
  const safe = tenantId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  return `w4y-tenant-dash-${safe}`;
}

function orSecretId(tenantId: string): string {
  const safe = tenantId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  return `w4y-tenant-or-${safe}`;
}

function smEnabled(): boolean {
  return (process.env.TENANT_SECRETS_SM ?? "1") === "1";
}

/** Whether tenant secrets can be persisted at all (false in local dev). */
export function tenantSecretsEnabled(): boolean {
  return smEnabled();
}

async function gcpAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string };
    return j.access_token ?? null;
  } catch {
    return null;
  }
}

async function smFetch(method: string, path: string, body?: unknown): Promise<Response | null> {
  const token = await gcpAccessToken();
  if (!token) return null;
  return fetch(`https://secretmanager.googleapis.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
}

export interface TenantDashboardCreds {
  username: string;
  password: string;
}

/** Persiste credenciais do dashboard no Secret Manager (prod). Falha silenciosa em dev. */
export async function storeTenantDashboardCreds(
  tenantId: string,
  creds: TenantDashboardCreds,
): Promise<boolean> {
  if (!smEnabled()) return false;
  const sid = secretId(tenantId);
  const parent = `projects/${PROJECT_ID}`;
  const payload = Buffer.from(JSON.stringify(creds)).toString("base64");

  let r = await smFetch("GET", `${parent}/secrets/${sid}`);
  if (r?.status === 404) {
    r = await smFetch("POST", `${parent}/secrets?secretId=${encodeURIComponent(sid)}`, {
      replication: { automatic: {} },
      labels: { tenant_id: tenantId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 63) },
    });
    if (!r?.ok) return false;
  } else if (!r?.ok) {
    return false;
  }

  const add = await smFetch("POST", `${parent}/secrets/${sid}:addVersion`, {
    payload: { data: payload },
  });
  return add?.ok ?? false;
}

/** Lê credenciais do SM. Null se indisponível (dev local ou secret inexistente). */
export async function loadTenantDashboardCreds(
  tenantId: string,
): Promise<TenantDashboardCreds | null> {
  if (!smEnabled()) return null;
  const sid = secretId(tenantId);
  const path = `projects/${PROJECT_ID}/secrets/${sid}/versions/latest:access`;
  const r = await smFetch("POST", path);
  if (!r?.ok) return null;
  try {
    const j = (await r.json()) as { payload?: { data?: string } };
    const raw = j.payload?.data;
    if (!raw) return null;
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as TenantDashboardCreds;
    if (typeof parsed.username === "string" && typeof parsed.password === "string") {
      return parsed;
    }
  } catch {
    /* corrupt secret */
  }
  return null;
}

/** Hash curto para auditoria (nunca logar password). */
export function credsFingerprint(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex").slice(0, 12);
}

/** OpenRouter runtime key (shared motor bootstrap). Never log the value. */
export async function storeTenantOpenRouterKey(tenantId: string, key: string): Promise<boolean> {
  if (!smEnabled() || !key.trim()) return false;
  const sid = orSecretId(tenantId);
  const parent = `projects/${PROJECT_ID}`;
  const payload = Buffer.from(key.trim()).toString("base64");

  let r = await smFetch("GET", `${parent}/secrets/${sid}`);
  if (r?.status === 404) {
    r = await smFetch("POST", `${parent}/secrets?secretId=${encodeURIComponent(sid)}`, {
      replication: { automatic: {} },
      labels: { tenant_id: tenantId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 63) },
    });
    if (!r?.ok) return false;
  } else if (!r?.ok) {
    return false;
  }

  const add = await smFetch("POST", `${parent}/secrets/${sid}:addVersion`, {
    payload: { data: payload },
  });
  return add?.ok ?? false;
}

export async function loadTenantOpenRouterKey(tenantId: string): Promise<string | null> {
  if (!smEnabled()) return null;
  const sid = orSecretId(tenantId);
  const path = `projects/${PROJECT_ID}/secrets/${sid}/versions/latest:access`;
  const r = await smFetch("POST", path);
  if (!r?.ok) return null;
  try {
    const j = (await r.json()) as { payload?: { data?: string } };
    const raw = j.payload?.data;
    if (!raw) return null;
    const key = Buffer.from(raw, "base64").toString("utf8").trim();
    return key || null;
  } catch {
    return null;
  }
}
