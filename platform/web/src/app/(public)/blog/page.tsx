import Link from "next/link";
import { POSTS } from "./posts";

export const metadata = {
  title: "Blog — Work4You",
  description:
    "Novidades do produto, bastidores e boas práticas de quem coloca agentes pra trabalhar.",
};

// Blog index: featured (latest) post + grid with the rest.
export default function BlogIndexPage() {
  const [featured, ...rest] = POSTS;

  return (
    <div className="px-6">
      <div className="mx-auto max-w-4xl py-14">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
          Blog
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance]">
          Novidades e bastidores
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">
          O que estamos construindo, por que estamos construindo — e boas práticas
          de quem coloca agentes pra trabalhar.
        </p>

        {featured && (
          <Link
            href={`/blog/${featured.slug}`}
            className="group mt-10 block rounded-3xl border border-line bg-cream p-8 transition-colors hover:border-salvia sm:p-10"
          >
            <div className="flex items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-mata">
              <span className="rounded-full bg-salvia-soft px-2.5 py-1">
                {featured.category}
              </span>
              <span className="text-ink-faint">{featured.date}</span>
            </div>
            <h2 className="mt-4 max-w-xl text-2xl font-extrabold tracking-[-0.01em] text-ink [text-wrap:balance] group-hover:text-mata-deep sm:text-3xl">
              {featured.title}
            </h2>
            <p className="mt-3 max-w-xl leading-relaxed text-ink-soft">
              {featured.description}
            </p>
            <p className="mt-5 text-sm font-semibold text-mata">
              Ler o post →
            </p>
          </Link>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {rest.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="group flex flex-col rounded-2xl border border-line bg-paper p-6 transition-colors hover:border-salvia hover:bg-paper-deep"
            >
              <div className="flex items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em]">
                <span className="rounded-full bg-salvia-soft px-2.5 py-1 text-mata">
                  {p.category}
                </span>
                <span className="text-ink-faint">{p.date}</span>
              </div>
              <h2 className="mt-3 text-lg font-bold tracking-[-0.01em] text-ink group-hover:text-mata-deep">
                {p.title}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">
                {p.description}
              </p>
              <p className="mt-4 font-mono text-[11px] text-ink-faint">
                {p.readingMinutes} min de leitura
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
