import Link from "next/link";
import { getSiteLocale } from "@/lib/site-locale";

export const metadata = { title: "Preços — Work4You" };

// Public pricing page (Cursor-inspired grammar): 4 plans, ladder features,
// CTAs route to /login. No billing code here — checkout lives in the app.
type Plan = {
  name: string;
  tagline: string;
  price: string;
  usageNote: string;
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
    sub: "Modelo Cursor: uso incluído por ciclo, on-demand opcional com limite de gasto. Sem trial — assine quando quiser.",
    mostPopular: "Mais popular",
    perMonth: "/mês",
    footerNote:
      "Cada plano pago inclui um pool de uso que reinicia a cada ciclo (Other Models). Depois disso, ative on-demand na Conta (com limite de gasto). O overage entra na próxima fatura — sem cobrança surpresa. Cobrança anual com desconto ao assinar; pagamento pela Stripe.",
    teamsTitle: "Precisa de mais? Times e empresas",
    teamsBody: "Várias pessoas, limites sob medida e SSO — fale com a gente: ",
    teamsEmail: "contato@work4you.ai",
    plans: [
      {
        name: "Grátis",
        tagline: "Relay 2.5 Fast — modelo de casa",
        price: "US$ 0",
        usageNote: "Limites Grátis · sem cartão",
        features: [
          "Sem necessidade de cartão de crédito",
          "Relay 2.5 Fast — rápido e económico",
          "Resto do catálogo com cadeado até upgrade",
          "Seu agente pessoal na nuvem",
          "Conectores e habilidades essenciais",
        ],
        cta: "Começar grátis",
      },
      {
        name: "Essencial",
        tagline: "Pro trabalho de todo dia",
        price: "US$ 20",
        usageNote: "US$ 20 de uso incluído / ciclo",
        ladder: "Tudo do Grátis, mais:",
        features: [
          "Catálogo completo de modelos (Other Models)",
          "Pool incluído que reinicia a cada ciclo",
          "On-demand opcional com limite de gasto",
          "Rotinas e automações",
          "Suporte por e-mail",
        ],
        cta: "Assinar Essencial",
      },
      {
        name: "Plus",
        tagline: "Pra quem quer o 24/7",
        price: "US$ 60",
        usageNote: "US$ 70 de uso incluído · agente 24/7",
        ladder: "Tudo do Essencial, mais:",
        features: [
          "Modo MAX — modelos de ponta pra tarefas difíceis",
          "Agente sempre ativo — trabalhando 24/7",
          "Mais pool incluído por ciclo",
          "Respostas com prioridade",
        ],
        cta: "Assinar Plus",
        highlight: true,
      },
      {
        name: "Max",
        tagline: "Pra operações inteiras",
        price: "US$ 200",
        usageNote: "US$ 400 de uso incluído / ciclo",
        ladder: "Tudo do Plus, mais:",
        features: [
          "Pool incluído ampliado",
          "On-demand com teto de gasto mais alto",
          "Limites de uso mais altos",
          "Suporte prioritário",
        ],
        cta: "Assinar Max",
      },
    ],
  },
  en: {
    h1: "Start free. Grow when it makes sense.",
    sub: "Cursor-style: included usage per cycle, optional on-demand with a spend limit. No trial — subscribe when you're ready.",
    mostPopular: "Most popular",
    perMonth: "/month",
    footerNote:
      "Each paid plan includes an included usage pool that resets every billing cycle (Other Models). After that, enable on-demand in Account (with a spend limit). Overage is billed on your next invoice — no surprise charges. Discounted annual billing at checkout; payments via Stripe.",
    teamsTitle: "Need more? Teams and companies",
    teamsBody: "Multiple people, custom limits, and SSO — talk to us: ",
    teamsEmail: "contato@work4you.ai",
    plans: [
      {
        name: "Free",
        tagline: "Relay 2.5 Fast — house model",
        price: "$0",
        usageNote: "Free limits · no card",
        features: [
          "No credit card required",
          "Relay 2.5 Fast — fast and economical",
          "Rest of the catalog locked until upgrade",
          "Your personal agent in the cloud",
          "Essential connectors and skills",
        ],
        cta: "Start free",
      },
      {
        name: "Essencial",
        tagline: "For everyday work",
        price: "$20",
        usageNote: "$20 included usage / cycle",
        ladder: "Everything in Free, plus:",
        features: [
          "Full model catalog (Other Models)",
          "Included pool that resets each cycle",
          "Optional on-demand with spend limit",
          "Routines and automations",
          "Email support",
        ],
        cta: "Subscribe to Essencial",
      },
      {
        name: "Plus",
        tagline: "For those who want 24/7",
        price: "$60",
        usageNote: "$70 included usage · always-on agent",
        ladder: "Everything in Essencial, plus:",
        features: [
          "MAX mode — frontier models for hard tasks",
          "Always-on agent — working 24/7",
          "Larger included pool per cycle",
          "Priority responses",
        ],
        cta: "Subscribe to Plus",
        highlight: true,
      },
      {
        name: "Max",
        tagline: "For entire operations",
        price: "$200",
        usageNote: "$400 included usage / cycle",
        ladder: "Everything in Plus, plus:",
        features: [
          "Largest included usage pool",
          "Higher on-demand spend ceiling",
          "Higher usage limits",
          "Priority support",
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

          {/* the four plans */}
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
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                  {p.usageNote}
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

      {/* teams / enterprise strip */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-3xl rounded-3xl border border-line bg-cream px-8 py-10 text-center">
          <h2 className="text-xl font-bold tracking-tight text-ink">
            {t.teamsTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            {t.teamsBody}
            <span className="font-semibold text-ink">{t.teamsEmail}</span>
          </p>
        </div>
      </section>
    </>
  );
}
