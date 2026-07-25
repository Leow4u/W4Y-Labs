"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Docs sidebar (desktop) and collapsible menu (mobile). Receives plain data —
// the registry itself stays server-side.
export interface NavItem {
  slug: string;
  nav: string;
  category: string;
}

export default function DocsNav({
  categories,
  items,
}: {
  categories: readonly string[];
  items: NavItem[];
}) {
  const pathname = usePathname();

  const list = (
    <nav className="space-y-6">
      {categories.map((cat) => (
        <div key={cat}>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            {cat}
          </p>
          <ul className="mt-2 space-y-0.5">
            {items
              .filter((i) => i.category === cat)
              .map((i) => {
                const href = `/documentacao/${i.slug}`;
                const active = pathname === href;
                return (
                  <li key={i.slug}>
                    <Link
                      href={href}
                      className={`block rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors ${
                        active
                          ? "bg-salvia-soft font-medium text-mata-deep"
                          : "text-ink-soft hover:bg-paper-deep hover:text-ink"
                      }`}
                    >
                      {i.nav}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* mobile: collapsible menu above the article */}
      <details className="rounded-xl border border-line bg-paper-deep px-4 py-3 lg:hidden">
        <summary className="cursor-pointer select-none text-sm font-semibold text-ink">
          Navegar na documentação
        </summary>
        <div className="pt-4">{list}</div>
      </details>
      {/* desktop: sticky sidebar */}
      <div className="hidden lg:block">{list}</div>
    </>
  );
}
