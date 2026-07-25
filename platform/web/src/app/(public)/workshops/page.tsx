import Link from "next/link";

export const metadata = {
  title: "Workshops — Work4You",
  description:
    "Sessões ao vivo, mão na massa: saia com um agente montado e uma rotina no ar.",
};

const RSVP_MAILTO =
  "mailto:contato@work4you.ai?subject=Quero%20minha%20vaga%20no%20workshop%20de%2030%2F09";
const TEAM_MAILTO =
  "mailto:contato@work4you.ai?subject=Workshop%20para%20o%20meu%20time";

// Live-session tracks (curriculum, not fake recordings — we have no
// on-demand library yet; these are what the live workshops cover).
const TRACKS: { level: string; title: string; text: string; length: string }[] = [
  {
    level: "Fundamentos",
    title: "Work4You 101 — o primeiro agente",
    text: "Da conta criada à primeira entrega: como delegar bem, aprovar com segurança e transformar a primeira tarefa numa rotina.",
    length: "1h ao vivo",
  },
  {
    level: "Conexões",
    title: "Seu agente nos seus apps",
    text: "WhatsApp, Gmail, planilhas e CRM: conectando os aplicativos do dia a dia e comandando o agente de onde você estiver.",
    length: "1h ao vivo",
  },
  {
    level: "Avançado",
    title: "Agent Studio — do agente ao time",
    text: "Agentes com papel definido: conhecimento próprio, teto de créditos, canais por agente e delegação de objetivos grandes.",
    length: "1h ao vivo",
  },
];

const AUDIENCES: { title: string; text: string }[] = [
  {
    title: "Agências e marketing",
    text: "Posts com copy e arte, relatórios de campanha, atendimento a clientes — no ritmo de agência.",
  },
  {
    title: "Comércio e e-commerce",
    text: "Atendimento no WhatsApp, catálogo respondido com fonte, cobranças e pós-venda automáticos.",
  },
  {
    title: "Serviços e consultórios",
    text: "Agendamento, confirmação, lembretes e follow-up — a recepção que nunca sai do ar.",
  },
  {
    title: "Times de vendas",
    text: "Lead novo vira proposta em minutos; o funil inteiro monitorado por rotina.",
  },
];

// Workshops page (Cursor-style structure): hero -> next event (featured) ->
// live tracks -> team workshops band -> where announcements happen.
export default function WorkshopsPage() {
  return (
    <div className="px-6">
      {/* Hero */}
      <div className="mx-auto max-w-4xl pt-16 sm:pt-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
          Workshops
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance] sm:text-5xl">
          Aprenda a colocar agentes pra trabalhar.
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">
          Sessões ao vivo, mão na massa, com o time Work4You. Você não assiste —
          você sai com um agente montado e uma rotina no ar.
        </p>
      </div>

      {/* Next event — featured */}
      <div className="mx-auto mt-12 max-w-4xl">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          Próximo evento
        </p>
        <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-mata-deep sm:flex">
          <div className="flex flex-col items-center justify-center bg-mata px-10 py-8 text-center sm:py-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/70">
              set
            </p>
            <p className="font-brand text-5xl font-extrabold text-paper">30</p>
            <p className="mt-1 font-mono text-[11px] text-paper/70">2026</p>
          </div>
          <div className="flex-1 px-8 py-8 sm:px-10">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em]">
              <span className="rounded-full bg-paper/10 px-2.5 py-1 text-paper/90">
                Online
              </span>
              <span className="rounded-full bg-paper/10 px-2.5 py-1 text-paper/90">
                Ao vivo
              </span>
              <span className="rounded-full bg-paper/10 px-2.5 py-1 text-paper/90">
                Gratuito
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-extrabold tracking-[-0.01em] text-paper [text-wrap:balance]">
              Construa o seu primeiro agente — ao vivo
            </h2>
            <p className="mt-2 max-w-lg leading-relaxed text-paper/75">
              Com o time Work4You. Em uma hora: seu agente montado, um aplicativo
              conectado e a primeira rotina agendada — trabalhando enquanto você
              dorme.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <a
                href={RSVP_MAILTO}
                className="rounded-full bg-paper px-6 py-2.5 text-sm font-semibold text-mata-deep transition-opacity hover:opacity-90"
              >
                Reservar minha vaga
              </a>
              <p className="text-sm text-paper/60">Vagas limitadas · convite por e-mail</p>
            </div>
          </div>
        </div>
      </div>

      {/* Live tracks */}
      <div className="mx-auto max-w-4xl pt-16">
        <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-ink">
          As trilhas ao vivo.
        </h2>
        <p className="mt-2 max-w-xl text-ink-soft">
          Cada workshop segue uma trilha — do primeiro agente ao time completo.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {TRACKS.map((t) => (
            <div key={t.title} className="flex flex-col rounded-2xl border border-line bg-paper p-6">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-mata">
                {t.level}
              </p>
              <h3 className="mt-2 font-bold text-ink">{t.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">
                {t.text}
              </p>
              <p className="mt-4 font-mono text-[11px] text-ink-faint">{t.length}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Audiences */}
      <div className="mx-auto max-w-4xl pt-16">
        <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-ink">
          Feito pro seu tipo de negócio.
        </h2>
        <p className="mt-2 max-w-xl text-ink-soft">
          Os exemplos de cada sessão vêm do seu mundo — não de slides genéricos.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="rounded-2xl border border-line bg-paper p-6">
              <h3 className="font-bold text-ink">{a.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{a.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Team workshops band */}
      <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-line bg-cream px-8 py-8 sm:flex sm:items-center sm:justify-between sm:gap-8">
        <div>
          <p className="font-semibold text-ink">Workshop fechado pro seu time?</p>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
            Montamos uma sessão sob medida pra sua equipe — com os casos do seu
            negócio e os aplicativos que vocês já usam.
          </p>
        </div>
        <a
          href={TEAM_MAILTO}
          className="mt-5 inline-block shrink-0 rounded-full bg-mata px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-mata-deep sm:mt-0"
        >
          Solicitar pro meu time
        </a>
      </div>

      {/* Announcements note */}
      <p className="mx-auto max-w-4xl pb-20 pt-10 text-sm text-ink-faint">
        Novos workshops são anunciados na{" "}
        <Link href="/comunidade" className="text-mata underline decoration-salvia underline-offset-2 hover:text-mata-deep">
          Comunidade
        </Link>{" "}
        e no{" "}
        <Link href="/blog" className="text-mata underline decoration-salvia underline-offset-2 hover:text-mata-deep">
          Blog
        </Link>
        .
      </p>
    </div>
  );
}
