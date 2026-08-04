import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS as DOCS_PT, docBySlug } from "../docs";
import { DOCS as DOCS_EN, docBySlug as docBySlugEn } from "../docs.en";
import { getSiteLocale } from "@/lib/site-locale";
import Icon, { type SiteIconName } from "@/components/site-icons";

const ICON_BY_SLUG: Record<string, SiteIconName> = {
  "o-que-e": "sparkle",
  "primeiros-passos": "rocket",
  "planos-e-creditos": "coins",
  "tarefas-e-sessoes": "chat",
  projetos: "folder",
  automacoes: "calendar",
  artefatos: "file",
  personalizar: "grid",
  skills: "compass",
  canais: "broadcast",
  conectores: "plug",
  plataformas: "monitor",
};

export function generateStaticParams() {
  return DOCS_PT.map((d) => ({ slug: d.slug }));
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

const T = {
  pt: { prev: "← Anterior", next: "Próximo →" },
  en: { prev: "← Previous", next: "Next →" },
} as const;

// One doc article (locale-aware registry): eyebrow, title, lead, body, prev/next.
export default async function DocArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getSiteLocale();
  const DOCS = locale === "en" ? DOCS_EN : DOCS_PT;
  const doc = locale === "en" ? docBySlugEn(slug) : docBySlug(slug);
  if (!doc) notFound();
  const t = T[locale];

  const idx = DOCS.findIndex((d) => d.slug === doc.slug);
  const prev = idx > 0 ? DOCS[idx - 1] : null;
  const next = idx < DOCS.length - 1 ? DOCS[idx + 1] : null;

  return (
    <article className="max-w-[46rem]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-salvia-soft text-mata">
          <Icon name={ICON_BY_SLUG[doc.slug] ?? "book"} className="h-5 w-5" />
        </span>
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
          {doc.category}
        </p>
      </div>
      <h1 className="mt-4 text-[2.1rem] font-extrabold leading-tight tracking-[-0.02em] text-ink [text-wrap:balance]">
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
              {t.prev}
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
              {t.next}
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">{next.title}</p>
          </Link>
        )}
      </nav>
    </article>
  );
}
