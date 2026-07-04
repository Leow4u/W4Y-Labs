import Link from "next/link";
import DelegationInput from "@/components/DelegationInput";

// Landing oficial da Work4You. Linguagem pública: funcionário digital,
// agente, trabalho, rotina, conectores, arquivos, aprovação humana,
// histórico, controle. Nada de jargão técnico.

const AREAS = [
  { title: "Vendas", copy: "Prospecção, follow-ups e propostas que não ficam para amanhã." },
  { title: "Atendimento", copy: "Respostas rápidas e consistentes, com aprovação humana quando importa." },
  { title: "Operações", copy: "Rotinas repetitivas executadas todos os dias, sem lembrete." },
  { title: "Financeiro", copy: "Conciliações, cobranças e relatórios sempre em dia." },
  { title: "Jurídico", copy: "Análise de contratos e documentos com histórico de cada decisão." },
  { title: "RH", copy: "Triagem, onboarding e comunicação interna sem fila." },
];

const TEMPLATES = [
  { title: "Agente de vendas", copy: "Qualifica leads, escreve follow-ups e prepara propostas." },
  { title: "Agente de atendimento", copy: "Responde clientes com o tom da sua empresa." },
  { title: "Analista de documentos", copy: "Lê contratos, planilhas e PDFs e devolve o que importa." },
  { title: "Rotina recorrente", copy: "Relatório toda manhã, cobrança toda sexta — no automático." },
];

const CONNECTORS = [
  "Gmail", "Google Drive", "Google Sheets", "Notion", "Slack", "WhatsApp",
  "CRM", "Calendário", "Planilhas", "E-mail corporativo",
];

const CONTROLS = [
  { title: "Aprovação humana", copy: "Ações sensíveis esperam o seu OK antes de acontecer." },
  { title: "Histórico completo", copy: "Cada tarefa, decisão e resultado fica registrado." },
  { title: "Controle de uso", copy: "Acompanhe consumo e custo por agente e por equipe." },
  { title: "Acesso por equipe", copy: "Cada pessoa vê o que deve ver. Simples assim." },
];

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-brand text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
      {children}
    </p>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* ── Hero: o gesto de delegar ─────────────────────────────────── */}
      <section className="px-6 pb-20 pt-20 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-brand text-sm font-medium text-neutral-500">
            Work4You — funcionários digitais
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-neutral-900 md:text-5xl">
            O que você quer delegar hoje?
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-neutral-500">
            Descreva a tarefa e o seu agente assume o trabalho — com aprovação
            humana, histórico e controle de tudo.
          </p>
        </div>
        <div className="mt-10">
          <DelegationInput />
        </div>
      </section>

      {/* ── Do processo ao funcionário digital ───────────────────────── */}
      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <SectionKicker>Como funciona</SectionKicker>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            Do processo ao funcionário digital
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { n: "1", title: "Descreva o trabalho", copy: "Explique a tarefa como explicaria a alguém do seu time — em português, sem configuração." },
              { n: "2", title: "Delegue ao agente", copy: "O agente executa: pesquisa, escreve, analisa arquivos, usa suas ferramentas e segue rotinas." },
              { n: "3", title: "Acompanhe e aprove", copy: "Você vê o andamento, aprova o que é sensível e recebe o resultado pronto." },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-neutral-200 bg-white p-7">
                <span className="font-brand text-sm font-semibold text-neutral-400">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{s.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plataforma ────────────────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <SectionKicker>Plataforma</SectionKicker>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
            Para criar, executar e monitorar agentes
          </h2>
          <p className="mt-4 max-w-2xl text-neutral-500">
            Um só lugar para o trabalho delegado: os agentes conversam, executam
            tarefas longas na nuvem e seguem rotinas — e você mantém o controle.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Criar agentes", copy: "Em linguagem natural ou a partir de modelos prontos." },
              { title: "Executar trabalho", copy: "Tarefas curtas ou longas — o agente continua mesmo com você offline." },
              { title: "Rotinas", copy: "Trabalhos recorrentes que rodam todo dia, semana ou evento." },
              { title: "Monitorar", copy: "Histórico, uso e resultados de cada agente, sempre à mão." },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-neutral-200 p-6">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{f.copy}</p>
              </div>
            ))}
          </div>
          <Link
            href="/plataforma"
            className="mt-8 inline-block text-sm font-medium text-neutral-700 underline-offset-4 hover:underline"
          >
            Conhecer a plataforma →
          </Link>
        </div>
      </section>

      {/* ── Soluções por área ─────────────────────────────────────────── */}
      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <SectionKicker>Soluções</SectionKicker>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Um agente para cada área</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {AREAS.map((a) => (
              <div key={a.title} className="rounded-2xl border border-neutral-200 bg-white p-6">
                <h3 className="font-brand font-semibold">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{a.copy}</p>
              </div>
            ))}
          </div>
          <Link
            href="/solucoes"
            className="mt-8 inline-block text-sm font-medium text-neutral-700 underline-offset-4 hover:underline"
          >
            Ver soluções por área →
          </Link>
        </div>
      </section>

      {/* ── Modelos prontos ───────────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <SectionKicker>Modelos</SectionKicker>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Modelos prontos de agentes
          </h2>
          <p className="mt-4 max-w-2xl text-neutral-500">
            Comece em minutos: ative um modelo pronto e ajuste ao jeito da sua
            empresa.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map((t) => (
              <div key={t.title} className="flex flex-col rounded-2xl border border-neutral-200 p-6">
                <h3 className="font-semibold">{t.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-500">{t.copy}</p>
                <Link
                  href="/modelos"
                  className="mt-4 text-sm font-medium text-neutral-700 underline-offset-4 hover:underline"
                >
                  Usar este modelo →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Conectores e arquivos ─────────────────────────────────────── */}
      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-start gap-10 md:grid-cols-2">
            <div>
              <SectionKicker>Conectores e arquivos</SectionKicker>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Seu agente trabalha onde você trabalha
              </h2>
              <p className="mt-4 max-w-md leading-relaxed text-neutral-500">
                Conecte as ferramentas do dia a dia e envie arquivos — planilhas,
                contratos, PDFs, imagens. O agente lê, entende e devolve o
                trabalho pronto.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 pt-2">
              {CONNECTORS.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600"
                >
                  {c}
                </span>
              ))}
              <span className="rounded-full border border-dashed border-neutral-300 px-4 py-2 text-sm text-neutral-400">
                + centenas de ferramentas
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Segurança e controle ──────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <SectionKicker>Confiança</SectionKicker>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Segurança, histórico, uso e controle
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CONTROLS.map((c) => (
              <div key={c.title} className="rounded-2xl border border-neutral-200 p-6">
                <h3 className="font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{c.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final: o mesmo gesto ──────────────────────────────────── */}
      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Delegue sua primeira tarefa
          </h2>
          <p className="mt-3 text-neutral-500">
            Leva menos de um minuto — e o seu funcionário digital começa agora.
          </p>
        </div>
        <div className="mt-8">
          <DelegationInput compact />
        </div>
      </section>
    </>
  );
}
