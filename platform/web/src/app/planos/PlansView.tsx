"use client";

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { BillingInterval, Plan } from "@/lib/billing";
import { publicAppOrigin } from "@/lib/site-origins";

// Dado de exibição de um plano individual (montado no server a partir de PLANS —
// billing.ts é server-only, não pode ser importado aqui).
export interface PlanCard {
  key: Plan;
  label: string;
  tagline: string;
  priceMonth: number;
  priceYear: number;
}

interface PlansViewProps {
  plans: PlanCard[]; // starter, pro, max (nessa ordem)
  teamSeatUsd: number;
  current: { plan: string; status: string };
  publishableKey: string | null; // NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (null = checkout desabilitado)
  loggedIn: boolean; // deslogado → CTA manda pro cadastro guardando a escolha
  initialPlan?: Plan | null; // intenção vinda da querystring (?plan=) — auto-abre o checkout
  initialInterval?: BillingInterval;
}

// Copy das features — vitrine Cursor: preço + capacidades, sem pool em US$.
const FEATURES: Record<string, string[]> = {
  starter: [
    "Catálogo completo de modelos",
    "Limites de agente estendidos",
    "Chat, Skills e Conectores",
    "Sua instância pessoal na nuvem",
    "Rotinas e automações",
    "Suporte por e-mail",
  ],
  pro: [
    "Tudo do Essencial",
    "Modo MAX — modelos de ponta",
    "Instância sempre-ativa — agente 24/7 na nuvem",
    "Limites generosos de agente",
    "Respostas com prioridade",
  ],
  max: [
    "Tudo do Plus",
    "Limites ampliados de agente",
    "Prioridade máxima",
    "Suporte prioritário",
  ],
};

const BUSINESS_FEATURES = [
  "Tudo do Max para cada assento",
  "Compartilhamento e colaboração",
  "Cobrança e faturas centralizadas",
  "Gestão de assentos da equipe",
  "Relatórios e análise de uso",
  "Verificação de domínio",
  "Excluído do treino por padrão",
];

const ENTERPRISE_FEATURES = [
  "Usuários ilimitados",
  "Logon único (SSO)",
  "Sincronização de diretório (SCIM)",
  "Controles de acesso personalizados",
  "Retenção de dados customizada",
  "Suporte e integração dedicados",
];

const CONTACT_MAILTO = "mailto:contato@work4you.ai?subject=Work4You%20Business";

function priceEquivMonth(card: PlanCard): string {
  const perMonth = card.priceYear / 12;
  return `US$ ${perMonth.toFixed(2).replace(/\.00$/, "")}`;
}

