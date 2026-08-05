import Link from "next/link";
import Image from "next/image";
import Icon, { type SiteIconName } from "@/components/site-icons";
import { getSiteLocale } from "@/lib/site-locale";

export const metadata = {
  title: "Comunidade — Work4You",
  description:
    "Encontros, workshops e desafios de construção de agentes — com quem está colocando IA pra trabalhar de verdade.",
};

const JOIN_MAILTO =
  "mailto:contato@work4you.ai?subject=Quero%20entrar%20na%20comunidade%20Work4You";

// All user-visible copy lives here, per locale. Marquee cards are use-case
// scenarios (no invented testimonials/handles — we don't fake social proof).
type ComunidadeContent = {
  kicker: string;
  heroTitle: string;
  heroLead: string;
  joinCta: string;
  workshopsCta: string;
  marquee: { tag: string; text: string }[];
  formatsTitle: string;
  formatsLead: string;
  formats: { icon: SiteIconName; title: string; text: string }[];
  bandTitle: string;
  bandLead: string;
  bandItems: [string, string][];
  eventsKicker: string;
  eventsTitle: string;
  eventsLead: string;
  eventsCta: string;
  faqTitle: string;
  faqs: { q: string; a: string }[];
};

const CONTENT: Record<"pt" | "en", ComunidadeContent> = {
  pt: {
    kicker: "Comunidade",
    heroTitle: "Junte-se à comunidade Work4You.",
    heroLead:
      "Encontros, workshops e desafios de construção de agentes — com quem está colocando IA pra trabalhar de verdade.",
    joinCta: "Entrar na comunidade",
    workshopsCta: "Ver os workshops",
    marquee: [
      { tag: "Atendimento", text: "Agente respondendo o WhatsApp da loja — inclusive de madrugada." },
      { tag: "Vendas", text: "Lead novo no CRM → proposta em PDF no e-mail do dono, em minutos." },
      { tag: "Marketing", text: "3 posts por semana: copy + arte, prontos pra aprovar e publicar." },
      { tag: "Rotina", text: "Toda segunda às 8h, o resumo da semana chega antes do café." },
      { tag: "Pesquisa", text: "Concorrentes mapeados numa planilha comparativa — sem abrir 40 abas." },
      { tag: "Financeiro", text: "Cobranças em atraso viram lembretes educados, enviados sozinhos." },
      { tag: "Código", text: "Uma landing page no ar a partir de uma frase — com preview ao vivo." },
      { tag: "Operação", text: "Um lançamento no ar: automações e modo MAX tocando enquanto você dorme." },
      { tag: "Agenda", text: "O follow-up que ninguém esquecia mais — porque não é mais ninguém." },
      { tag: "Conhecimento", text: "O agente que leu o catálogo inteiro e responde citando a fonte." },
    ],
    formatsTitle: "O que vamos fazer juntos.",
    formatsLead:
      "De um café descontraído a um fim de semana inteiro construindo — os formatos da comunidade Work4You.",
    formats: [
      {
        icon: "broadcast",
        title: "Encontros online",
        text: "Demos ao vivo, troca de casos e perguntas abertas com o time. O jeito mais rápido de ver o que outros donos de agente estão fazendo.",
      },
      {
        icon: "monitor",
        title: "Workshops ao vivo",
        text: "Sessões mão na massa: você sai com um agente montado e uma rotina no ar. Do básico ao avançado.",
      },
      {
        icon: "rocket",
        title: "Desafios de construção",
        text: "Um fim de semana pra montar um agente que trabalha de verdade — com o time por perto e os melhores projetos em destaque.",
      },
      {
        icon: "heart",
        title: "Cafés Work4You",
        text: "Encontros presenciais, informais, cidade a cidade — construtores na mesma mesa, à medida que a comunidade cresce.",
      },
    ],
    bandTitle: "Estamos no começo — de propósito.",
    bandLead:
      "A Work4You está em acesso antecipado, e a comunidade nasce agora. Quem chega nessa fase não entra numa multidão — ajuda a fundar uma.",
    bandItems: [
      ["Acesso direto", "Fala com quem constrói o produto — sem fila, sem robô de suporte."],
      ["Voz no produto", "O que a comunidade pede primeiro, a gente constrói primeiro."],
      ["Status de fundador", "Membros da primeira hora terão vantagens permanentes."],
    ],
    eventsKicker: "Próximos encontros",
    eventsTitle: "Os primeiros encontros estão sendo marcados.",
    eventsLead:
      "Entra na comunidade pra receber o convite — ou se apresenta pra sediar um na sua cidade.",
    eventsCta: "Quero participar",
    faqTitle: "Perguntas frequentes",
    faqs: [
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
    ],
  },
  en: {
    kicker: "Community",
    heroTitle: "Join the Work4You community.",
    heroLead:
      "Meetups, workshops, and agent build challenges — with people putting AI to work for real.",
    joinCta: "Join the community",
    workshopsCta: "See the workshops",
    marquee: [
      { tag: "Support", text: "An agent answering the store's WhatsApp — even in the middle of the night." },
      { tag: "Sales", text: "New lead in the CRM → PDF proposal in the owner's inbox, within minutes." },
      { tag: "Marketing", text: "3 posts a week: copy + artwork, ready to approve and publish." },
      { tag: "Routine", text: "Every Monday at 8 a.m., the weekly summary lands before coffee." },
      { tag: "Research", text: "Competitors mapped into a comparison spreadsheet — without opening 40 tabs." },
      { tag: "Finance", text: "Overdue invoices become polite reminders, sent on their own." },
      { tag: "Code", text: "A landing page live from a single sentence — with a live preview." },
      { tag: "Operations", text: "Launch week: automations and MAX mode running while you sleep." },
      { tag: "Agenda", text: "The follow-up no one forgets anymore — because it's not a person anymore." },
      { tag: "Knowledge", text: "The agent that read the entire catalog and answers citing the source." },
    ],
    formatsTitle: "What we'll do together.",
    formatsLead:
      "From a casual coffee to a whole weekend of building — the Work4You community formats.",
    formats: [
      {
        icon: "broadcast",
        title: "Online meetups",
        text: "Live demos, shared use cases, and open Q&A with the team. The fastest way to see what other agent owners are doing.",
      },
      {
        icon: "monitor",
        title: "Live workshops",
        text: "Hands-on sessions: you leave with an agent built and a routine running. From basics to advanced.",
      },
      {
        icon: "rocket",
        title: "Build challenges",
        text: "A weekend to build an agent that actually works — with the team close by and the best projects in the spotlight.",
      },
      {
        icon: "heart",
        title: "Work4You Coffees",
        text: "Informal, in-person meetups, city by city — builders at the same table as the community grows.",
      },
    ],
    bandTitle: "We're at the beginning — on purpose.",
    bandLead:
      "Work4You is in early access, and the community is being born right now. Arrive at this stage and you're not joining a crowd — you're helping found one.",
    bandItems: [
      ["Direct access", "Talk to the people building the product — no queue, no support bot."],
      ["A voice in the product", "What the community asks for first, we build first."],
      ["Founder status", "Members from the very start will have permanent perks."],
    ],
    eventsKicker: "Upcoming meetups",
    eventsTitle: "The first meetups are being scheduled.",
    eventsLead:
      "Join the community to get the invite — or step up to host one in your city.",
    eventsCta: "Count me in",
    faqTitle: "Frequently asked questions",
    faqs: [
      {
        q: "How do I join the community?",
        a: "Email contato@work4you.ai with the subject “Community” — we'll add you to the group and you'll start getting invites to the meetups. The official spaces are being set up together with the first members.",
      },
      {
        q: "Can I organize a meetup in my city?",
        a: "You can — and we want you to. The first regional meetups will come from community members. Write to us with your city and the format you have in mind, and we'll build it together.",
      },
      {
        q: "Does Work4You support events, courses, or content?",
        a: "During early access, we evaluate partnerships case by case — events, technical communities, content creators. Send your idea to contato@work4you.ai.",
      },
      {
        q: "How do I reach the team?",
        a: "contato@work4you.ai. Every message gets read — and feedback from people who use the product becomes product.",
      },
    ],
  },
};

