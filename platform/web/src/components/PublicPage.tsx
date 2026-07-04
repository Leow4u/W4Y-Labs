import Link from "next/link";

// Molde das páginas institucionais (/plataforma, /solucoes, ...): hero curto,
// grade de cards e CTA final apontando para o gesto de delegar na landing.
export interface PublicPageCard {
  title: string;
  copy: string;
}

export default function PublicPage({
  kicker,
  title,
  intro,
  cards,
  note,
}: {
  kicker: string;
  title: string;
  intro: string;
  cards: PublicPageCard[];
  note?: string;
}) {
  return (
    <>
      <section className="px-6 pb-14 pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-brand text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            {kicker}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-neutral-900">{title}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-neutral-500">{intro}</p>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div key={c.title} className="rounded-2xl border border-neutral-200 p-7">
              <h2 className="font-semibold">{c.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">{c.copy}</p>
            </div>
          ))}
        </div>
        {note && (
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-neutral-400">{note}</p>
        )}
      </section>

      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Pronto para delegar?</h2>
          <p className="mt-2 text-neutral-500">
            Descreva a primeira tarefa e veja o seu funcionário digital em ação.
          </p>
          <Link
            href="/"
            className="font-brand mt-6 inline-block rounded-full bg-neutral-900 px-7 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-85"
          >
            Delegar uma tarefa →
          </Link>
        </div>
      </section>
    </>
  );
}
