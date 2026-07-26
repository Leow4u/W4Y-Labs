import Link from "next/link";
import CoverArt from "@/components/CoverArt";
import { POSTS as POSTS_PT } from "./posts";
import { POSTS as POSTS_EN } from "./posts.en";
import { getSiteLocale } from "@/lib/site-locale";

export const metadata = {
  title: "Blog — Work4You",
  description:
    "Novidades do produto, bastidores e boas práticas de quem coloca agentes pra trabalhar.",
};

const T = {
  pt: {
    eyebrow: "Blog",
    h1: "Novidades e bastidores",
    lead: "O que estamos construindo, por que estamos construindo — e boas práticas de quem coloca agentes pra trabalhar.",
    read: "Ler o post →",
    minutes: "min de leitura",
  },
  en: {
    eyebrow: "Blog",
    h1: "News and behind the scenes",
    lead: "What we're building, why we're building it — and best practices from people putting agents to work.",
    read: "Read the post →",
    minutes: "min read",
  },
} as const;

// Blog index: featured (latest) post + grid with the rest (locale-aware).
export default async function BlogIndexPage() {
  const locale = await getSiteLocale();
  const POSTS = locale === "en" ? POSTS_EN : POSTS_PT;
  const t = T[locale];
  const [featured, ...rest] = POSTS;

  return (
    <div className="px-6">
      <div className="mx-auto max-w-4xl py-14">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
          {t.eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance]">
          {t.h1}
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">{t.lead}</p>

        {featured && (
          <Link
            href={`/blog/${featured.slug}`}
            className="group mt-10 grid overflow-hidden rounded-3xl border border-line bg-cream transition-colors hover:border-salvia sm:grid-cols-[1.15fr_1fr]"
          >
            <div className="relative aspect-[16/9] overflow-hidden sm:order-last sm:aspect-auto sm:min-h-full">
              <CoverArt
                seed={featured.slug}
                className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.02]"
              />
            </div>
            <div className="p-8 sm:p-10">
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
              <p className="mt-5 text-sm font-semibold text-mata">{t.read}</p>
            </div>
          </Link>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {rest.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-paper transition-colors hover:border-salvia hover:bg-paper-deep"
            >
              <div className="relative aspect-[16/9] overflow-hidden">
                <CoverArt
                  seed={p.slug}
                  className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="flex flex-1 flex-col p-6">
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
                  {p.readingMinutes} {t.minutes}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
