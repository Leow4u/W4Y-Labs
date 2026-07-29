// Núcleo de billing (reuse-first): Stripe (assinatura) + OpenRouter
// Provisioning (crédito por tenant). Nada de infra própria — orquestração.
//
// Modelo de negócio (igual ao Hermes hospedado): tiers com créditos mensais.
// Ao ativar uma assinatura, provisionamos uma runtime key OpenRouter com
// `limit` em USD = crédito do plano; o corte de saldo é o 402 do OpenRouter,
// que o Wayne já trata nativamente.

import "server-only";

import { sql } from "drizzle-orm";

// ---- catálogo de planos (price IDs criados no Stripe em modo teste) --------
export type Plan = "free" | "starter" | "pro" | "max";
export type BillingInterval = "month" | "year";

export interface PlanDef {
  key: Plan;
  label: string;
  priceUsdMonth: number; // exibição (US$/mês)
  priceUsdYear: number; // cobrança anual (≈ 10× mensal = ~2 meses grátis)
  creditsUsd: number; // limite da runtime key OpenRouter (custo/teto real)
  stripePriceIdMonth: string | null; // null = sem checkout (Free ou price não configurado)
  stripePriceIdYear: string | null;
  rolloverUsd: number;
  trialDays: number; // dias de trial grátis na 1ª assinatura (0 = sem trial)
}

// Unidade "créditos" exibida ao usuário: 1 crédito = US$ 0,01. Esconde o custo
// financeiro real (US$) atrás de uma contagem de créditos (estilo Manus/Grok).
export const CREDIT_USD = 0.01;
export function creditsForDisplay(usd: number): number {
  return Math.round(usd / CREDIT_USD);
}

// Allowance do trial gratuito (Free): um "gostinho" com teto pequeno na chave
// OpenRouter, dado no onboarding antes de assinar um plano pago.
export const FREE_TRIAL_USD = 3;

// Trial de lançamento: 7 dias por US$ 0 na 1ª assinatura paga (isca de entrada,
// modelo Grok "Experimente por $0.00"). Vai em subscription_data.trial_period_days.
export const DEFAULT_TRIAL_DAYS = 7;

// price ID de env (criado como price de teste na Stripe no go-live); "" → null.
function envPrice(name: string): string | null {
  return process.env[name]?.trim() || null;
}

// Catálogo de planos INDIVIDUAIS (preço em US$ — decisão do Leonardo 2026-07-07).
// creditsUsd = teto de gasto da runtime key (custo máximo); crédito exibido =
// creditsForDisplay(creditsUsd). Anual ≈ 10× mensal (2 meses grátis). Price IDs
// vêm do ambiente — null desabilita o checkout até configurá-los no go-live.
export const PLANS: Record<Plan, PlanDef> = {
  free: {
    key: "free", label: "Free", priceUsdMonth: 0, priceUsdYear: 0, creditsUsd: 0,
    stripePriceIdMonth: null, stripePriceIdYear: null, rolloverUsd: 0, trialDays: 0,
  },
  starter: {
    key: "starter", label: "Starter", priceUsdMonth: 19, priceUsdYear: 190, creditsUsd: 6,
    stripePriceIdMonth: envPrice("STRIPE_PRICE_STARTER"), stripePriceIdYear: envPrice("STRIPE_PRICE_STARTER_YEAR"),
    rolloverUsd: 3, trialDays: DEFAULT_TRIAL_DAYS,
  },
  pro: {
    key: "pro", label: "Pro", priceUsdMonth: 49, priceUsdYear: 490, creditsUsd: 16,
    stripePriceIdMonth: envPrice("STRIPE_PRICE_PRO"), stripePriceIdYear: envPrice("STRIPE_PRICE_PRO_YEAR"),
    rolloverUsd: 8, trialDays: DEFAULT_TRIAL_DAYS,
  },
  max: {
    key: "max", label: "Max", priceUsdMonth: 99, priceUsdYear: 990, creditsUsd: 38,
    stripePriceIdMonth: envPrice("STRIPE_PRICE_MAX"), stripePriceIdYear: envPrice("STRIPE_PRICE_MAX_YEAR"),
    rolloverUsd: 19, trialDays: DEFAULT_TRIAL_DAYS,
  },
};

