import Image from "next/image";
import Link from "next/link";
import HeroDemo from "@/components/HeroDemo";
import DelegationInput from "@/components/DelegationInput";

// Work4You landing — new architecture, benchmark-informed:
// centered display hero with the LIVE product window bleeding into the fold,
// alternating text-rail × product-frame sections, one dark statement canvas,
// editorial meta-cards, the 24/7 forest section, final CTA.
// Narrative order from the site brief: build → talk & execute → run 24/7.

const CONNECTORS = [
  "Gmail", "Google Drive", "Planilhas", "Notion", "Slack",
  "WhatsApp", "CRM", "Calendário", "E-mail", "Pastas locais",
];

export default function LandingPage() {
  return (
    <>
      {/* ── S1 · Hero: quiet two-tone statement, product as the star ── */}
      <section className="px-6 pb-20 pt-20 md:pt-28">
        <div className="mx-auto max-w-6xl">
          <h1 className="max-w-3xl text-3xl font-bold leading-[1.18] tracking-[-0.02em] md:text-[2.6rem]">
            <span className="text-ink">Construa o seu agente de IA.</span>{" "}
            <span className="font-semibold text-ink-faint">
              Coloque ele pra rodar{" "}
              <span className="whitespace-nowrap text-mata">24/7</span> —
              conversa, executa e continua depois que você sai.
            </span>
          </h1>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link
              href="/login"
              className="rounded-full bg-mata px-6 py-3 text-[15px] font-semibold text-paper transition-colors hover:bg-mata-deep"
            >
              Construir meu agente
            </Link>
            <Link
              href="/plataforma"
              className="text-[15px] font-semibold text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              Ver como funciona →
            </Link>
          </div>
        </div>

        {/* the product, floating over the landscape (Unsplash, free license) */}
        <div className="relative mx-auto mt-14 max-w-6xl overflow-hidden rounded-[2rem]">
          <Image
            src="/media/hero-hills.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="relative px-4 py-10 sm:px-10 sm:py-16">
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* ── S2 · Connector tiles ────────────────────────────────────── */}
      <section className="border-t border-line px-6 py-14">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-sm text-ink-faint">
            Fala com as ferramentas que você já usa
          </p>
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-5">
            {CONNECTORS.map((c) => (
              <div
                key={c}
                className="flex h-16 items-center justify-center bg-paper text-[15px] font-semibold text-ink-soft"
              >
                {c}
              </div>
            ))}
          </div>
          <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">
            + centenas de conectores
          </p>
        </div>
      </section>

      {/* ── S3 · Statement canvas ───────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-mata-deep px-8 py-20 text-center md:px-16 md:py-28">
          <h2 className="mx-auto max-w-3xl text-3xl font-extrabold leading-[1.15] tracking-[-0.02em] text-paper [text-wrap:balance] md:text-5xl">
            Chat responde.{" "}
            <span className="underline decoration-salvia decoration-4 underline-offset-8">
              O seu agente executa
            </span>{" "}
            — e continua depois que você sai.
          </h2>
          <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-paper/70">
            Aqui você não usa um “agente pronto” de marketing. Você constrói um
            de verdade — foco, estilo, ferramentas, modelo — e deixa ele ligado.
          </p>
        </div>
      </section>

      {/* ── S4 · Build: text rail × Studio frame ────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
              01 · Construa
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-ink md:text-4xl">
              Do zero ao seu agente{" "}
              <span className="text-ink-faint">em minutos, não semanas.</span>
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-ink-soft">
              Diga o foco, o estilo, as ferramentas e o modelo. Construa um.
              Construa vários no Agent Studio — independentes, que se consultam
              e trabalham juntos quando a tarefa pede.
            </p>
            <Link
              href="/modelos"
              className="mt-7 inline-block text-[15px] font-semibold text-mata underline-offset-4 hover:underline"
            >
              Conhecer o Agent Studio →
            </Link>
          </div>

          {/* Studio frame over the misty pines */}
          <div className="relative overflow-hidden rounded-3xl p-4 sm:p-8">
            <Image
              src="/media/studio-mist.jpg"
              alt=""
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="object-cover"
            />
            <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_80px_-40px_rgba(41,51,31,0.35)]">
              <div className="flex items-center gap-2 border-b border-line bg-paper px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
                <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                  Agent Studio
                </span>
              </div>
              {[
                { name: "Agente principal", focus: "Coordena, delega e entrega", model: "modelo à sua escolha", on: true },
                { name: "Vendas", focus: "Leads, propostas e follow-ups", model: "foco próprio", on: true },
                { name: "Financeiro", focus: "Cobranças e conciliação", model: "rotinas 24/7", on: true },
                { name: "Atendimento", focus: "Respostas no tom da empresa", model: "em construção", on: false },
              ].map((a, i) => (
                <div
                  key={a.name}
                  className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${a.on ? "w4y-live-dot bg-salvia" : "bg-line"}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{a.name}</p>
                    <p className="truncate text-[13px] text-ink-soft">{a.focus}</p>
                  </div>
                  <span className="ml-auto hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint sm:block">
                    {a.model}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                      a.on ? "bg-salvia-soft text-mata" : "bg-paper text-ink-faint"
                    }`}
                  >
                    {a.on ? "no ar" : "pausado"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── S5 · Editorial capability cards ─────────────────────────── */}
      <section className="border-t border-line px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
            02 · Use
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-ink md:text-4xl">
            Conversa e executa — de verdade
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {[
              {
                title: "Age nas suas coisas",
                copy: "Lê pastas, escreve documentos, mexe em planilhas, roda código — e devolve o trabalho pronto.",
                meta: [["Entrada", "chat, voz, rotina"], ["Saída", "docs, PDFs, ações"]],
              },
              {
                title: "Lembra do contexto",
                copy: "Memória entre sessões: o agente conhece o seu negócio, o seu tom e o que já foi decidido.",
                meta: [["Memória", "entre sessões"], ["Histórico", "cada decisão"]],
              },
              {
                title: "Modelo à sua escolha",
                copy: "Aceita o modelo de IA que você preferir — ou a sua própria API. Sem ficar preso a um fornecedor.",
                meta: [["Modelos", "os melhores do mercado"], ["API própria", "traga a sua"]],
              },
            ].map((c) => (
              <div key={c.title} className="rounded-2xl bg-cream p-7">
                <h3 className="text-xl font-bold text-ink">{c.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{c.copy}</p>
                <div className="mt-6 space-y-0">
                  {c.meta.map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between border-t border-ink/10 py-2.5"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                        {k}
                      </span>
                      <span className="text-[13px] font-medium text-ink-soft">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S6 · 24/7 — the dark forest (real one) ──────────────────── */}
      <section className="relative overflow-hidden bg-mata-deep px-6 py-24 text-paper">
        <Image
          src="/media/night-forest.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-mata-deep/70" />
        <div className="relative mx-auto max-w-6xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
                03 · Ligue o 24/7
              </p>
              <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight md:text-4xl">
                Depois de construído, ele não depende do seu notebook.
              </h2>
              <p className="mt-5 max-w-md leading-relaxed text-paper/70">
                Agenda, rotinas e trabalhos longos rodam na nuvem. Desktop e web
                são entradas — a nuvem é onde o seu agente fica ligado.
              </p>
              <Link
                href="/plataforma"
                className="mt-8 inline-block rounded-full bg-paper px-6 py-2.5 text-sm font-semibold text-mata-deep transition-opacity hover:opacity-90"
              >
                Conhecer a plataforma →
              </Link>
            </div>
            <div className="space-y-3">
              {[
                { when: "Toda manhã · 07h00", what: "Resumo dos e-mails e do que vence hoje" },
                { when: "Toda sexta · 17h00", what: "Cobranças e follow-ups da semana" },
                { when: "Ao chegar anexo novo", what: "Ler, classificar e arquivar na pasta certa" },
              ].map((r) => (
                <div
                  key={r.when}
                  className="flex items-center gap-4 rounded-2xl border border-paper/15 bg-paper/5 px-5 py-4"
                >
                  <span className="w4y-live-dot h-2 w-2 shrink-0 rounded-full bg-salvia" />
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-salvia">
                      {r.when}
                    </p>
                    <p className="mt-1 truncate text-sm text-paper/90">{r.what}</p>
                  </div>
                  <span className="ml-auto shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-paper/50">
                    no ar
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── S7 · Surfaces ───────────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-ink">
            Um produto. Várias entradas.
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
            {[
              {
                title: "Nuvem",
                copy: "Onde o agente roda 24/7 — rotinas, automações e trabalhos longos.",
                badge: "sempre ligada",
              },
              {
                title: "Desktop",
                copy: "Pastas locais, código, execução no seu PC — e ponte direta pra nuvem.",
                badge: "poder local",
              },
              {
                title: "Web",
                copy: "A mesma conversa e o mesmo agente, de qualquer navegador.",
                badge: "sempre à mão",
              },
            ].map((s) => (
              <div key={s.title} className="bg-paper p-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-salvia">
                  {s.badge}
                </p>
                <h3 className="mt-2 text-xl font-bold text-ink">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{s.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S8 · Trust hairlines ────────────────────────────────────── */}
      <section className="px-6 pb-8 pt-4">
        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Aprovação humana", copy: "Ações sensíveis esperam o seu OK." },
            { title: "Histórico completo", copy: "Cada tarefa e decisão registrada." },
            { title: "Controle de uso", copy: "Consumo e custo por agente." },
            { title: "Acesso por equipe", copy: "Cada pessoa vê o que deve ver." },
          ].map((c) => (
            <div key={c.title} className="border-t-2 border-ink pt-4">
              <h3 className="text-sm font-bold text-ink">{c.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{c.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── S9 · Final CTA ──────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance] md:text-5xl">
            Monte. Ligue. Ele continua.
          </h2>
          <p className="mt-5 text-lg text-ink-soft">
            Leva minutos — e o agente que você construiu começa a trabalhar.
          </p>
        </div>
        <div className="mt-10">
          <DelegationInput compact />
        </div>
      </section>
    </>
  );
}
