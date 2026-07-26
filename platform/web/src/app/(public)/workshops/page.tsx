import Link from "next/link";
import { getSiteLocale } from "@/lib/site-locale";

export const metadata = {
  title: "Workshops — Work4You",
  description:
    "Sessões ao vivo, mão na massa: saia com um agente montado e uma rotina no ar.",
};

const RSVP_MAILTO =
  "mailto:contato@work4you.ai?subject=Quero%20minha%20vaga%20no%20workshop%20de%2030%2F09";
const TEAM_MAILTO =
  "mailto:contato@work4you.ai?subject=Workshop%20para%20o%20meu%20time";

type Track = { level: string; title: string; text: string; length: string };
type Audience = { title: string; text: string };

type WorkshopsContent = {
  kicker: string;
  heroTitle: string;
  heroText: string;
  nextEvent: string;
  eventMonth: string;
  badgeOnline: string;
  badgeLive: string;
  badgeFree: string;
  eventTitle: string;
  eventText: string;
  rsvpCta: string;
  rsvpNote: string;
  tracksTitle: string;
  tracksText: string;
  tracks: Track[];
  audiencesTitle: string;
  audiencesText: string;
  audiences: Audience[];
  teamTitle: string;
  teamText: string;
  teamCta: string;
  announcePrefix: string;
  announceCommunity: string;
  announceMiddle: string;
  announceBlog: string;
};

// Live-session tracks (curriculum, not fake recordings — we have no
// on-demand library yet; these are what the live workshops cover).
const CONTENT: { pt: WorkshopsContent; en: WorkshopsContent } = {
  pt: {
    kicker: "Workshops",
    heroTitle: "Aprenda a colocar agentes pra trabalhar.",
    heroText:
      "Sessões ao vivo, mão na massa, com o time Work4You. Você não assiste — você sai com um agente montado e uma rotina no ar.",
    nextEvent: "Próximo evento",
    eventMonth: "set",
    badgeOnline: "Online",
    badgeLive: "Ao vivo",
    badgeFree: "Gratuito",
    eventTitle: "Construa o seu primeiro agente — ao vivo",
    eventText:
      "Com o time Work4You. Em uma hora: seu agente montado, um aplicativo conectado e a primeira rotina agendada — trabalhando enquanto você dorme.",
    rsvpCta: "Reservar minha vaga",
    rsvpNote: "Vagas limitadas · convite por e-mail",
    tracksTitle: "As trilhas ao vivo.",
    tracksText:
      "Cada workshop segue uma trilha — do primeiro agente ao time completo.",
    tracks: [
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
    ],
    audiencesTitle: "Feito pro seu tipo de negócio.",
    audiencesText:
      "Os exemplos de cada sessão vêm do seu mundo — não de slides genéricos.",
    audiences: [
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
    ],
    teamTitle: "Workshop fechado pro seu time?",
    teamText:
      "Montamos uma sessão sob medida pra sua equipe — com os casos do seu negócio e os aplicativos que vocês já usam.",
    teamCta: "Solicitar pro meu time",
    announcePrefix: "Novos workshops são anunciados na",
    announceCommunity: "Comunidade",
    announceMiddle: "e no",
    announceBlog: "Blog",
  },
  en: {
    kicker: "Workshops",
    heroTitle: "Learn to put agents to work.",
    heroText:
      "Live, hands-on sessions with the Work4You team. You don't just watch — you leave with an agent built and a routine running.",
    nextEvent: "Next event",
    eventMonth: "Sep",
    badgeOnline: "Online",
    badgeLive: "Live",
    badgeFree: "Free",
    eventTitle: "Build your first agent — live",
    eventText:
      "With the Work4You team. In one hour: your agent built, an app connected, and your first routine scheduled — working while you sleep.",
    rsvpCta: "Save my spot",
    rsvpNote: "Limited spots · invite by email",
    tracksTitle: "The live tracks.",
    tracksText:
      "Every workshop follows a track — from your first agent to a full team.",
    tracks: [
      {
        level: "Fundamentals",
        title: "Work4You 101 — your first agent",
        text: "From account setup to your first delivery: how to delegate well, approve with confidence, and turn that first task into a routine.",
        length: "1h live",
      },
      {
        level: "Connections",
        title: "Your agent in your apps",
        text: "WhatsApp, Gmail, spreadsheets, and your CRM: connect the apps you use every day and run your agent from wherever you are.",
        length: "1h live",
      },
      {
        level: "Advanced",
        title: "Agent Studio — from one agent to a team",
        text: "Agents with defined roles: their own knowledge, credit caps, per-agent channels, and delegation of big goals.",
        length: "1h live",
      },
    ],
    audiencesTitle: "Built for your kind of business.",
    audiencesText:
      "The examples in every session come from your world — not generic slides.",
    audiences: [
      {
        title: "Agencies and marketing",
        text: "Posts with copy and artwork, campaign reports, client service — at agency pace.",
      },
      {
        title: "Retail and e-commerce",
        text: "WhatsApp customer service, catalog questions answered with sources, automatic billing and post-sale follow-up.",
      },
      {
        title: "Services and clinics",
        text: "Scheduling, confirmations, reminders, and follow-up — the front desk that never goes offline.",
      },
      {
        title: "Sales teams",
        text: "A new lead becomes a proposal in minutes; the whole funnel monitored by a routine.",
      },
    ],
    teamTitle: "A private workshop for your team?",
    teamText:
      "We'll put together a session tailored to your team — with cases from your business and the apps you already use.",
    teamCta: "Request one for my team",
    announcePrefix: "New workshops are announced in the",
    announceCommunity: "Community",
    announceMiddle: "and on the",
    announceBlog: "Blog",
  },
};