// Preço e price ID por intervalo (mensal/anual) — usados pela UI e pelo checkout.
export function planPrice(def: PlanDef, interval: BillingInterval): number {
  return interval === "year" ? def.priceUsdYear : def.priceUsdMonth;
}
export function planPriceId(def: PlanDef, interval: BillingInterval): string | null {
  return interval === "year" ? def.stripePriceIdYear : def.stripePriceIdMonth;
}

// Conta empresarial (aba "Empresas"): Business por assento + Enterprise (contato).
// O billing por assento + gestão de equipe é FASE PRÓPRIA — aqui só o dado de
// exibição do card (o "Criar equipe" ainda não faz checkout por assento).
export const TEAM_SEAT_USD_MONTH = 39;

export function planByPriceId(priceId: string): PlanDef | undefined {
  if (!priceId) return undefined; // não casar contra planos sem price configurado
  return Object.values(PLANS).find(
    (p) => p.stripePriceIdMonth === priceId || p.stripePriceIdYear === priceId,
  );
}

/** Resolve plan from subscription items — ignore metered overage line. */
export function planFromSubscriptionItems(
  items: { price?: { id?: string } | null }[] | undefined | null,
): PlanDef | undefined {
  for (const item of items ?? []) {
    const id = item.price?.id ?? "";
    if (!id || id === overagePriceId()) continue;
    const def = planByPriceId(id);
    if (def) return def;
  }
  return undefined;
}

/** Shared metered overage price ($0.01 / unit). Empty = metered billing off. */
export function overagePriceId(): string | null {
  return envPrice("STRIPE_PRICE_OVERAGE");
}

export function isOverageMeteredConfigured(): boolean {
  return Boolean(overagePriceId());
}

// Regime da máquina Fly por plano: Pro/Max = sempre-acesa (canais persistentes/
// "funcionário 24h"); Free/Starter = dorme ociosa (suspend).
export function planRegime(plan: Plan): "base" | "premium" {
  return plan === "pro" || plan === "max" ? "premium" : "base";
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
// Pin da versão da API: o default da conta já descontinuou ui_mode="embedded"
// (virou "embedded_page"), que o <EmbeddedCheckout> do @stripe/react-stripe-js
// NÃO renderiza. Pinamos numa versão que ainda aceita "embedded" e casa com o
// Stripe.js do componente. (Webhooks chegam na versão da conta — não afetados.)
const STRIPE_API_VERSION = "2025-03-31.basil";
async function stripe(
  path: string,
  method: "GET" | "POST",
  form?: Record<string, string>,
  opts?: { idempotencyKey?: string },
) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_KEY()}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(opts?.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`stripe ${path}: ${json?.error?.message ?? res.status}`);
  return json;
}

// Campos comuns às duas sessões (hospedada e embedded). O cartão é sempre
// digitado no iframe/domínio da Stripe — nunca tocamos em dados de cartão.
function checkoutBase(opts: {
  plan: Plan;
  interval: BillingInterval;
  tenantId: string;
  email: string;
}): Record<string, string> {
  const def = PLANS[opts.plan];
  const priceId = planPriceId(def, opts.interval);
  if (!priceId) throw new Error("plano sem checkout (free ou price não configurado)");
  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    customer_email: opts.email,
    client_reference_id: opts.tenantId,
    "metadata[tenant_id]": opts.tenantId,
    "metadata[plan]": opts.plan,
    "metadata[interval]": opts.interval,
    "subscription_data[metadata][tenant_id]": opts.tenantId,
    "subscription_data[metadata][plan]": opts.plan,
    ...(def.trialDays ? { "subscription_data[trial_period_days]": String(def.trialDays) } : {}),
  };
  // Metered overage is attached after checkout via ensureOverageSubscriptionItem
  // (activate / spend-limit) so a misconfigured STRIPE_PRICE_OVERAGE cannot break signup.
  return form;
}

