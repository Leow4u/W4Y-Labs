import Link from "next/link";

export const metadata = {
  title: "Carreiras — Work4You",
  description:
    "A gente constrói o novo jeito de trabalhar — e o time também está crescendo. Candidaturas espontâneas são bem-vindas.",
};

// Open-application areas (we have no formal openings yet — honest careers
// page: spontaneous applications per area, styled like a roles list).
const AREAS: { title: string; area: string; subject: string }[] = [
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
];

const VALUES: { title: string; text: string }[] = [
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
];

export default function CarreirasPage() {
  return (
    <div className="px-6">
      {/* Manifesto */}
      <div className="mx-auto max-w-2xl pt-16 sm:pt-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
          Carreiras
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance] sm:text-5xl">
          A gente constrói o novo jeito de trabalhar.
        </h1>
        <div className="mt-7 space-y-5 text-lg leading-relaxed text-ink-soft">
          <p>
            A Work4You existe pra dar a cada empreendedor o que só as grandes
            empresas tinham: um time que trabalha por ele. Agentes de IA com
            computador próprio, entregando trabalho de verdade, 24 horas por dia.
          </p>
          <p>
            Somos um time pequeno e denso, em estágio inicial — o que significa
            que cada pessoa que entra agora molda o produto, a cultura e o rumo
            da empresa. Não é figura de linguagem: é o tamanho do time.
          </p>
          <p>
            Se isso soa como o lugar onde você faria o melhor trabalho da sua
            vida, a gente quer te conhecer.
          </p>
        </div>
      </div>

      {/* Values */}
      <div className="mx-auto max-w-4xl pt-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {VALUES.map((v) => (
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
          Vagas abertas.
        </h2>
        <p className="mt-2 max-w-xl text-ink-soft">
          Não temos vagas formais abertas neste momento — mas talento excepcional
          não espera edital. Se manda uma mensagem contando o que você faria por
          aqui.
        </p>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-paper">
          {AREAS.map((r) => (
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
                  {r.area} · Remoto (Brasil)
                </p>
              </div>
              <span className="text-sm font-semibold text-mata">Escrever →</span>
            </a>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-faint">
          Quando abrirmos vagas formais, elas aparecem aqui e no{" "}
          <Link
            href="/blog"
            className="text-mata underline decoration-salvia underline-offset-2 hover:text-mata-deep"
          >
            Blog
          </Link>
          . Enquanto isso, conheça o produto:{" "}
          <Link
            href="/documentacao/o-que-e"
            className="text-mata underline decoration-salvia underline-offset-2 hover:text-mata-deep"
          >
            o que é a Work4You
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