// Community page (Cursor-style structure, honest to our early-access stage):
// hero -> use-case marquee -> formats -> founding-member band -> FAQ.
export default async function ComunidadePage() {
  const locale = await getSiteLocale();
  const c = CONTENT[locale];
  return (
    <div>
      {/* Hero */}
      <div className="px-6">
        <div className="mx-auto max-w-2xl pt-16 text-center sm:pt-20">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
            {c.kicker}
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance] sm:text-5xl">
            {c.heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-lg leading-relaxed text-ink-soft">
            {c.heroLead}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a
              href={JOIN_MAILTO}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-black"
            >
              {c.joinCta}
            </a>
            <Link
              href="/workshops"
              className="rounded-full border border-line bg-paper px-6 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-deep"
            >
              {c.workshopsCta}
            </Link>
          </div>
        </div>
      </div>

      {/* Use-case marquee (duplicated 2x for a seamless loop) */}
      <div className="w4y-marquee-wrap mt-14 overflow-hidden border-y border-line bg-paper-deep py-6">
        <div className="w4y-marquee flex w-max gap-4 pr-4">
          {[...c.marquee, ...c.marquee].map((m, i) => (
            <div
              key={i}
              className="w-[290px] shrink-0 rounded-2xl border border-line bg-paper p-5"
            >
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-mata">
                {m.tag}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {m.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Formats */}
      <div className="px-6">
        <div className="mx-auto max-w-4xl pt-16">
          <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-ink">
            {c.formatsTitle}
          </h2>
          <p className="mt-2 max-w-xl text-ink-soft">
            {c.formatsLead}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {c.formats.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-line bg-paper p-6"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-salvia-soft text-mata">
                  <Icon name={f.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-bold text-ink">{f.title}</h3>
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
        <div className="relative mx-auto mt-16 max-w-4xl overflow-hidden rounded-3xl bg-mata-deep px-8 py-12 text-center sm:px-14">
          <Image
            src="/media/night-forest.jpg"
            alt=""
            fill
            sizes="(min-width: 896px) 896px, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-mata-deep/80" />
          <div className="relative z-10">
            <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-paper [text-wrap:balance] sm:text-3xl">
              {c.bandTitle}
            </h2>
            <p className="mx-auto mt-3 max-w-xl leading-relaxed text-paper/80">
              {c.bandLead}
            </p>
            <div className="mx-auto mt-9 grid max-w-2xl gap-6 sm:grid-cols-3">
              {c.bandItems.map(([t, d]) => (
                <div key={t}>
                  <p className="font-semibold text-paper">{t}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-paper/70">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* First events — honest empty state */}
      <div className="px-6">
        <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-line bg-cream px-8 py-8 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-mata">
              {c.eventsKicker}
            </p>
            <p className="mt-2 font-semibold text-ink">
              {c.eventsTitle}
            </p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
              {c.eventsLead}
            </p>
          </div>
          <a
            href={JOIN_MAILTO}
            className="mt-5 inline-block shrink-0 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-black sm:mt-0"
          >
            {c.eventsCta}
          </a>
        </div>
      </div>

      {/* FAQ */}
      <div className="px-6">
        <div className="mx-auto max-w-3xl pb-20 pt-16">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            {c.faqTitle}
          </p>
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-paper">
            {c.faqs.map((f) => (
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
