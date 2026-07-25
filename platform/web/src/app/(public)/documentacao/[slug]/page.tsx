import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, docBySlug } from "../docs";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = docBySlug(slug);
  if (!doc) return { title: "Documentação — Work4You" };
  return { title: `${doc.title} — Documentação Work4You`, description: doc.description };
}

// One doc article: category eyebrow, title, lead, body, prev/next.
export default async function DocArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = docBySlug(slug);
  if (!doc) notFound();

  const idx = DOCS.findIndex((d) => d.slug === doc.slug);
  const prev = idx > 0 ? DOCS[idx - 1] : null;
  const next = idx < DOCS.length - 1 ? DOCS[idx + 1] : null;

  return (
    <article className="max-w-[46rem]">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
        {doc.category}
      </p>
      <h1 className="mt-3 text-[2.1rem] font-extrabold leading-tight tracking-[-0.02em] text-ink [text-wrap:balance]">
        {doc.title}
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-ink-soft">{doc.description}</p>

      <div className="mt-2 border-b border-line pb-2" />

      {doc.body}

      <nav className="mt-14 flex gap-3 border-t border-line pt-6">
        {prev && (
          <Link
            href={`/documentacao/${prev.slug}`}
            className="flex-1 rounded-2xl border border-line p-4 transition-colors hover:border-salvia hover:bg-paper-deep"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              ← Anterior
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">{prev.title}</p>
          </Link>
        )}
        {next && (
          <Link
            href={`/documentacao/${next.slug}`}
            className="flex-1 rounded-2xl border border-line p-4 text-right transition-colors hover:border-salvia hover:bg-paper-deep"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              Próximo →
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">{next.title}</p>
          </Link>
        )}
      </nav>
    </article>
  );
}
