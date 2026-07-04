import Link from "next/link";

export const metadata = { title: "Preços — Work4You" };

// Página de preços do MVP: três degraus simples, cobrança final ainda em
// definição — sem valores inventados, com convite ao acesso inicial.
const PLANS = [
  {
    name: "Começar",
    tagline: "Para delegar as primeiras tarefas",
    features: ["1 funcionário digital", "Chat e arquivos", "Rotinas básicas", "Histórico de 30 dias"],
    cta: "Começar agora",
    highlight: false,
  },
  {
    name: "Equipe",
    tagline: "Para áreas inteiras trabalhando com agentes",
    features: [
      "Vários agentes por área",
      "Conectores com suas ferramentas",
      "Rotinas ilimitadas",
      "Aprovação humana e controle de uso",
    ],
    cta: "Falar com a gente",
    highlight: true,
  },
  {
    name: "Empresa",
    tagline: "Para operações com requisitos próprios",
    features: ["Ambiente dedicado", "Acessos por equipe", "Suporte próximo", "Volume sob medida"],
    cta: "Falar com a gente",
    highlight: false,
  },
];

export default function PrecosPage() {
  return (
    <>
      <section className="px-6 pb-14 pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-brand text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Preços
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">
            Simples como contratar
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-neutral-500">
            Planos por tamanho de operação. Valores do acesso inicial são
            combinados com o nosso time — sem surpresa na fatura.
          </p>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`flex flex-col rounded-2xl border p-7 ${
                p.highlight
                  ? "border-neutral-900 shadow-[0_16px_50px_-20px_rgba(0,0,0,0.25)]"
                  : "border-neutral-200"
              }`}
            >
              <h2 className="font-brand text-lg font-semibold">{p.name}</h2>
              <p className="mt-1 text-sm text-neutral-500">{p.tagline}</p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-neutral-600">
                    <span className="text-neutral-400">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className={`font-brand mt-7 rounded-full px-5 py-2.5 text-center text-sm font-semibold transition-colors ${
                  p.highlight
                    ? "bg-neutral-900 text-white hover:opacity-85"
                    : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
                }`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
