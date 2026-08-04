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
    sub: "Uso incluído por plano — como no Cursor. Teste os planos pagos por 7 dias sem pagar nada; cancele quando quiser.",
    mostPopular: "Mais popular",
    perMonth: "/mês",
    footerNote:
      "Cada plano inclui uso que reinicia a cada ciclo. Depois disso, ative on-demand na Conta (com limite de gasto). O overage entra na próxima fatura — sem cobrança surpresa. Cobrança anual com desconto ao assinar; pagamento pela Stripe.",
    teamsTitle: "Precisa de mais? Times e empresas",
    teamsBody: "Várias pessoas, limites sob medida e SSO — fale com a gente: ",
    teamsEmail: "contato@work4you.ai",
    plans: [
      {
        name: "Grátis",
        tagline: "Pra conhecer o seu agente",
        price: "US$ 0",
        usageNote: "Uso de boas-vindas",
        features: [
          "Sem necessidade de cartão de crédito",
          "Seu agente pessoal na nuvem",
          "Chat que conversa e executa",
          "Conectores e habilidades essenciais",
        ],
        cta: "Começar grátis",
      },
      {
        name: "Starter",
        tagline: "Pro trabalho de todo dia",
        price: "US$ 19",
        usageNote: "Uso incluído no plano",
        ladder: "Tudo do Grátis, mais:",
        features: [
          "Uso incluído que reinicia a cada ciclo",
          "Modelos essenciais (Flash e Auto)",
          "Chat e habilidades sem limite de recursos",
          "On-demand opcional com limite de gasto",
          "Rotinas e automações",
          "Suporte por e-mail",
        ],
        cta: "Testar 7 dias por US$ 0",
      },
      {
        name: "Pro",
        tagline: "Pra quem quer o 24/7",
        price: "US$ 49",
        usageNote: "Mais uso incluído · agente 24/7",
        ladder: "Tudo do Starter, mais:",
        features: [
          "Modo Expert — modelos de ponta pra tarefas difíceis",
          "Agente sempre ativo — trabalhando 24/7",
          "Respostas com prioridade",
        ],
        cta: "Testar 7 dias por US$ 0",
        highlight: true,
      },
      {
        name: "Max",
        tagline: "Pra operações inteiras",
        price: "US$ 99",
        usageNote: "Pool incluído ampliado",
        ladder: "Tudo do Pro, mais:",
        features: [
          "Pool incluído ampliado",
          "On-demand com teto de gasto mais alto",
          "Limites de uso mais altos",
          "Suporte prioritário",
        ],
        cta: "Testar 7 dias por US$ 0",
      },
    ],
  },
  en: {
    h1: "Start free. Grow when it makes sense.",
    sub: "Included usage per plan — Cursor-style. Try any paid plan free for 7 days; cancel whenever you want.",
    mostPopular: "Most popular",
    perMonth: "/month",
    footerNote:
      "Each plan includes usage that resets every billing cycle. After that, enable on-demand in Account (with a spend limit). Overage is billed on your next invoice — no surprise charges. Discounted annual billing at checkout; payments via Stripe.",
    teamsTitle: "Need more? Teams and companies",
    teamsBody: "Multiple people, custom limits, and SSO — talk to us: ",
    teamsEmail: "contato@work4you.ai",
    plans: [
      {
        name: "Free",
        tagline: "Get to know your agent",
        price: "$0",
        usageNote: "Welcome usage",
        features: [
          "No credit card required",
          "Your personal agent in the cloud",
          "A chat that talks and gets things done",
          "Essential connectors and skills",
        ],
        cta: "Start free",
      },
      {
        name: "Starter",
        tagline: "For everyday work",
        price: "$19",
        usageNote: "Included usage in your plan",
        ladder: "Everything in Free, plus:",
        features: [
          "Included usage that resets each cycle",
          "Essential models (Flash and Auto)",
          "Chat and skills with no feature limits",
          "Optional on-demand with spend limit",
          "Routines and automations",
          "Email support",
        ],
        cta: "Try 7 days for $0",
      },
      {
        name: "Pro",
        tagline: "For those who want 24/7",
        price: "$49",
        usageNote: "More included usage · always-on agent",
        ladder: "Everything in Starter, plus:",
        features: [
          "Expert mode — frontier models for hard tasks",
          "Always-on agent — working 24/7",
          "Priority responses",
        ],
        cta: "Try 7 days for $0",
        highlight: true,
      },
      {
        name: "Max",
        tagline: "For entire operations",
        price: "$99",
        usageNote: "Larger included usage pool",
        ladder: "Everything in Pro, plus:",
        features: [
          "Larger included usage pool",
          "Higher on-demand spend ceiling",
          "Higher usage limits",
          "Priority support",
        ],
        cta: "Try 7 days for $0",
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
