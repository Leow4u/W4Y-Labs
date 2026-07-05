// Núcleo de billing (reuse-first): Stripe (assinatura) + OpenRouter
// Provisioning (crédito por tenant). Nada de infra própria — orquestração.
//
// Modelo de negócio (igual ao Hermes hospedado): tiers com créditos mensais.
// Ao ativar uma assinatura, provisionamos uma runtime key OpenRouter com
// `limit` em USD = crédito do plano; o corte de saldo é o 402 do OpenRouter,
// que o Wayne já trata nativamente.

import "server-only";

// ---- catálogo de planos (price IDs criados no Stripe em modo teste) --------
export type Plan = "free" | "plus" | "super" | "ultra";

export interface PlanDef {
  key: Plan;
  label: string;
  priceBrlMonth: number; // exibição
  creditsUsd: number; // limite da runtime key OpenRouter
  stripePriceId: string | null; // null = Free (sem checkout)
  rolloverUsd: number;
}

export const PLANS: Record<Plan, PlanDef> = {
  free: { key: "free", label: "Free", priceBrlMonth: 0, creditsUsd: 0, stripePriceId: null, rolloverUsd: 0 },
  plus: { key: "plus", label: "Plus", priceBrlMonth: 20, creditsUsd: 4, stripePriceId: "price_1TpffiCn608ngT3WedTcDajk", rolloverUsd: 2 },
  super: { key: "super", label: "Super", priceBrlMonth: 100, creditsUsd: 22, stripePriceId: "price_1TpffjCn608ngT3Wc7U646sw", rolloverUsd: 10 },
  ultra: { key: "ultra", label: "Ultra", priceBrlMonth: 200, creditsUsd: 45, stripePriceId: "price_1TpfflCn608ngT3Wbg5HQLTa", rolloverUsd: 20 },
};

export function planByPriceId(priceId: string): PlanDef | undefined {
  return Object.values(PLANS).find((p) => p.stripePriceId === priceId);
}

// Regime da máquina Fly por plano: Super/Ultra = sempre-acesa (canais
// persistentes/"funcionário 24h"); Free/Plus = dorme ociosa (suspend).
export function planRegime(plan: Plan): "base" | "premium" {
  return plan === "super" || plan === "ultra" ? "premium" : "base";
}

// ---- segredos: env (Secret Manager em prod; .env.local em dev) -------------
// Em produção os três chegam como env vars do Secret Manager (deploy-web.ps1).
// Em dev, ficam no .env.local — nunca lemos .secrets/ do código (o tracer do
// Next tentaria empacotar o caminho e quebraria o build standalone).
function readSecret(envName: string): string {
  return process.env[envName]?.trim() ?? "";
}
const STRIPE_KEY = () => readSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = () => readSecret("STRIPE_WEBHOOK_SECRET");
const OPENROUTER_PROVISIONING_KEY = () => readSecret("OPENROUTER_PROVISIONING_KEY");

// ---- Stripe: chamadas via REST (sem SDK — reuse mínimo, x-www-form) --------
async function stripe(path: string, method: "GET" | "POST", form?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_KEY()}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`stripe ${path}: ${json?.error?.message ?? res.status}`);
  return json;
}

// Cria a sessão de Checkout hospedada da Stripe (assinatura mensal). O cartão
// é digitado no domínio da Stripe — nunca tocamos em dados de cartão.
export async function createCheckoutSession(opts: {
  plan: Plan;
  tenantId: string;
  email: string;
  origin: string;
}): Promise<string> {
  const def = PLANS[opts.plan];
  if (!def.stripePriceId) throw new Error("plano sem checkout (free)");
  const session = await stripe("checkout/sessions", "POST", {
    mode: "subscription",
    "line_items[0][price]": def.stripePriceId,
    "line_items[0][quantity]": "1",
    customer_email: opts.email,
    client_reference_id: opts.tenantId,
    "metadata[tenant_id]": opts.tenantId,
    "metadata[plan]": opts.plan,
    "subscription_data[metadata][tenant_id]": opts.tenantId,
    "subscription_data[metadata][plan]": opts.plan,
    success_url: `${opts.origin}/instancias?assinatura=ok`,
    cancel_url: `${opts.origin}/precos?assinatura=cancelada`,
  });
  return session.url as string;
}

// Verifica a assinatura HMAC do webhook Stripe (t=...,v1=...) sem SDK.
export async function verifyStripeSignature(rawBody: string, sigHeader: string): Promise<boolean> {
  const secret = STRIPE_WEBHOOK_SECRET();
  if (!secret) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=")));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // comparação de tempo constante
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

// ---- OpenRouter Provisioning: runtime key por tenant com limite USD --------
async function openrouter(path: string, method: string, body?: unknown) {
  const res = await fetch(`https://openrouter.ai/api/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${OPENROUTER_PROVISIONING_KEY()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`openrouter ${path}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

// RENOVAÇÃO MENSAL (disparada pelo invoice.paid da Stripe, no dia exato da
// cobrança de cada tenant): o limite da runtime key OpenRouter é CUMULATIVO
// (teto total de gasto), então recarregar = novo_limite = já_consumido +
// créditos_do_mês + rollover. O rollover é o que sobrou do ciclo anterior,
// limitado ao teto do plano — exatamente o modelo do Hermes hospedado.
export async function renewTenantCredits(opts: {
  tenantId: string;
  keyHash: string;
  plan: Plan;
}): Promise<{ newLimit: number; rolledOver: number } | null> {
  const def = PLANS[opts.plan];
  if (!def.creditsUsd) return null; // Free não renova
  const info = await openrouter(`keys/${opts.keyHash}`, "GET");
  const d = info.data ?? info;
  const usage = Number(d.usage ?? 0);
  const limit = Number(d.limit ?? 0);
  const remaining = Math.max(0, limit - usage);
  const rolledOver = Math.min(remaining, def.rolloverUsd);
  const newLimit = Number((usage + def.creditsUsd + rolledOver).toFixed(2));
  await openrouter(`keys/${opts.keyHash}`, "PATCH", { limit: newLimit });
  return { newLimit, rolledOver };
}

// Provisiona (ou re-limita) a runtime key do tenant e retorna a chave + hash.
// A chave em si vai como secret na máquina Fly do tenant (fase provisionador);
// no registry guardamos só o hash.
export async function provisionTenantKey(opts: {
  tenantId: string;
  creditsUsd: number;
  existingHash?: string | null;
}): Promise<{ key: string; hash: string }> {
  if (opts.existingHash) {
    // reusa a chave existente, só ajusta o limite ao novo plano
    const updated = await openrouter(`keys/${opts.existingHash}`, "PATCH", { limit: opts.creditsUsd });
    const d = updated.data ?? updated;
    return { key: "", hash: d.hash };
  }
  const created = await openrouter("keys", "POST", {
    name: `tenant:${opts.tenantId}`,
    limit: opts.creditsUsd,
  });
  return { key: created.key, hash: (created.data ?? created).hash };
}
