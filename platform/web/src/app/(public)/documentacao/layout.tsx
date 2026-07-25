import type { ReactNode } from "react";
import DocsNav from "./DocsNav";
import { CATEGORIES as CATS_PT, DOCS as DOCS_PT } from "./docs";
import { CATEGORIES as CATS_EN, DOCS as DOCS_EN } from "./docs.en";
import { getSiteLocale } from "@/lib/site-locale";

// Shared docs shell: sticky sidebar on desktop, collapsible menu on mobile.
// Registry (pt or en mirror) is picked by the site locale cookie.
export default async function DocsLayout({ children }: { children: ReactNode }) {
  const locale = await getSiteLocale();
  const DOCS = locale === "en" ? DOCS_EN : DOCS_PT;
  const CATEGORIES = locale === "en" ? CATS_EN : CATS_PT;
  const items = DOCS.map((d) => ({ slug: d.slug, nav: d.nav, category: d.category }));

  return (
    <div className="px-6">
      <div className="mx-auto grid max-w-6xl gap-8 py-10 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-14 lg:py-14">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <DocsNav
            categories={CATEGORIES}
            items={items}
            menuLabel={locale === "en" ? "Browse the docs" : "Navegar na documentação"}
          />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
