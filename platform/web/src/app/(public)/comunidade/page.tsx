import Link from "next/link";

export const metadata = { title: "Comunidade — Work4You" };

// Resource page scaffold — real content lands here next.
export default function Page() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
          Recursos
        </p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance]">
          Comunidade
        </h1>
        <p className="mt-4 leading-relaxed text-ink-soft">
          Quem constrói com a Work4You, no mesmo lugar — troque ideias, templates e resultados.
        </p>
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-cream px-8 py-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mata">Em breve</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Estamos preparando esta área. Enquanto isso, o seu agente já está
            pronto pra trabalhar.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-block rounded-full bg-mata px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-mata-deep"
          >
            Começar agora
          </Link>
        </div>
      </div>
    </section>
  );
}
