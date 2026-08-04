"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SiteLocale } from "@/lib/site-locale-shared";
import Icon, { type SiteIconName } from "@/components/site-icons";

// Help center (Cursor-style): searchable topic grid + FAQ accordion.
// Topics link into the real docs; FAQs carry inline answers.

interface TopicLink {
  label: string;
  href: string;
}
interface Topic {
  title: string;
  subtitle: string;
  icon: SiteIconName;
  links: TopicLink[];
}
interface Faq {
  q: string;
  a: string;
}
interface QuickCard {
  href: string;
  title: string;
  sub: string;
  icon: SiteIconName;
}
interface HelpContent {
  kicker: string;
  heading: string;
  searchPlaceholder: string;
  cards: QuickCard[];
  browseLabel: string;
  faqLabel: string;
  emptyPrefix: string;
  emptyHint: string;
  contactTitle: string;
  contactBody: string;
  topics: Topic[];
  faqs: Faq[];
}

const CONTENT: Record<SiteLocale, HelpContent> = {
  pt: {
    kicker: "Ajuda",
    heading: "Como podemos ajudar?",
    searchPlaceholder: "Busque um assunto — automações, WhatsApp, planos…",
    cards: [
      {
        href: "/documentacao",
        title: "Documentação",
        sub: "Guias completos do produto",
        icon: "book",
      },
      {
        href: "/comunidade",
        title: "Comunidade",
        sub: "Troque ideias com quem constrói",
        icon: "users",
      },
      {
        href: "mailto:contato@work4you.ai",
        title: "Fale com a gente",
        sub: "contato@work4you.ai",
        icon: "chat",
      },
    ],
    browseLabel: "Navegar por tópicos",
    faqLabel: "Perguntas frequentes",
    emptyPrefix: "Nada encontrado pra",
    emptyHint: "Tenta outra palavra — ou escreve pra gente:",
    contactTitle: "Não achou o que precisava?",
    contactBody:
      "Fala direto com o time — durante o acesso antecipado, a gente responde rápido.",
    topics: [
      {
        title: "Primeiros passos",
        subtitle: "Crie a conta e delegue a primeira tarefa.",
        icon: "rocket",
        links: [
          { label: "O que é a Work4You", href: "/documentacao/o-que-e" },
          { label: "Criar conta e começar", href: "/documentacao/primeiros-passos" },
          { label: "Planos e uso", href: "/documentacao/planos-e-creditos" },
          { label: "Ver preços", href: "/precos" },
        ],
      },
      {
        title: "Usando o agente",
        subtitle: "Sessões, projetos, automações e artefatos.",
        icon: "chat",
        links: [
          { label: "Tarefas e sessões", href: "/documentacao/tarefas-e-sessoes" },
          { label: "Projetos", href: "/documentacao/projetos" },
          { label: "Automações — tarefas que se repetem", href: "/documentacao/automacoes" },
          { label: "Artefatos — o que o agente cria", href: "/documentacao/artefatos" },
        ],
      },
      {
        title: "Personalizando o agente",
        subtitle: "Skills, conectores e MCPs — o agente do seu jeito.",
        icon: "grid",
        links: [
          { label: "Personalizar o agente", href: "/documentacao/personalizar" },
          { label: "Skills e o Marketplace", href: "/documentacao/skills" },
          { label: "Conectores — os apps do agente", href: "/documentacao/conectores" },
          { label: "MCPs — conexões avançadas", href: "/documentacao/personalizar" },
        ],
      },
      {
        title: "Canais e plataformas",
        subtitle: "Fale com o agente onde você já está.",
        icon: "plug",
        links: [
          { label: "Canais — WhatsApp, Telegram, Slack e mais", href: "/documentacao/canais" },
          { label: "WhatsApp API oficial, e-mail e SMS", href: "/documentacao/canais" },
          { label: "Mais de 1.000 apps conectados", href: "/documentacao/conectores" },
          { label: "Web, desktop e outras plataformas", href: "/documentacao/plataformas" },
        ],
      },
    ],
    faqs: [
      {
        q: "Preciso de cartão de crédito pra testar?",
        a: "Não. O plano Grátis não pede cartão. Nos planos pagos, os primeiros 7 dias são grátis e você pode cancelar antes de qualquer cobrança.",
      },
      {
        q: "O que acontece quando esgota o uso incluído?",
        a: "O agente para e avisa — nunca existe cobrança surpresa. O uso incluído renova no início do próximo ciclo. Com plano pago, você pode ativar on-demand na Conta (com limite de gasto) ou mudar para um plano com pool maior.",
      },
      {
        q: "Como mudo de plano ou cancelo a assinatura?",
        a: "Você pode mudar de plano em work4you.ai/precos, conectado na sua conta. O cancelamento vale a partir do fim do período já pago. Qualquer dificuldade, escreve pra contato@work4you.ai que a gente resolve.",
      },
      {
        q: "Esqueci minha senha. E agora?",
        a: "Na tela de entrada, clique em “Esqueci a senha” e você recebe um e-mail pra criar uma nova. Se entrou com o Google, não existe senha da Work4You — é só entrar com o Google de novo.",
      },
      {
        q: "Meus dados ficam seguros?",
        a: "Seu agente roda numa instância dedicada — um ambiente separado, só seu. Pagamentos são processados pela Stripe (não guardamos dados de cartão). Os detalhes estão na nossa Política de Privacidade.",
      },
      {
        q: "O agente funciona no meu WhatsApp?",
        a: "Sim. Conecte o WhatsApp na tela Canais e você passa a mandar tarefas e receber os artefatos por lá, sem abrir a plataforma.",
      },
      {
        q: "O agente trabalha sozinho, sem eu pedir?",
        a: "Sim, nas Automações. Você cria uma tarefa que se repete — todos os dias às 7:00, por exemplo — ou que dispara quando algo acontece no seu ambiente. O agente roda na nuvem, sempre ativo, e a tela mostra o histórico de execuções, com sucesso e com falha.",
      },
      {
        q: "Dá pra ajustar o agente ao meu trabalho?",
        a: "Dá. Em Personalizar você ajusta o seu agente em três abas: Skills (o que ele sabe fazer, com um Marketplace pra adicionar mais), Conectores (os apps que ele usa) e MCPs (conexões avançadas para ferramentas externas).",
      },
      {
        q: "Tem aplicativo pra celular ou pra Windows?",
        a: "Hoje a Work4You funciona no navegador — inclusive no celular, com a tela adaptada. O aplicativo pra Windows está em preparação.",
      },
      {
        q: "A Work4You escolhe o modelo de IA por mim?",
        a: "No modo Auto, sim: cada tarefa vai pro modelo mais indicado, equilibrando qualidade e custo. Se preferir, você escolhe manualmente entre os principais modelos do mercado, como Opus 5, Sonnet 5, GPT-5.6 Sol e Grok 4.5.",
      },
      {
        q: "Como falo com uma pessoa do time?",
        a: "Escreve pra contato@work4you.ai. Durante o acesso antecipado, a gente responde rápido — e feedback de quem usa vira produto.",
      },
    ],
  },
  en: {
    kicker: "Help",
    heading: "How can we help?",
    searchPlaceholder: "Search a topic — automations, WhatsApp, plans…",
    cards: [
      {
        href: "/documentacao",
        title: "Documentation",
        sub: "Complete product guides",
        icon: "book",
      },
      {
        href: "/comunidade",
        title: "Community",
        sub: "Swap ideas with fellow builders",
        icon: "users",
      },
      {
        href: "mailto:contato@work4you.ai",
        title: "Talk to us",
        sub: "contato@work4you.ai",
        icon: "chat",
      },
    ],
    browseLabel: "Browse by topic",
    faqLabel: "Frequently asked questions",
    emptyPrefix: "Nothing found for",
    emptyHint: "Try another word — or write to us:",
    contactTitle: "Didn't find what you needed?",
    contactBody:
      "Talk directly to the team — during early access, we answer fast.",
    topics: [
      {
        title: "Getting started",
        subtitle: "Create your account and delegate your first task.",
        icon: "rocket",
        links: [
          { label: "What is Work4You", href: "/documentacao/o-que-e" },
          { label: "Create an account and get started", href: "/documentacao/primeiros-passos" },
          { label: "Plans and usage", href: "/documentacao/planos-e-creditos" },
          { label: "See pricing", href: "/precos" },
        ],
      },
      {
        title: "Using your agent",
        subtitle: "Sessions, projects, automations, and artifacts.",
        icon: "chat",
        links: [
          { label: "Tasks and sessions", href: "/documentacao/tarefas-e-sessoes" },
          { label: "Projects", href: "/documentacao/projetos" },
          { label: "Automations — work that repeats", href: "/documentacao/automacoes" },
          { label: "Artifacts — what your agent creates", href: "/documentacao/artefatos" },
        ],
      },
      {
        title: "Customizing your agent",
        subtitle: "Skills, connectors, and MCPs — your agent, your way.",
        icon: "grid",
        links: [
          { label: "Customize your agent", href: "/documentacao/personalizar" },
          { label: "Skills and the Marketplace", href: "/documentacao/skills" },
          { label: "Connectors — the apps your agent uses", href: "/documentacao/conectores" },
          { label: "MCPs — advanced connections", href: "/documentacao/personalizar" },
        ],
      },
      {
        title: "Channels and platforms",
        subtitle: "Talk to your agent where you already are.",
        icon: "plug",
        links: [
          { label: "Channels — WhatsApp, Telegram, Slack, and more", href: "/documentacao/canais" },
          { label: "Official WhatsApp API, email, and SMS", href: "/documentacao/canais" },
          { label: "Over 1,000 connected apps", href: "/documentacao/conectores" },
          { label: "Web, desktop, and other platforms", href: "/documentacao/plataformas" },
        ],
      },
    ],
    faqs: [
      {
        q: "Do I need a credit card to try it?",
        a: "No. The Free plan doesn't ask for a card. On paid plans, the first 7 days are free and you can cancel before any charge.",
      },
      {
        q: "What happens when included usage runs out?",
        a: "The agent stops and lets you know — there's never a surprise charge. Included usage renews at the start of the next cycle. On a paid plan, you can enable on-demand in Account (with a spend limit) or switch to a plan with a larger pool.",
      },
      {
        q: "How do I change plans or cancel my subscription?",
        a: "You can change plans at work4you.ai/precos while signed in to your account. Cancellation takes effect at the end of the period you've already paid for. If you run into any trouble, write to contato@work4you.ai and we'll sort it out.",
      },
      {
        q: "I forgot my password. Now what?",
        a: "On the sign-in screen, click “Forgot password” and you'll get an email to create a new one. If you signed in with Google, there's no Work4You password — just sign in with Google again.",
      },
      {
        q: "Is my data safe?",
        a: "Your agent runs on a dedicated instance — a separate environment that's yours alone. Payments are processed by Stripe (we never store card details). The full details are in our Privacy Policy.",
      },
      {
        q: "Does the agent work on my WhatsApp?",
        a: "Yes. Connect WhatsApp on the Channels screen and you can send tasks and receive artifacts right there, without opening the platform.",
      },
      {
        q: "Does the agent work on its own, without me asking?",
        a: "Yes — that's Automations. You set up work that repeats (every day at 7:00, for example) or that fires when something happens in your environment. The agent runs in the cloud, always on, and the screen shows the run history, successes and failures.",
      },
      {
        q: "Can I shape the agent around my work?",
        a: "You can. Under Customize you tune your agent across three tabs: Skills (what it knows how to do, with a Marketplace to add more), Connectors (the apps it uses), and MCPs (advanced connections to external tools).",
      },
      {
        q: "Is there a mobile or Windows app?",
        a: "Today, Work4You runs in the browser — including on your phone, with a layout that adapts to the screen. The Windows app is in the works.",
      },
      {
        q: "Does Work4You pick the AI model for me?",
        a: "In Auto mode, yes: each task goes to the best-suited model, balancing quality and cost. If you prefer, you can pick manually from the leading models on the market, like Opus 5, Sonnet 5, GPT-5.6 Sol, and Grok 4.5.",
      },
      {
        q: "How do I talk to a real person on the team?",
        a: "Write to contato@work4you.ai. During early access, we answer fast — and feedback from the people using it turns into product.",
      },
    ],
  },
};

