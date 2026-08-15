import Link from "next/link";
import { notFound } from "next/navigation";
import CoverArt from "@/components/CoverArt";
import { POSTS as POSTS_PT, postBySlug } from "../posts";
import { POSTS as POSTS_EN, postBySlug as postBySlugEn } from "../posts.en";
import { getSiteLocale } from "@/lib/site-locale";

export function generateStaticParams() {
  return POSTS_PT.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return { title: "Blog — Work4You" };
  return { title: `${post.title} — Blog Work4You`, description: post.description };
}

const T = {
  pt: {
    back: "← Blog",
    min: "min",
    ctaTitle: "Pronto pra colocar um agente pra trabalhar?",
    cta: "Começar agora →",
    more: "Mais do blog",
  },
  en: {
    back: "← Blog",
    min: "min",
    ctaTitle: "Ready to put an agent to work?",
    cta: "Get started",
    more: "More from the blog",
  },
} as const;

// One blog post (locale-aware registry): meta row, title, lead, body, footer.
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getSiteLocale();
  const POSTS = locale === "en" ? POSTS_EN : POSTS_PT;
  const post = locale === "en" ? postBySlugEn(slug) : postBySlug(slug);
  if (!post) notFound();
  const t = T[locale];

  const others = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <div className="px-6">
      <article className="mx-auto max-w-[46rem] py-14">
        <Link
          href="/blog"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-ink"
        >
          {t.back}
        </Link>
        <div className="mt-6 flex items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em]">
          <span className="rounded-full bg-salvia-soft px-2.5 py-1 text-mata">
            {post.category}
          </span>
          <time dateTime={post.dateISO} className="text-ink-faint">
            {post.date}
          </time>
          <span className="text-ink-faint">· {post.readingMinutes} {t.min}</span>
        </div>
        <div className="relative mt-6 aspect-[21/9] overflow-hidden rounded-3xl border border-line">
          <CoverArt seed={post.slug} className="absolute inset-0 h-full w-full" />
        </div>
        <h1 className="mt-8 text-[2.3rem] font-extrabold leading-tight tracking-[-0.02em] text-ink [text-wrap:balance]">
          {post.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          {post.description}
        </p>
        <div className="mt-2 border-b border-line pb-2" />

        {post.body}

        <div className="mt-14 rounded-2xl border border-line bg-cream px-7 py-6 text-center">
          <p className="font-semibold text-ink">{t.ctaTitle}</p>
          <Link
            href="/login"
            className="mt-3 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-black"
          >
            {t.cta}
          </Link>
        </div>

        {others.length > 0 && (
          <nav className="mt-12 border-t border-line pt-8">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              {t.more}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {others.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="flex items-center gap-4 rounded-2xl border border-line p-4 pr-5 transition-colors hover:border-salvia hover:bg-paper-deep"
                >
                  <div className="relative h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-xl">
                    <CoverArt
                      seed={p.slug}
                      className="absolute inset-0 h-full w-full"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mata">
                      {p.category}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-ink">
                      {p.title}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </nav>
        )}
      </article>
    </div>
  );
}
