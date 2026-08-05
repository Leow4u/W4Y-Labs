import Link from "next/link";
import { getSiteLocale } from "@/lib/site-locale";

export const metadata = { title: "Preços — Work4You" };

// Public pricing — Cursor grammar: price + feature ladder only. Pool/on-demand
// mechanics live in-app (Conta → Plan & Usage), not on the marketing page.
type Plan = {
  name: string;
  tagline: string;
  price: string;
  ladder?: string;
  features: string[];
  cta: string;
  highlight?: boolean;
};

const CONTENT: Record<
  "pt" | "en",
  {
    h1: string;
    sub: string;
    mostPopular: string;
    perMonth: string;
    footerNote: string;
    teamsTitle: string;
    teamsBody: string;
    teamsEmail: string;
    plans: Plan[];
  }
> = {
  pt: {
    h1: "Comece grátis. Cresça quando fizer sentido.",
    sub: "Sem cartão no Grátis. Cancele quando quiser.",
    mostPopular: "Mais popular",
    perMonth: "/mês",
    footerNote: "Pagamento seguro pela Stripe. Cobrança anual com desconto ao assinar.",
    teamsTitle: "Precisa de mais? Times e empresas",
    teamsBody: "Várias pessoas, limites sob medida e SSO — fale com a gente: ",
    teamsEmail: "contato@work4you.ai",
    plans: [
      {
        name: "Grátis",
        tagline: "Relay 2.5 Fast — modelo de casa",
        price: "US$ 0",
        features: [
          "Sem necessidade de cartão de crédito",
          "Relay 2.5 Fast — rápido e económico",
          "Limites de agente para começar",
          "Seu agente pessoal na nuvem",
          "Conectores e habilidades essenciais",
        ],
        cta: "Começar grátis",
      },
      {
        name: "Essencial",
        tagline: "Pro trabalho de todo dia",
        price: "US$ 20",
        ladder: "Tudo do Grátis, mais:",
        features: [
          "Catálogo completo de modelos",
          "Limites de agente estendidos",
          "Rotinas e automações",
          "MCPs, skills e conectores",
          "Suporte por e-mail",
        ],
        cta: "Assinar Essencial",
      },
      {
        name: "Plus",
        tagline: "Pra quem quer o 24/7",
        price: "US$ 60",
        ladder: "Tudo do Essencial, mais:",
        features: [
          "Modo MAX — modelos de ponta pra tarefas difíceis",
          "Agente sempre ativo — trabalhando 24/7",
          "Limites generosos de agente",
          "Respostas com prioridade",
        ],
        cta: "Assinar Plus",
        highlight: true,
      },
      {
        name: "Max",
        tagline: "Pra operações inteiras",
        price: "US$ 200",
        ladder: "Tudo do Plus, mais:",
        features: [
          "Limites ampliados de agente",
          "Prioridade máxima",
          "Suporte prioritário",
          "Feito pra equipes e volume alto",
        ],
        cta: "Assinar Max",
      },
    ],
  },
  en: {
    h1: "Start free. Grow when it makes sense.",
    sub: "No card on Free. Cancel anytime.",
    mostPopular: "Most popular",
    perMonth: "/month",
    footerNote: "Secure payments via Stripe. Discounted annual billing at checkout.",
    teamsTitle: "Need more? Teams and companies",
    teamsBody: "Multiple people, custom limits, and SSO — talk to us: ",
    teamsEmail: "contato@work4you.ai",
    plans: [
      {
        name: "Free",
        tagline: "Relay 2.5 Fast — house model",
        price: "$0",
        features: [
          "No credit card required",
          "Relay 2.5 Fast — fast and economical",
          "Agent limits to get started",
          "Your personal agent in the cloud",
          "Essential connectors and skills",
        ],
        cta: "Start free",
      },
      {
        name: "Essencial",
        tagline: "For everyday work",
        price: "$20",
        ladder: "Everything in Free, plus:",
        features: [
          "Full model catalog",
          "Extended agent limits",
          "Routines and automations",
          "MCPs, skills, and connectors",
          "Email support",
        ],
        cta: "Subscribe to Essencial",
      },
      {
        name: "Plus",
        tagline: "For those who want 24/7",
        price: "$60",
        ladder: "Everything in Essencial, plus:",
        features: [
          "MAX mode — frontier models for hard tasks",
          "Always-on agent — working 24/7",
          "Generous agent limits",
          "Priority responses",
        ],
        cta: "Subscribe to Plus",
        highlight: true,
      },
      {
        name: "Max",
        tagline: "For entire operations",
        price: "$200",
        ladder: "Everything in Plus, plus:",
        features: [
          "Expanded agent limits",
          "Highest priority",
          "Priority support",
          "Built for teams and high volume",
        ],
        cta: "Subscribe to Max",
      },
    ],
  },
};

export default async function PrecosPage() {
  const locale = await getSiteLocale();
  const t = CONTENT[locale];
  return (
    <>
      <section className="px-6 pb-24 pt-16 md:pt-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance]">
              {t.h1}
            </h1>
            <p className="mt-4 text-ink-soft">{t.sub}</p>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {t.plans.map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-2xl bg-white p-7 ${
                  p.highlight
                    ? "border-2 border-ink shadow-[0_24px_70px_-32px_rgba(26,28,24,0.35)]"
                    : "border border-line"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-ink px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-paper">
                    {t.mostPopular}
                  </span>
                )}
                <h2 className="text-lg font-bold text-ink">{p.name}</h2>
                <p className="mt-1 text-[13px] text-ink-soft">{p.tagline}</p>
                <p className="mt-5 text-ink">
                  <span className="text-4xl font-extrabold tracking-[-0.02em]">{p.price}</span>
                  <span className="ml-1 text-sm text-ink-faint">{t.perMonth}</span>
                </p>
                <Link
                  href="/login"
                  className={`mt-6 rounded-full px-5 py-2.5 text-center text-sm font-semibold transition-colors ${
                    p.highlight
                      ? "bg-ink text-paper hover:bg-black"
                      : "border border-line bg-paper text-ink hover:border-ink-faint"
                  }`}
                >
                  {p.cta}
                </Link>
                <div className="mt-6 flex-1">
                  {p.ladder && (
                    <p className="text-[13px] font-medium text-ink-soft">{p.ladder}</p>
                  )}
                  <ul className="mt-3 space-y-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2.5 text-[13.5px] leading-snug text-ink-soft">
                        <span className="mt-0.5 shrink-0 font-mono text-[12px] text-salvia">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-[13px] text-ink-faint">{t.footerNote}</p>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-3xl rounded-3xl border border-line bg-cream px-8 py-10 text-center">
          <h2 className="text-xl font-bold tracking-tight text-ink">{t.teamsTitle}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            {t.teamsBody}
            <span className="font-semibold text-ink">{t.teamsEmail}</span>
          </p>
        </div>
      </section>
    </>
  );
}