// Accent-insensitive normalization; a no-op for plain-ASCII English input,
// so search works the same in both locales.
function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function HelpClient({ locale }: { locale: SiteLocale }) {
  const [query, setQuery] = useState("");
  const q = norm(query.trim());
  const C = CONTENT[locale];

  const topics = useMemo(() => {
    if (!q) return C.topics;
    return C.topics.map((t) => {
      const titleHit = norm(t.title).includes(q) || norm(t.subtitle).includes(q);
      const links = t.links.filter((l) => titleHit || norm(l.label).includes(q));
      return { ...t, links };
    }).filter((t) => t.links.length > 0);
  }, [q, C]);

  const faqs = useMemo(() => {
    if (!q) return C.faqs;
    return C.faqs.filter((f) => norm(f.q).includes(q) || norm(f.a).includes(q));
  }, [q, C]);

  const empty = q && topics.length === 0 && faqs.length === 0;

  return (
    <div className="px-6">
      {/* Hero + search */}
      <div className="mx-auto max-w-2xl pt-16 text-center sm:pt-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
          {C.kicker}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance]">
          {C.heading}
        </h1>
        <div className="relative mt-7">
          <svg
            className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={C.searchPlaceholder}
            className="w-full rounded-full border border-line bg-paper py-3.5 pl-12 pr-5 text-[15px] text-ink placeholder:text-ink-faint focus:border-salvia focus:outline-none focus:ring-2 focus:ring-salvia-soft"
          />
        </div>
      </div>

      {/* Quick cards */}
      {!q && (
        <div className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-3">
          {C.cards.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="group rounded-2xl border border-line bg-paper p-5 transition-colors hover:border-salvia hover:bg-paper-deep"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-salvia-soft text-mata">
                <Icon name={c.icon} className="h-5 w-5" />
              </span>
              <p className="mt-4 font-semibold text-ink group-hover:text-mata-deep">
                {c.title}
              </p>
              <p className="mt-1 text-sm text-ink-soft">{c.sub}</p>
            </Link>
          ))}
        </div>
      )}

      {/* Topics */}
      <div className="mx-auto max-w-4xl pb-4 pt-14">
        {!empty && (
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            {C.browseLabel}
          </p>
        )}
        <div className="mt-4 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {topics.map((t) => (
            <section key={t.title}>
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-salvia-soft text-mata">
                  <Icon name={t.icon} className="h-4 w-4" />
                </span>
                <h2 className="font-bold text-ink">{t.title}</h2>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{t.subtitle}</p>
              <ul className="mt-3 space-y-1.5">
                {t.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[13.5px] text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-mata hover:decoration-salvia"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {/* FAQ */}
      {faqs.length > 0 && (
        <div className="mx-auto max-w-3xl pb-8 pt-10">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            {C.faqLabel}
          </p>
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-paper">
            {faqs.map((f) => (
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
      )}

      {/* Empty search state */}
      {empty && (
        <div className="mx-auto max-w-md pb-8 pt-6 text-center">
          <p className="text-ink-soft">
            {C.emptyPrefix} “{query}”.
          </p>
          <p className="mt-2 text-sm text-ink-faint">
            {C.emptyHint}{" "}
            <a href="mailto:contato@work4you.ai" className="text-mata underline">
              contato@work4you.ai
            </a>
          </p>
        </div>
      )}

      {/* Contact strip */}
      <div className="mx-auto mb-20 mt-8 max-w-4xl rounded-2xl border border-line bg-cream px-8 py-7 text-center">
        <p className="font-semibold text-ink">{C.contactTitle}</p>
        <p className="mt-1 text-sm text-ink-soft">{C.contactBody}</p>
        <a
          href="mailto:contato@work4you.ai"
          className="mt-4 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-black"
        >
          contato@work4you.ai
        </a>
      </div>
    </div>
  );
}
