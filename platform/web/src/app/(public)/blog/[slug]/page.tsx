import Link from "next/link";
import { notFound } from "next/navigation";
import { POSTS, postBySlug } from "../posts";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
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

// One blog post: meta row, title, lead, body, more-posts footer.
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();

  const others = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <div className="px-6">
      <article className="mx-auto max-w-[46rem] py-14">
        <Link
          href="/blog"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-ink"
        >
          ← Blog
        </Link>
        <div className="mt-6 flex items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em]">
          <span className="rounded-full bg-salvia-soft px-2.5 py-1 text-mata">
            {post.category}
          </span>
          <time dateTime={post.dateISO} className="text-ink-faint">
            {post.date}
          </time>
          <span className="text-ink-faint">· {post.readingMinutes} min</span>
        </div>
        <h1 className="mt-4 text-[2.3rem] font-extrabold leading-tight tracking-[-0.02em] text-ink [text-wrap:balance]">
          {post.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          {post.description}
        </p>
        <div className="mt-2 border-b border-line pb-2" />

        {post.body}

        <div className="mt-14 rounded-2xl border border-line bg-cream px-7 py-6 text-center">
          <p className="font-semibold text-ink">
            Pronto pra colocar um agente pra trabalhar?
          </p>
          <Link
            href="/login"
            className="mt-3 inline-block rounded-full bg-mata px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-mata-deep"
          >
            Construir meu agente
          </Link>
        </div>

        {others.length > 0 && (
          <nav className="mt-12 border-t border-line pt-8">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              Mais do blog
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {others.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="rounded-2xl border border-line p-5 transition-colors hover:border-salvia hover:bg-paper-deep"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mata">
                    {p.category}
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-ink">
                    {p.title}
                  </p>
                </Link>
              ))}
            </div>
          </nav>
        )}
      </article>
    </div>
  );
}