// Checkout HOSPEDADO (fallback/legado): redireciona ao domínio da Stripe.
export async function createCheckoutSession(opts: {
  plan: Plan;
  interval?: BillingInterval;
  tenantId: string;
  email: string;
  origin: string;
}): Promise<string> {
  const session = await stripe("checkout/sessions", "POST", {
    ...checkoutBase({ ...opts, interval: opts.interval ?? "month" }),
    success_url: `${opts.origin}/instancias?assinatura=ok`,
    cancel_url: `${opts.origin}/planos?assinatura=cancelada`,
  });
  return session.url as string;
}

// Checkout EMBEDDED (in-app, fluxo principal): o formulário de pagamento
// renderiza DENTRO do Work4You (ui_mode=embedded) — assina sem sair da
// plataforma. Retorna o client_secret que o <EmbeddedCheckout> monta no
// cliente; o cartão segue 100% no iframe da Stripe (PCI).
export async function createEmbeddedCheckoutSession(opts: {
  plan: Plan;
  interval: BillingInterval;
  tenantId: string;
  email: string;
  origin: string;
}): Promise<string> {
  const session = await stripe("checkout/sessions", "POST", {
    ...checkoutBase(opts),
    // embedded (in-app; client_secret p/ o <EmbeddedCheckout>). A versão da API
    // é pinada em STRIPE_API_VERSION pra "embedded" continuar aceito.
    ui_mode: "embedded",
    return_url: `${opts.origin}/planos/retorno?session_id={CHECKOUT_SESSION_ID}`,
  });
  return session.client_secret as string;
}

// Status de uma sessão de checkout (usado na página de retorno do embedded).
// "complete" = concluída (a ativação real vem pelo webhook checkout.session.completed).
export async function getCheckoutSessionStatus(
  sessionId: string,
): Promise<{ status: string; paymentStatus: string }> {
  const s = await stripe(`checkout/sessions/${encodeURIComponent(sessionId)}`, "GET");
  return { status: String(s.status ?? ""), paymentStatus: String(s.payment_status ?? "") };
}

