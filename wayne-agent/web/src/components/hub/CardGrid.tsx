/**
 * CardGrid — paginated 2-column grid (benchmark Manus): shows one "page" of N
 * cards at a time (everything on the same screen, not a row that scrolls
 * sideways), with ◀▶ arrows that paginate and an optional "Ver tudo". Only
 * renders the cards of the current page (cheap even with thousands of items).
 * The page resets when the set changes (search).
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

export function CardGrid<T>({
  title,
  count,
  seeAllLabel,
  onSeeAll,
  items,
  renderItem,
  pageSize = 8,
  gapClass = "gap-2.5",
}: {
  title?: React.ReactNode;
  count?: number;
  seeAllLabel?: string;
  onSeeAll?: () => void;
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  pageSize?: number;
  gapClass?: string;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [items.length]);

  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Math.min(page, pages - 1);
  const shown = items.slice(p * pageSize, p * pageSize + pageSize);
  const canPrev = p > 0;
  const canNext = p < pages - 1;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {title != null && (
          <h2 className="font-mondwest text-display text-xs tracking-[0.12em] text-text-secondary">
            {title}
            {typeof count === "number" ? (
              <span className="ml-1.5 text-text-tertiary">{count}</span>
            ) : null}
          </h2>
        )}
        <div className="ml-auto flex items-center gap-1">
          {onSeeAll && (
            <button
              type="button"
              onClick={onSeeAll}
              className="mr-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 type-ui text-muted-foreground transition-colors hover:text-foreground"
            >
              {seeAllLabel}
              <ExternalLink className="h-3 w-3 opacity-70" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setPage(p - 1)}
            disabled={!canPrev}
            aria-label="prev"
            className="grid h-7 w-7 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPage(p + 1)}
            disabled={!canNext}
            aria-label="next"
            className="grid h-7 w-7 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className={`grid ${gapClass} sm:grid-cols-2`}>
        {shown.map((item, i) => renderItem(item, p * pageSize + i))}
      </div>
    </section>
  );
}