export function PlansView({
  plans,
  teamSeatUsd,
  current,
  publishableKey,
  loggedIn,
  initialPlan = null,
  initialInterval,
}: PlansViewProps) {
  const [tab, setTab] = useState<"individual" | "empresas">("individual");
  const [interval, setBillingInterval] = useState<BillingInterval>(initialInterval ?? "month");
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);

  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );
  const checkoutEnabled = !!stripePromise;

  const fetchClientSecret = useCallback(async () => {
    const r = await fetch("/planos/checkout/embedded", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: checkoutPlan, interval }),
    });
    const j = (await r.json().catch(() => ({}))) as { clientSecret?: string; error?: string };
    if (!r.ok || !j.clientSecret) throw new Error(j.error || "checkout_failed");
    return j.clientSecret;
  }, [checkoutPlan, interval]);

  // Resume pós-cadastro: se veio com ?plan= e o usuário está logado + checkout
  // habilitado, abre o checkout daquele plano automaticamente.
  useEffect(() => {
    if (loggedIn && initialPlan && checkoutEnabled) setCheckoutPlan(initialPlan);
  }, [loggedIn, initialPlan, checkoutEnabled]);

  // CTA de um plano individual: logado → checkout embedded; deslogado → cadastro
  // guardando a escolha (?plan=&interval=) para retomar o checkout após o login.
  const onPickPlan = useCallback(
    (key: Plan) => {
      if (!loggedIn) {
        const intent = `/planos?plan=${key}&interval=${interval}`;
        window.location.href = `/login?next=${encodeURIComponent(intent)}`;
        return;
      }
      if (checkoutEnabled) setCheckoutPlan(key);
    },
    [loggedIn, interval, checkoutEnabled],
  );

  return (
    <>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <a href="/" className="font-brand text-xl font-semibold">Work4You</a>
        {loggedIn ? (
          <a
            href={`${publicAppOrigin()}/chat`}
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Ir para o app →
          </a>
        ) : (
          <a
            href="/login"
            className="font-brand rounded-full bg-neutral-100 px-4 py-1.5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100"
          >
            Entrar
          </a>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-12 pt-4">
        {/* Cabeçalho */}
        <div className="text-center">
          <h1 className="font-brand text-3xl font-semibold sm:text-4xl">Assine o Work4You</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Cancele quando quiser
            {loggedIn && (
              <>
                {" "}· plano atual: <strong className="font-brand uppercase">{current.plan}</strong>
                {current.status === "active" && " · ativo"}
              </>
            )}
            .
          </p>
        </div>

        {/* Abas Individual / Empresas */}
        <div className="mt-7 flex justify-center">
          <div className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-neutral-800">
            {(["individual", "empresas"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-5 py-1.5 text-sm font-medium capitalize transition ${
                  tab === t
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-950 dark:text-white"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                {t === "individual" ? "Individual" : "Empresas"}
              </button>
            ))}
          </div>
        </div>

        {tab === "individual" ? (
          <>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {plans.map((card) => {
                const destaque = card.key === "pro";
                const ativo = loggedIn && current.plan === card.key && current.status === "active";
                const price = interval === "year" ? card.priceYear : card.priceMonth;
                const disabled = ativo || (loggedIn && !checkoutEnabled);
                const cta = ativo
                  ? "Plano atual"
                  : loggedIn && !checkoutEnabled
                    ? "Em breve"
                    : `Assinar ${card.label}`;
                return (
                  <div
                    key={card.key}
                    className={`relative flex flex-col rounded-2xl border p-6 ${
                      destaque
                        ? "border-neutral-900 shadow-[0_16px_50px_-20px_rgba(0,0,0,0.25)] dark:border-white"
                        : "border-neutral-200 dark:border-neutral-800"
                    }`}
                  >
                    {destaque && (
                      <span className="absolute -top-3 left-6 rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-neutral-900">
                        Mais popular
                      </span>
                    )}
                    <h2 className="font-brand text-lg font-semibold">{card.label}</h2>
                    <p className="mt-0.5 text-sm text-neutral-500">{card.tagline}</p>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-3xl font-semibold">US$ {price}</span>
                      <span className="text-sm text-neutral-500">
                        /{interval === "year" ? "ano" : "mês"}
                      </span>
                    </div>
                    {interval === "year" && (
                      <p className="mt-0.5 text-xs text-neutral-400">
                        {priceEquivMonth(card)}/mês · 2 meses grátis
                      </p>
                    )}

                    <button
                      onClick={() => !disabled && onPickPlan(card.key)}
                      disabled={disabled}
                      className={`font-brand mt-5 w-full rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        destaque
                          ? "bg-neutral-900 text-white hover:opacity-85 dark:bg-white dark:text-neutral-900"
                          : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100"
                      }`}
                    >
                      {cta}
                    </button>

                    <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-neutral-600 dark:text-neutral-300">
                      {(FEATURES[card.key] ?? []).map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* Toggle anual */}
            <div className="mt-8 flex items-center justify-center gap-3">
              <span className="text-sm text-neutral-500">Economize com cobrança anual</span>
              <button
                role="switch"
                aria-checked={interval === "year"}
                onClick={() => setBillingInterval((i) => (i === "year" ? "month" : "year"))}
                className={`relative h-6 w-11 rounded-full transition ${
                  interval === "year" ? "bg-neutral-900 dark:bg-white" : "bg-neutral-300 dark:bg-neutral-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition dark:bg-neutral-900 ${
                    interval === "year" ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          </>
        ) : (
          // Aba Empresas — Business (por assento) + Enterprise (contato).
          <div className="mx-auto mt-8 grid max-w-4xl gap-5 md:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800">
              <h2 className="font-brand text-lg font-semibold">Business</h2>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-3xl font-semibold">US$ {teamSeatUsd}</span>
                <span className="text-sm text-neutral-500">/assento · mês</span>
              </div>
              <a
                href={CONTACT_MAILTO}
                className="font-brand mt-5 w-full rounded-full bg-neutral-900 px-4 py-2.5 text-center text-sm font-semibold text-white hover:opacity-85 dark:bg-white dark:text-neutral-900"
              >
                Criar equipe
              </a>
              <ul className="mt-6 flex flex-col gap-3 text-sm text-neutral-600 dark:text-neutral-300">
                {BUSINESS_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800">
              <h2 className="font-brand text-lg font-semibold">Enterprise</h2>
              <div className="mt-1 text-3xl font-semibold">Vamos conversar</div>
              <a
                href="mailto:contato@work4you.ai?subject=Work4You%20Enterprise"
                className="font-brand mt-5 w-full rounded-full bg-neutral-100 px-4 py-2.5 text-center text-sm font-semibold text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100"
              >
                Entre em contato
              </a>
              <ul className="mt-6 flex flex-col gap-3 text-sm text-neutral-600 dark:text-neutral-300">
                {ENTERPRISE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Overlay do checkout embedded (o formulário interno é um iframe da
            Stripe — cores/campos vêm do branding da conta, não do nosso CSS) */}
        {checkoutPlan && stripePromise && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-[2px] sm:p-8"
            onClick={() => setCheckoutPlan(null)}
          >
            <div
              className="w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-paper shadow-[0_40px_120px_-30px_rgba(26,28,24,0.55)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line px-6 py-4">
                <div>
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-salvia">
                    Plano {plans.find((p) => p.key === checkoutPlan)?.label ?? checkoutPlan}
                  </p>
                  <p className="font-brand text-base font-bold text-ink">
                    Finalizar assinatura
                  </p>
                </div>
                <button
                  onClick={() => setCheckoutPlan(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink"
                  aria-label="Fechar"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="min-h-[440px] bg-white px-2 py-3 sm:px-4">
                <EmbeddedCheckoutProvider
                  key={`${checkoutPlan}-${interval}`}
                  stripe={stripePromise}
                  options={{ fetchClientSecret }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
              <div className="flex items-center justify-center gap-2 border-t border-line bg-paper-deep px-6 py-3">
                <svg
                  className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                >
                  <rect x="3" y="7" width="10" height="6.5" rx="1.5" />
                  <path d="M5 7V5.5a3 3 0 016 0V7" />
                </svg>
                <p className="text-xs text-ink-faint">
                  Pagamento seguro processado pela Stripe · Cancele quando quiser
                </p>
              </div>
            </div>
          </div>
        )}

        <p className="mt-10 text-center text-xs text-neutral-400">
          Pagamento processado com segurança pela Stripe. Cancele quando quiser.
        </p>
      </main>
    </>
  );
}

function Check() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-neutral-800 dark:text-neutral-200"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 10l3.5 3.5L15 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