/** Stripe Customer Portal — manage payment method / cancel / invoices (D5). */
export async function createBillingPortalSession(opts: {
  customerId: string;
  returnUrl: string;
}): Promise<string> {
  const session = await stripe("billing_portal/sessions", "POST", {
    customer: opts.customerId,
    return_url: opts.returnUrl,
  });
  return String(session.url ?? "");
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

/** Max on-demand spend limit ($/ciclo) by plan — circuit breaker + invoice cap. */
export function maxOndemandSpendLimitUsd(plan: Plan): number {
  switch (plan) {
    case "starter":
      return 20;
    case "pro":
      return 50;
    case "max":
      return 100;
    default:
      return 0;
  }
}

/**
 * On-demand $ used this cycle = usage beyond included pool since baseline.
 * Returns 0 when baseline is unknown (first cycle / not seeded).
 */
export function computeOndemandUsedUsd(opts: {
  usage: number;
  baseline: number | null | undefined;
  includedUsd: number;
  spendLimitUsd?: number;
}): number {
  const baseline = opts.baseline;
  if (baseline == null || !Number.isFinite(baseline)) return 0;
  const included = Math.max(0, Number(opts.includedUsd) || 0);
  const cycle = Math.max(0, Number(opts.usage) - baseline);
  let ondemand = Math.max(0, cycle - included);
  const cap = opts.spendLimitUsd;
  if (cap != null && Number.isFinite(cap) && cap > 0) {
    ondemand = Math.min(ondemand, cap);
  }
  return Number(ondemand.toFixed(2));
}

export interface KeyUsageSnapshot {
  usage: number;
  limit: number;
  remaining: number;
}

export async function fetchKeyUsage(keyHash: string): Promise<KeyUsageSnapshot> {
  const info = await openrouter(`keys/${keyHash}`, "GET");
  const d = info.data ?? info;
  const usage = Number(d.usage ?? 0);
  const limit = Number(d.limit ?? 0);
  return {
    usage,
    limit,
    remaining: Math.max(0, limit - usage),
  };
}

/**
 * Cumulative OpenRouter ceiling: from current usage, allow
 * included + on-demand (+ optional rollover on renew). Never sets an absolute
 * plan-only limit that would collapse mid-cycle headroom.
 */
export async function applyTenantKeyCeiling(opts: {
  keyHash: string;
  includedUsd: number;
  spendLimitUsd?: number;
  rolloverUsd?: number;
}): Promise<{ newLimit: number; usage: number }> {
  const snap = await fetchKeyUsage(opts.keyHash);
  const spend = Math.max(0, Number(opts.spendLimitUsd ?? 0));
  const rollover = Math.max(0, Number(opts.rolloverUsd ?? 0));
  const included = Math.max(0, Number(opts.includedUsd ?? 0));
  const newLimit = Number((snap.usage + included + rollover + spend).toFixed(2));
  await openrouter(`keys/${opts.keyHash}`, "PATCH", { limit: newLimit });
  return { newLimit, usage: snap.usage };
}

/** Idempotent schema upgrade for Conta on-demand columns (no drizzle migrate yet). */
export async function ensureOndemandColumns(
  exec: (q: ReturnType<typeof sql>) => Promise<unknown>,
): Promise<void> {
  await exec(sql`ALTER TABLE billing ADD COLUMN IF NOT EXISTS ondemand_enabled boolean NOT NULL DEFAULT false`);
  await exec(
    sql`ALTER TABLE billing ADD COLUMN IF NOT EXISTS ondemand_spend_limit_usd numeric(12,2) NOT NULL DEFAULT 0`,
  );
  await exec(sql`ALTER TABLE billing ADD COLUMN IF NOT EXISTS cycle_usage_baseline_usd numeric(12,2)`);
}

type StripeSubItem = {
  id?: string;
  price?: { id?: string } | null;
};

/** Find the metered overage subscription item, if present. */
export async function findOverageSubscriptionItem(
  subscriptionId: string,
): Promise<{ id: string } | null> {
  const overage = overagePriceId();
  if (!overage || !subscriptionId) return null;
  const sub = await stripe(`subscriptions/${encodeURIComponent(subscriptionId)}`, "GET");
  const items = (sub.items?.data ?? []) as StripeSubItem[];
  const hit = items.find((it) => it.price?.id === overage && it.id);
  return hit?.id ? { id: hit.id } : null;
}

/**
 * Ensure the metered overage price is attached to an existing subscription
 * (legacy checkouts that only had the flat plan price).
 */
export async function ensureOverageSubscriptionItem(
  subscriptionId: string,
): Promise<{ id: string } | null> {
  const overage = overagePriceId();
  if (!overage || !subscriptionId) return null;
  const existing = await findOverageSubscriptionItem(subscriptionId);
  if (existing) return existing;
  const created = await stripe("subscription_items", "POST", {
    subscription: subscriptionId,
    price: overage,
  });
  return created?.id ? { id: String(created.id) } : null;
}

/** Meter event name for $0.01 on-demand units (must match Stripe Billing Meter). */
export const OVERAGE_METER_EVENT = "w4y_ondemand_overage_cent";

/**
 * Report on-demand overage via Stripe Billing Meter events.
 * STRIPE_PRICE_OVERAGE must be a meter-backed price at **$0.01 per unit**;
 * value = cents. Appears on the **next** invoice (honest MVP).
 */
export async function reportOverageUsage(opts: {
  subscriptionId: string;
  overageUsd: number;
  idempotencyKey: string;
}): Promise<{ reportedCents: number; skipped?: string }> {
  const overage = Number(opts.overageUsd);
  if (!Number.isFinite(overage) || overage <= 0) {
    return { reportedCents: 0, skipped: "zero" };
  }
  if (!overagePriceId()) {
    return { reportedCents: 0, skipped: "not_configured" };
  }

  const sub = await stripe(`subscriptions/${encodeURIComponent(opts.subscriptionId)}`, "GET");
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) {
    return { reportedCents: 0, skipped: "no_customer" };
  }

  // Keep the metered price on the subscription so invoices can include it.
  await ensureOverageSubscriptionItem(opts.subscriptionId);

  const cents = Math.max(0, Math.round(overage * 100));
  if (cents <= 0) {
    return { reportedCents: 0, skipped: "zero_cents" };
  }

  await stripe(
    "billing/meter_events",
    "POST",
    {
      event_name: OVERAGE_METER_EVENT,
      "payload[stripe_customer_id]": String(customerId),
      "payload[value]": String(cents),
      identifier: opts.idempotencyKey.slice(0, 100),
      timestamp: String(Math.floor(Date.now() / 1000)),
    },
    { idempotencyKey: opts.idempotencyKey },
  );
  return { reportedCents: cents };
}

