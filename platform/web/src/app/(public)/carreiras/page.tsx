import Link from "next/link";
import { getSiteLocale } from "@/lib/site-locale";

export const metadata = {
  title: "Carreiras — Work4You",
  description:
    "A gente constrói o novo jeito de trabalhar — e o time também está crescendo. Candidaturas espontâneas são bem-vindas.",
};

// Open-application areas (we have no formal openings yet — honest careers
// page: spontaneous applications per area, styled like a roles list).
// Mailto subjects stay pt-encoded in both locales on purpose.
type Area = { title: string; area: string; subject: string };
type Value = { title: string; text: string };

const CONTENT = {
  pt: {
    kicker: "Carreiras",
    heading: "A gente constrói o novo jeito de trabalhar.",
    manifesto: [
      "A Work4You existe pra dar a cada empreendedor o que só as grandes empresas tinham: um time que trabalha por ele. Agentes de IA com computador próprio, entregando trabalho de verdade, 24 horas por dia.",
      "Somos um time pequeno e denso, em estágio inicial — o que significa que cada pessoa que entra agora molda o produto, a cultura e o rumo da empresa. Não é figura de linguagem: é o tamanho do time.",
      "Se isso soa como o lugar onde você faria o melhor trabalho da sua vida, a gente quer te conhecer.",
    ],
    values: [
      {
        title: "Você trabalha com agentes",
        text: "Aqui ninguém trabalha sozinho: cada pessoa do time opera com os próprios agentes que construímos. É o produto rodando a empresa — e você sentindo, todo dia, o que o cliente sente.",
      },
      {
        title: "Poucos e muito bons",
        text: "Time pequeno de propósito. Cada pessoa tem dono de verdade sobre a sua área, fala direto com clientes e vê a própria decisão no ar em dias, não em trimestres.",
      },
      {
        title: "Produto acima de tudo",
        text: "A régua é simples: o que a gente entrega deixa o trabalho de alguém melhor hoje? Honestidade no que prometemos, capricho no que lançamos.",
      },
    ] as Value[],
    rolesTitle: "Vagas abertas.",
    rolesText:
      "Não temos vagas formais abertas neste momento — mas talento excepcional não espera edital. Se manda uma mensagem contando o que você faria por aqui.",
    areas: [
      {
        title: "Candidatura espontânea — Produto & Engenharia",
        area: "Produto",
        subject: "Carreiras%20—%20Produto%20%26%20Engenharia",
      },
      {
        title: "Candidatura espontânea — Crescimento & Marketing",
        area: "Crescimento",
        subject: "Carreiras%20—%20Crescimento%20%26%20Marketing",
      },
      {
        title: "Candidatura espontânea — Sucesso do Cliente",
        area: "Clientes",
        subject: "Carreiras%20—%20Sucesso%20do%20Cliente",
      },
    ] as Area[],
    remote: "Remoto (Brasil)",
    write: "Escrever →",
    footerBeforeBlog: "Quando abrirmos vagas formais, elas aparecem aqui e no",
    blog: "Blog",
    footerAfterBlog: ". Enquanto isso, conheça o produto:",
    productLink: "o que é a Work4You",
  },
  en: {
    kicker: "Careers",
    heading: "We're building the new way of working.",
    manifesto: [
      "Work4You exists to give every entrepreneur what only big companies used to have: a team that works for them. AI agents with their own computers, delivering real work, 24 hours a day.",
      "We're a small, dense team at an early stage — which means everyone who joins now shapes the product, the culture, and the direction of the company. That's not a figure of speech: it's the size of the team.",
      "If this sounds like the place where you'd do the best work of your life, we want to meet you.",
    ],
    values: [
      {
        title: "You work with agents",
        text: "Nobody here works alone: everyone on the team runs their own agents — the ones we build. It's the product running the company, and you feeling what customers feel, every single day.",
      },
      {
        title: "A few great people",
        text: "Small on purpose. Everyone has real ownership of their area, talks directly with customers, and sees their own decisions live in days, not quarters.",
      },
      {
        title: "Product above all",
        text: "The bar is simple: does what we ship make someone's work better today? Honesty in what we promise, craft in what we launch.",
      },
    ] as Value[],
    rolesTitle: "Open roles.",
    rolesText:
      "We don't have formal openings right now — but exceptional talent doesn't wait for a job posting. Send us a message telling us what you'd do here.",
    areas: [
      {
        title: "Open application — Product & Engineering",
        area: "Product",
        subject: "Carreiras%20—%20Produto%20%26%20Engenharia",
      },
      {
        title: "Open application — Growth & Marketing",
        area: "Growth",
        subject: "Carreiras%20—%20Crescimento%20%26%20Marketing",
      },
      {
        title: "Open application — Customer Success",
        area: "Customers",
        subject: "Carreiras%20—%20Sucesso%20do%20Cliente",
      },
    ] as Area[],
    remote: "Remote (Brazil)",
    write: "Write →",
    footerBeforeBlog: "When we open formal roles, they'll show up here and on the",
    blog: "Blog",
    footerAfterBlog: ". In the meantime, get to know the product:",
    productLink: "what Work4You is",
  },
} as const;

export default async function CarreirasPage() {
  const locale = await getSiteLocale();
  const c = CONTENT[locale];

  return (
    <div className="px-6">
      {/* Manifesto */}
      <div className="mx-auto max-w-2xl pt-16 sm:pt-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
          {c.kicker}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance] sm:text-5xl">
          {c.heading}
        </h1>
        <div className="mt-7 space-y-5 text-lg leading-relaxed text-ink-soft">
          {c.manifesto.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </div>

      {/* Values */}
      <div className="mx-auto max-w-4xl pt-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {c.values.map((v) => (
            <div key={v.title} className="rounded-2xl border border-line bg-paper p-6">
              <h2 className="font-bold text-ink">{v.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{v.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Open roles */}
      <div className="mx-auto max-w-4xl pb-20 pt-16">
        <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-ink">
          {c.rolesTitle}
        </h2>
        <p className="mt-2 max-w-xl text-ink-soft">{c.rolesText}</p>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-paper">
          {c.areas.map((r) => (
            <a
              key={r.title}
              href={`mailto:contato@work4you.ai?subject=${r.subject}`}
              className="group flex flex-wrap items-center justify-between gap-3 px-6 py-5 transition-colors hover:bg-paper-deep"
            >
              <div>
                <p className="font-semibold text-ink group-hover:text-mata-deep">
                  {r.title}
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                  {r.area} · {c.remote}
                </p>
              </div>
              <span className="text-sm font-semibold text-mata">{c.write}</span>
            </a>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-faint">
          {c.footerBeforeBlog}{" "}
          <Link
            href="/blog"
            className="text-mata underline decoration-salvia underline-offset-2 hover:text-mata-deep"
          >
            {c.blog}
          </Link>
          {c.footerAfterBlog}{" "}
          <Link
            href="/documentacao/o-que-e"
            className="text-mata underline decoration-salvia underline-offset-2 hover:text-mata-deep"
          >
            {c.productLink}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
