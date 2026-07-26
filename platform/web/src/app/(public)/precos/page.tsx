import Link from "next/link";
import { getSiteLocale } from "@/lib/site-locale";

export const metadata = { title: "Preços — Work4You" };

// Public pricing page (Cursor-inspired grammar): 4 plans, ladder features,
// CTAs route to /login. No billing code here — checkout lives in the app.
type Plan = {
  name: string;
  tagline: string;
  price: string;
  credits: string;
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
    sub: "Créditos que viram trabalho entregue. Teste os planos pagos por 7 dias sem pagar nada — e cancele quando quiser.",
    mostPopular: "Mais popular",
    perMonth: "/mês",
    footerNote:
      "Cobrança anual com desconto disponível ao assinar. Pagamento processado com segurança pela Stripe — cancele quando quiser.",
    teamsTitle: "Precisa de mais? Times e empresas",
    teamsBody: "Vários agentes, várias pessoas, limites sob medida. Fale com a gente: ",
    teamsEmail: "contato@work4you.ai",
    plans: [
      {
        name: "Grátis",
        tagline: "Pra conhecer o seu agente",
        price: "US$ 0",
        credits: "créditos de boas-vindas",
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
        credits: "600 créditos/mês",
        ladder: "Tudo do Grátis, mais:",
        features: [
          "Modelos essenciais (Flash e Auto)",
          "Chat e habilidades sem limite de recursos",
          "Rotinas e automações",
          "Suporte por e-mail",
        ],
        cta: "Testar 7 dias por US$ 0",
      },
      {
        name: "Pro",
        tagline: "Pra quem quer o 24/7",
        price: "US$ 49",
        credits: "1.600 créditos/mês",
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
        credits: "3.800 créditos/mês",
        ladder: "Tudo do Pro, mais:",
        features: [
          "Modo Crew — time de agentes em paralelo",
          "Limites de uso mais altos",
          "Suporte prioritário",
        ],
        cta: "Testar 7 dias por US$ 0",
      },
    ],
  },
  en: {
    h1: "Start free. Grow when it makes sense.",
    sub: "Credits that turn into delivered work. Try any paid plan free for 7 days — and cancel whenever you want.",
    mostPopular: "Most popular",
    perMonth: "/month",
    footerNote:
      "Discounted annual billing available at checkout. Payments securely processed by Stripe — cancel anytime.",
    teamsTitle: "Need more? Teams and companies",
    teamsBody: "Multiple agents, multiple people, limits built to fit. Talk to us: ",
    teamsEmail: "contato@work4you.ai",
    plans: [
      {
        name: "Free",
        tagline: "Get to know your agent",
        price: "$0",
        credits: "welcome credits",
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
        credits: "600 credits/month",
        ladder: "Everything in Free, plus:",
        features: [
          "Essential models (Flash and Auto)",
          "Chat and skills with no feature limits",
          "Routines and automations",
          "Email support",
        ],
        cta: "Try 7 days for $0",
      },
      {
        name: "Pro",
        tagline: "For those who want 24/7",
        price: "$49",
        credits: "1,600 credits/month",
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
        credits: "3,800 credits/month",
        ladder: "Everything in Pro, plus:",
        features: [
          "Crew mode — a team of agents in parallel",
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
                  {p.credits}
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