/**
 * Compute + report previous-cycle overage, then caller renews ceiling/baseline.
 * Best-effort: failures are logged by the caller; renew should still proceed.
 */
export async function reportCycleOverage(opts: {
  subscriptionId: string;
  keyHash: string;
  plan: Plan;
  baselineUsd: number | null | undefined;
  spendLimitUsd: number;
  idempotencyKey: string;
}): Promise<{ overageUsd: number; reportedCents: number; skipped?: string }> {
  const included = PLANS[opts.plan]?.creditsUsd ?? 0;
  const snap = await fetchKeyUsage(opts.keyHash);
  const overageUsd = computeOndemandUsedUsd({
    usage: snap.usage,
    baseline: opts.baselineUsd,
    includedUsd: included,
    spendLimitUsd: opts.spendLimitUsd > 0 ? opts.spendLimitUsd : undefined,
  });
  const reported = await reportOverageUsage({
    subscriptionId: opts.subscriptionId,
    overageUsd,
    idempotencyKey: opts.idempotencyKey,
  });
  return { overageUsd, reportedCents: reported.reportedCents, skipped: reported.skipped };
}

// RENOVAÇÃO MENSAL (disparada pelo invoice.paid da Stripe, no dia exato da
// cobrança de cada tenant): o limite da runtime key OpenRouter é CUMULATIVO
// (teto total de gasto), então recarregar = novo_limite = já_consumido +
// créditos_do_mês + rollover + on-demand spend limit.
export async function renewTenantCredits(opts: {
  tenantId: string;
  keyHash: string;
  plan: Plan;
  spendLimitUsd?: number;
}): Promise<{ newLimit: number; rolledOver: number; usage: number } | null> {
  const def = PLANS[opts.plan];
  if (!def.creditsUsd) return null; // Free não renova
  const snap = await fetchKeyUsage(opts.keyHash);
  const rolledOver = Math.min(snap.remaining, def.rolloverUsd);
  const spend = Math.max(0, Number(opts.spendLimitUsd ?? 0));
  const applied = await applyTenantKeyCeiling({
    keyHash: opts.keyHash,
    includedUsd: def.creditsUsd,
    spendLimitUsd: spend,
    rolloverUsd: rolledOver,
  });
  return { newLimit: applied.newLimit, rolledOver, usage: applied.usage };
}

// Provisiona (ou re-limita) a runtime key do tenant e retorna a chave + hash.
// A chave em si vai como secret na máquina Fly do tenant (fase provisionador);
// no registry guardamos só o hash.
export async function provisionTenantKey(opts: {
  tenantId: string;
  creditsUsd: number;
  existingHash?: string | null;
  /** When re-limiting an existing key, prefer cumulative headroom (included + spend). */
  spendLimitUsd?: number;
  cumulative?: boolean;
}): Promise<{ key: string; hash: string }> {
  if (opts.existingHash) {
    if (opts.cumulative) {
      await applyTenantKeyCeiling({
        keyHash: opts.existingHash,
        includedUsd: opts.creditsUsd,
        spendLimitUsd: opts.spendLimitUsd ?? 0,
      });
      return { key: "", hash: opts.existingHash };
    }
    // Legacy absolute re-limit (new keys / reconcile paths that pass a fresh ceiling).
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
