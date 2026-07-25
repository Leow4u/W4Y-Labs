import Link from "next/link";

export const metadata = { title: "Preços — Work4You" };

// Public pricing page (Cursor-inspired grammar): 4 plans, ladder features,
// CTAs route to /login. No billing code here — checkout lives in the app.
const PLANS: {
  name: string;
  tagline: string;
  price: string;
  credits: string;
  ladder?: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}[] = [
  {
    name: "Grátis",
    tagline: "Pra conhecer o seu agente",
    price: "$0",
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
    price: "$19",
    credits: "600 créditos/mês",
    ladder: "Tudo do Grátis, mais:",
    features: [
      "Modelos essenciais (Flash e Auto)",
      "Chat e habilidades sem limite de recursos",
      "Rotinas e automações",
      "Suporte por e-mail",
    ],
    cta: "Testar 7 dias por $0",
  },
  {
    name: "Pro",
    tagline: "Pra quem quer o 24/7",
    price: "$49",
    credits: "1.600 créditos/mês",
    ladder: "Tudo do Starter, mais:",
    features: [
      "Modo Expert — modelos de ponta pra tarefas difíceis",
      "Agente sempre ativo — trabalhando 24/7",
      "Respostas com prioridade",
    ],
    cta: "Testar 7 dias por $0",
    highlight: true,
  },
  {
    name: "Max",
    tagline: "Pra operações inteiras",
    price: "$99",
    credits: "3.800 créditos/mês",
    ladder: "Tudo do Pro, mais:",
    features: [
      "Modo Crew — time de agentes em paralelo",
      "Limites de uso mais altos",
      "Suporte prioritário",
    ],
    cta: "Testar 7 dias por $0",
  },
];

export default function PrecosPage() {
  return (
    <>
      <section className="px-6 pb-24 pt-16 md:pt-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance]">
              Comece grátis. Cresça quando fizer sentido.
            </h1>
            <p className="mt-4 text-ink-soft">
              Créditos que viram trabalho entregue. Teste os planos pagos por 7
              dias sem pagar nada — e cancele quando quiser.
            </p>
          </div>

          {/* the four plans */}
          <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {PLANS.map((p) => (
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
                    Mais popular
                  </span>
                )}
                <h2 className="text-lg font-bold text-ink">{p.name}</h2>
                <p className="mt-1 text-[13px] text-ink-soft">{p.tagline}</p>
                <p className="mt-5 text-ink">
                  <span className="text-4xl font-extrabold tracking-[-0.02em]">{p.price}</span>
                  <span className="ml-1 text-sm text-ink-faint">/mês</span>
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                  {p.credits}
                </p>
                <Link
                  href="/login"
                  className={`mt-6 rounded-full px-5 py-2.5 text-center text-sm font-semibold transition-colors ${
                    p.highlight
                      ? "bg-mata text-paper hover:bg-mata-deep"
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

          <p className="mt-8 text-center text-[13px] text-ink-faint">
            Cobrança anual com desconto disponível ao assinar. Pagamento
            processado com segurança pela Stripe — cancele quando quiser.
          </p>
        </div>
      </section>

      {/* teams / enterprise strip */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-3xl rounded-3xl border border-line bg-cream px-8 py-10 text-center">
          <h2 className="text-xl font-bold tracking-tight text-ink">
            Precisa de mais? Times e empresas
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            Vários agentes, várias pessoas, limites sob medida. Fale com a
            gente: <span className="font-semibold text-ink">contato@work4you.ai</span>
          </p>
        </div>
      </section>
    </>
  );
}
