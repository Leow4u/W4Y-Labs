import Link from "next/link";

export const metadata = {
  title: "Comunidade — Work4You",
  description:
    "Encontros, workshops e desafios de construção de agentes — com quem está colocando IA pra trabalhar de verdade.",
};

const JOIN_MAILTO =
  "mailto:contato@work4you.ai?subject=Quero%20entrar%20na%20comunidade%20Work4You";

// Marquee cards: what members put their agents to work on. Use-case
// scenarios (no invented testimonials/handles — we don't fake social proof).
const MARQUEE: { tag: string; text: string }[] = [
  { tag: "Atendimento", text: "Agente respondendo o WhatsApp da loja — inclusive de madrugada." },
  { tag: "Vendas", text: "Lead novo no CRM → proposta em PDF no e-mail do dono, em minutos." },
  { tag: "Marketing", text: "3 posts por semana: copy + arte, prontos pra aprovar e publicar." },
  { tag: "Rotina", text: "Toda segunda às 8h, o resumo da semana chega antes do café." },
  { tag: "Pesquisa", text: "Concorrentes mapeados numa planilha comparativa — sem abrir 40 abas." },
  { tag: "Financeiro", text: "Cobranças em atraso viram lembretes educados, enviados sozinhos." },
  { tag: "Código", text: "Uma landing page no ar a partir de uma frase — com preview ao vivo." },
  { tag: "Operação", text: "Vários agentes, um objetivo: o modo Crew tocando o lançamento." },
  { tag: "Agenda", text: "O follow-up que ninguém esquecia mais — porque não é mais ninguém." },
  { tag: "Conhecimento", text: "O agente que leu o catálogo inteiro e responde citando a fonte." },
];

const FORMATS: { title: string; text: string }[] = [
  {
    title: "Encontros online",
    text: "Demos ao vivo, troca de casos e perguntas abertas com o time. O jeito mais rápido de ver o que outros donos de agente estão fazendo.",
  },
  {
    title: "Workshops ao vivo",
    text: "Sessões mão na massa: você sai com um agente montado e uma rotina no ar. Do básico ao avançado.",
  },
  {
    title: "Desafios de construção",
    text: "Um fim de semana pra montar um agente que trabalha de verdade — com o time por perto e os melhores projetos em destaque.",
  },
  {
    title: "Cafés Work4You",
    text: "Encontros presenciais, informais, cidade a cidade — construtores na mesma mesa, à medida que a comunidade cresce.",
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Como entro na comunidade?",
    a: "Escreve pra contato@work4you.ai com o assunto “Comunidade” — te colocamos no grupo e você passa a receber os convites dos encontros. Os espaços oficiais estão sendo montados junto com os primeiros membros.",
  },
  {
    q: "Posso organizar um encontro na minha cidade?",
    a: "Pode — e queremos. Os primeiros encontros regionais vão nascer de membros da comunidade. Escreve pra gente contando a cidade e o formato que você imagina, e montamos juntos.",
  },
  {
    q: "A Work4You apoia eventos, cursos ou conteúdo?",
    a: "Durante o acesso antecipado, avaliamos parcerias caso a caso — eventos, comunidades técnicas, criadores de conteúdo. Manda a sua ideia pra contato@work4you.ai.",
  },
  {
    q: "Como falo com o time?",
    a: "contato@work4you.ai. Toda mensagem é lida — e feedback de quem usa vira produto.",
  },
];

// Community page (Cursor-style structure, honest to our early-access stage):
// hero -> use-case marquee -> formats -> founding-member band -> FAQ.
export default function ComunidadePage() {
  return (
    <div>
      {/* Hero */}
      <div className="px-6">
        <div className="mx-auto max-w-2xl pt-16 text-center sm:pt-20">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
            Comunidade
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance] sm:text-5xl">
            Junte-se à comunidade Work4You.
          </h1>
          <p className="mx-auto mt-4 max-w-lg leading-relaxed text-ink-soft">
            Encontros, workshops e desafios de construção de agentes — com quem
            está colocando IA pra trabalhar de verdade.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a
              href={JOIN_MAILTO}
              className="rounded-full bg-mata px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-mata-deep"
            >
              Entrar na comunidade
            </a>
            <Link
              href="/workshops"
              className="rounded-full border border-line bg-paper px-6 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-deep"
            >
              Ver os workshops
            </Link>
          </div>
        </div>
      </div>

      {/* Use-case marquee (duplicated 2x for a seamless loop) */}
      <div className="w4y-marquee-wrap mt-14 overflow-hidden border-y border-line bg-paper-deep py-6">
        <div className="w4y-marquee flex w-max gap-4 pr-4">
          {[...MARQUEE, ...MARQUEE].map((c, i) => (
            <div
              key={i}
              className="w-[290px] shrink-0 rounded-2xl border border-line bg-paper p-5"
            >
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-mata">
                {c.tag}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {c.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Formats */}
      <div className="px-6">
        <div className="mx-auto max-w-4xl pt-16">
          <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-ink">
            O que vamos fazer juntos.
          </h2>
          <p className="mt-2 max-w-xl text-ink-soft">
            De um café descontraído a um fim de semana inteiro construindo — os
            formatos da comunidade Work4You.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {FORMATS.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-line bg-paper p-6"
              >
                <h3 className="font-bold text-ink">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {f.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Founding-member band */}
      <div className="px-6">
        <div className="mx-auto mt-16 max-w-4xl rounded-3xl bg-mata-deep px-8 py-12 text-center sm:px-14">
          <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-paper [text-wrap:balance] sm:text-3xl">
            Estamos no começo — de propósito.
          </h2>
          <p className="mx-auto mt-3 max-w-xl leading-relaxed text-paper/80">
            A Work4You está em acesso antecipado, e a comunidade nasce agora.
            Quem chega nessa fase não entra numa multidão — ajuda a fundar uma.
          </p>
          <div className="mx-auto mt-9 grid max-w-2xl gap-6 sm:grid-cols-3">
            {[
              ["Acesso direto", "Fala com quem constrói o produto — sem fila, sem robô de suporte."],
              ["Voz no produto", "O que a comunidade pede primeiro, a gente constrói primeiro."],
              ["Status de fundador", "Membros da primeira hora terão vantagens permanentes."],
            ].map(([t, d]) => (
              <div key={t}>
                <p className="font-semibold text-paper">{t}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-paper/70">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* First events — honest empty state */}
      <div className="px-6">
        <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-line bg-cream px-8 py-8 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-mata">
              Próximos encontros
            </p>
            <p className="mt-2 font-semibold text-ink">
              Os primeiros encontros estão sendo marcados.
            </p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
              Entra na comunidade pra receber o convite — ou se apresenta pra
              sediar um na sua cidade.
            </p>
          </div>
          <a
            href={JOIN_MAILTO}
            className="mt-5 inline-block shrink-0 rounded-full bg-mata px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-mata-deep sm:mt-0"
          >
            Quero participar
          </a>
        </div>
      </div>

      {/* FAQ */}
      <div className="px-6">
        <div className="mx-auto max-w-3xl pb-20 pt-16">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            Perguntas frequentes
          </p>
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-paper">
            {FAQS.map((f) => (
              <details key={f.q} className="group px-6 py-4">
                <summary className="flex cursor-pointer select-none items-center justify-between gap-4 text-[15px] font-semibold text-ink">
                  {f.q}
                  <span className="text-ink-faint transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-[40rem] text-sm leading-relaxed text-ink-soft">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
