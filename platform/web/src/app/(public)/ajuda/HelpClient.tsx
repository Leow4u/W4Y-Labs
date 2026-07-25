"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// Help center (Cursor-style): searchable topic grid + FAQ accordion.
// Topics link into the real docs; FAQs carry inline answers.

interface TopicLink {
  label: string;
  href: string;
}
interface Topic {
  title: string;
  subtitle: string;
  links: TopicLink[];
}
interface Faq {
  q: string;
  a: string;
}

const TOPICS: Topic[] = [
  {
    title: "Primeiros passos",
    subtitle: "Crie a conta e delegue a primeira tarefa.",
    links: [
      { label: "O que é a Work4You", href: "/documentacao/o-que-e" },
      { label: "Criar conta e começar", href: "/documentacao/primeiros-passos" },
      { label: "Planos e créditos", href: "/documentacao/planos-e-creditos" },
      { label: "Ver preços", href: "/precos" },
    ],
  },
  {
    title: "Usando o agente",
    subtitle: "Tarefas, projetos, rotinas e entregas.",
    links: [
      { label: "Tarefas e sessões", href: "/documentacao/tarefas-e-sessoes" },
      { label: "Projetos", href: "/documentacao/projetos" },
      { label: "Agenda e rotinas", href: "/documentacao/agenda" },
      { label: "Entregas e arquivos", href: "/documentacao/entregas-e-arquivos" },
    ],
  },
  {
    title: "Construindo agentes",
    subtitle: "Agentes sob medida, com conhecimento e limites.",
    links: [
      { label: "Agent Studio", href: "/documentacao/agent-studio" },
      { label: "Habilidades", href: "/documentacao/habilidades" },
      { label: "Conhecimento do agente", href: "/documentacao/agent-studio" },
      { label: "Teto de créditos por agente", href: "/documentacao/agent-studio" },
    ],
  },
  {
    title: "Conexões",
    subtitle: "WhatsApp, e-mail e os apps que você já usa.",
    links: [
      { label: "Canais — WhatsApp, Telegram e mais", href: "/documentacao/canais" },
      { label: "Conectores — mais de 1.000 apps", href: "/documentacao/conectores" },
      { label: "Desligar um app numa conversa", href: "/documentacao/conectores" },
      { label: "Web, desktop e outras plataformas", href: "/documentacao/plataformas" },
    ],
  },
];

const FAQS: Faq[] = [
  {
    q: "Preciso de cartão de crédito pra testar?",
    a: "Não. O plano Grátis não pede cartão. Nos planos pagos, os primeiros 7 dias são grátis e você pode cancelar antes de qualquer cobrança.",
  },
  {
    q: "O que acontece quando meus créditos acabam?",
    a: "O agente para e avisa — nunca existe cobrança surpresa. Os créditos renovam no início do próximo ciclo, ou você pode mudar pra um plano com mais créditos a qualquer momento.",
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
    a: "Sim. Conecte o WhatsApp na tela Canais e você passa a mandar tarefas e receber as entregas por lá, sem abrir a plataforma.",
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
];

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function HelpClient() {
  const [query, setQuery] = useState("");
  const q = norm(query.trim());

  const topics = useMemo(() => {
    if (!q) return TOPICS;
    return TOPICS.map((t) => {
      const titleHit = norm(t.title).includes(q) || norm(t.subtitle).includes(q);
      const links = t.links.filter((l) => titleHit || norm(l.label).includes(q));
      return { ...t, links };
    }).filter((t) => t.links.length > 0);
  }, [q]);

  const faqs = useMemo(() => {
    if (!q) return FAQS;
    return FAQS.filter((f) => norm(f.q).includes(q) || norm(f.a).includes(q));
  }, [q]);

  const empty = q && topics.length === 0 && faqs.length === 0;

  return (
    <div className="px-6">
      {/* Hero + search */}
      <div className="mx-auto max-w-2xl pt-16 text-center sm:pt-20">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
          Ajuda
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance]">
          Como podemos ajudar?
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
            placeholder="Busque um assunto — rotinas, WhatsApp, créditos…"
            className="w-full rounded-full border border-line bg-paper py-3.5 pl-12 pr-5 text-[15px] text-ink placeholder:text-ink-faint focus:border-salvia focus:outline-none focus:ring-2 focus:ring-salvia-soft"
          />
        </div>
      </div>

      {/* Quick cards */}
      {!q && (
        <div className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-3">
          {[
            {
              href: "/documentacao",
              title: "Documentação",
              sub: "Guias completos do produto",
            },
            {
              href: "/comunidade",
              title: "Comunidade",
              sub: "Troque ideias com quem constrói",
            },
            {
              href: "mailto:contato@work4you.ai",
              title: "Fale com a gente",
              sub: "contato@work4you.ai",
            },
          ].map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="group rounded-2xl border border-line bg-paper p-5 transition-colors hover:border-salvia hover:bg-paper-deep"
            >
              <p className="font-semibold text-ink group-hover:text-mata-deep">
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
            Navegar por tópicos
          </p>
        )}
        <div className="mt-4 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {topics.map((t) => (
            <section key={t.title}>
              <h2 className="font-bold text-ink">{t.title}</h2>
              <p className="mt-1 text-sm text-ink-soft">{t.subtitle}</p>
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
            Perguntas frequentes
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
            Nada encontrado pra “{query}”.
          </p>
          <p className="mt-2 text-sm text-ink-faint">
            Tenta outra palavra — ou escreve pra gente:{" "}
            <a href="mailto:contato@work4you.ai" className="text-mata underline">
              contato@work4you.ai
            </a>
          </p>
        </div>
      )}

      {/* Contact strip */}
      <div className="mx-auto mb-20 mt-8 max-w-4xl rounded-2xl border border-line bg-cream px-8 py-7 text-center">
        <p className="font-semibold text-ink">Não achou o que precisava?</p>
        <p className="mt-1 text-sm text-ink-soft">
          Fala direto com o time — durante o acesso antecipado, a gente responde
          rápido.
        </p>
        <a
          href="mailto:contato@work4you.ai"
          className="mt-4 inline-block rounded-full bg-mata px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-mata-deep"
        >
          contato@work4you.ai
        </a>
      </div>
    </div>
  );
}
