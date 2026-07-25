import Link from "next/link";
import { CATEGORIES as CATS_PT, DOCS as DOCS_PT } from "./docs";
import { CATEGORIES as CATS_EN, DOCS as DOCS_EN } from "./docs.en";
import { getSiteLocale } from "@/lib/site-locale";

export const metadata = {
  title: "Documentação — Work4You",
  description:
    "Tudo pra tirar o máximo do seu agente: primeiros passos, rotinas, canais, conectores e mais.",
};

const T = {
  pt: {
    eyebrow: "Documentação",
    h1: "Tire o máximo do seu agente",
    lead: "Do primeiro acesso às rotinas rodando 24/7 — guias curtos, direto ao ponto, do jeito que o produto funciona de verdade.",
  },
  en: {
    eyebrow: "Documentation",
    h1: "Get the most out of your agent",
    lead: "From first sign-in to routines running 24/7 — short guides, straight to the point, the way the product actually works.",
  },
} as const;

// Docs index: intro + pages grouped by category (locale-aware registry).
export default async function DocsIndexPage() {
  const locale = await getSiteLocale();
  const DOCS = locale === "en" ? DOCS_EN : DOCS_PT;
  const CATEGORIES = locale === "en" ? CATS_EN : CATS_PT;
  const t = T[locale];

  return (
    <div>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
        {t.eyebrow}
      </p>
      <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance]">
        {t.h1}
      </h1>
      <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">{t.lead}</p>

      <div className="mt-10 space-y-10">
        {CATEGORIES.map((cat) => (
          <section key={cat}>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              {cat}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {DOCS.filter((d) => d.category === cat).map((d) => (
                <Link
                  key={d.slug}
                  href={`/documentacao/${d.slug}`}
                  className="group rounded-2xl border border-line bg-paper p-5 transition-colors hover:border-salvia hover:bg-paper-deep"
                >
                  <p className="font-semibold text-ink group-hover:text-mata-deep">
                    {d.title}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                    {d.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
