import Image from "next/image";
import Link from "next/link";
import Icon, { type SiteIconName } from "@/components/site-icons";
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
type Value = { title: string; text: string; icon: SiteIconName };

const CONTENT = {
  pt: {
    kicker: "Carreiras",
    heading: "A gente constrói o novo jeito de trabalhar.",
    manifesto: [
      "A Work4You existe pra dar a cada empreendedor o que só as grandes empresas tinham: um time que trabalha por ele. Agentes de IA com computador próprio, entregando trabalho de verdade, 24 horas por dia.",
      "Aqui a gente trabalha do jeito que prega: cada pessoa comanda o agente na plataforma e entrega o que antes exigia um departamento inteiro. Não existe engrenagem na Work4You — existe dono. Quem entra molda o produto, a cultura e o rumo da empresa.",
      "Se isso soa como o lugar onde você faria o melhor trabalho da sua vida, a gente quer te conhecer.",
    ],
    values: [
      {
        title: "Você trabalha com agentes",
        text: "Aqui ninguém trabalha sozinho: cada pessoa do time opera com os próprios agentes que construímos. É o produto rodando a empresa — e você sentindo, todo dia, o que o cliente sente.",
        icon: "sparkle",
      },
      {
        title: "Donos, não engrenagens",
        text: "Cada pessoa tem dono de verdade sobre a sua área, fala direto com clientes e vê a própria decisão no ar em dias, não em trimestres.",
        icon: "users",
      },
      {
        title: "Produto acima de tudo",
        text: "A régua é simples: o que a gente entrega deixa o trabalho de alguém melhor hoje? Honestidade no que prometemos, capricho no que lançamos.",
        icon: "heart",
      },
    ] as Value[],
    rolesTitle: "Vagas abertas.",
    rolesText:
      "As vagas formais abrem em ondas, conforme a operação cresce. Mas talento excepcional não espera edital: se apresenta. Manda uma mensagem contando o que você faria por aqui.",
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
      "We work the way we preach: everyone here runs their agent on the platform and delivers what used to take a whole department. There are no cogs at Work4You — only owners. Everyone who joins shapes the product, the culture, and the direction of the company.",
      "If this sounds like the place where you'd do the best work of your life, we want to meet you.",
    ],
    values: [
      {
        title: "You work with agents",
        text: "Nobody here works alone: everyone on the team runs their own agents — the ones we build. It's the product running the company, and you feeling what customers feel, every single day.",
        icon: "sparkle",
      },
      {
        title: "Owners, not cogs",
        text: "Everyone has real ownership of their area, talks directly with customers, and sees their own decisions live in days, not quarters.",
        icon: "users",
      },
      {
        title: "Product above all",
        text: "The bar is simple: does what we ship make someone's work better today? Honesty in what we promise, craft in what we launch.",
        icon: "heart",
      },
    ] as Value[],
    rolesTitle: "Open roles.",
    rolesText:
      "Formal openings come in waves as the operation grows. But exceptional talent doesn't wait for a posting: introduce yourself. Send us a message telling us what you'd do here.",
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
      {/* Manifesto — editorial spread: text left, photo right on lg */}
      <div className="mx-auto max-w-5xl pt-16 sm:pt-20 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center lg:gap-14">
        <div className="mx-auto max-w-2xl lg:mx-0">
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
        <div className="relative hidden aspect-[4/5] overflow-hidden rounded-3xl lg:block">
          <Image
            src="/media/hero-hills.jpg"
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 360px, 0px"
          />
        </div>
      </div>

      {/* Values */}
      <div className="mx-auto max-w-4xl pt-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {c.values.map((v) => (
            <div key={v.title} className="rounded-2xl border border-line bg-paper p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-salvia-soft text-mata">
                <Icon name={v.icon} className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-bold text-ink">{v.title}</h2>
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
