import type { ReactNode } from "react";
import DocsNav from "./DocsNav";
import { CATEGORIES, DOCS } from "./docs";

// Shared docs shell: sticky sidebar on desktop, collapsible menu on mobile.
export default function DocsLayout({ children }: { children: ReactNode }) {
  const items = DOCS.map((d) => ({ slug: d.slug, nav: d.nav, category: d.category }));

  return (
    <div className="px-6">
      <div className="mx-auto grid max-w-6xl gap-8 py-10 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-14 lg:py-14">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <DocsNav categories={CATEGORIES} items={items} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