// Workshops page (Cursor-style structure): hero -> next event (featured) ->
// live tracks -> team workshops band -> where announcements happen.
export default async function WorkshopsPage() {
  const locale = await getSiteLocale();
  const t = CONTENT[locale];

  return (
    <div className="px-6">
      {/* Hero */}
      <div className="mx-auto max-w-4xl pt-16 sm:pt-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
          {t.kicker}
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance] sm:text-5xl">
          {t.heroTitle}
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">
          {t.heroText}
        </p>
      </div>

      {/* Next event — featured */}
      <div className="mx-auto mt-12 max-w-4xl">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          {t.nextEvent}
        </p>
        <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-mata-deep sm:flex">
          <div className="flex flex-col items-center justify-center bg-mata px-10 py-8 text-center sm:py-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/70">
              {t.eventMonth}
            </p>
            <p className="font-brand text-5xl font-extrabold text-paper">30</p>
            <p className="mt-1 font-mono text-[11px] text-paper/70">2026</p>
          </div>
          <div className="flex-1 px-8 py-8 sm:px-10">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em]">
              <span className="rounded-full bg-paper/10 px-2.5 py-1 text-paper/90">
                {t.badgeOnline}
              </span>
              <span className="rounded-full bg-paper/10 px-2.5 py-1 text-paper/90">
                {t.badgeLive}
              </span>
              <span className="rounded-full bg-paper/10 px-2.5 py-1 text-paper/90">
                {t.badgeFree}
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-extrabold tracking-[-0.01em] text-paper [text-wrap:balance]">
              {t.eventTitle}
            </h2>
            <p className="mt-2 max-w-lg leading-relaxed text-paper/75">
              {t.eventText}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <a
                href={RSVP_MAILTO}
                className="rounded-full bg-paper px-6 py-2.5 text-sm font-semibold text-mata-deep transition-opacity hover:opacity-90"
              >
                {t.rsvpCta}
              </a>
              <p className="text-sm text-paper/60">{t.rsvpNote}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Live tracks */}
      <div className="mx-auto max-w-4xl pt-16">
        <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-ink">
          {t.tracksTitle}
        </h2>
        <p className="mt-2 max-w-xl text-ink-soft">
          {t.tracksText}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {t.tracks.map((track) => (
            <div key={track.title} className="flex flex-col rounded-2xl border border-line bg-paper p-6">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-mata">
                {track.level}
              </p>
              <h3 className="mt-2 font-bold text-ink">{track.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">
                {track.text}
              </p>
              <p className="mt-4 font-mono text-[11px] text-ink-faint">{track.length}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Audiences */}
      <div className="mx-auto max-w-4xl pt-16">
        <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-ink">
          {t.audiencesTitle}
        </h2>
        <p className="mt-2 max-w-xl text-ink-soft">
          {t.audiencesText}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {t.audiences.map((a) => (
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
          <p className="font-semibold text-ink">{t.teamTitle}</p>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
            {t.teamText}
          </p>
        </div>
        <a
          href={TEAM_MAILTO}
          className="mt-5 inline-block shrink-0 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-black sm:mt-0"
        >
          {t.teamCta}
        </a>
      </div>

      {/* Announcements note */}
      <p className="mx-auto max-w-4xl pb-20 pt-10 text-sm text-ink-faint">
        {t.announcePrefix}{" "}
        <Link href="/comunidade" className="text-mata underline decoration-salvia underline-offset-2 hover:text-mata-deep">
          {t.announceCommunity}
        </Link>{" "}
        {t.announceMiddle}{" "}
        <Link href="/blog" className="text-mata underline decoration-salvia underline-offset-2 hover:text-mata-deep">
          {t.announceBlog}
        </Link>
        .
      </p>
    </div>
  );
}
