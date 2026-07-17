/**
 * CardRow — horizontal scrollable strip of cards (Manus benchmark): header with
 * title + ◀▶ arrows (they enable/disable at the ends) + optional "Ver tudo",
 * and a track with scroll-snap. Generic: takes the cards as children (each one
 * must be `shrink-0` with a fixed width). Reuses the horizontal scroll pattern
 * that was already loose in the app (overflow-x-auto), only adding the arrow control.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

export function CardRow({
  title,
  count,
  seeAllLabel,
  onSeeAll,
  fade,
  children,
}: {
  title?: React.ReactNode;
  count?: number;
  seeAllLabel?: string;
  onSeeAll?: () => void;
  /** Fades the edges of what runs off screen (Manus style: ~2.5 cards). */
  fade?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanL(el.scrollLeft > 4);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  // Re-checks when the content changes (search filters the cards).
  useEffect(() => {
    update();
  });

  const scrollByDir = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

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
            onClick={() => scrollByDir(-1)}
            disabled={!canL}
            aria-label="scroll left"
            className="grid h-7 w-7 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByDir(1)}
            disabled={!canR}
            aria-label="scroll right"
            className="grid h-7 w-7 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={ref}
        className="flex gap-2.5 overflow-x-auto scroll-smooth snap-x pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={
          fade
            ? (() => {
                const g = `linear-gradient(to right, ${canL ? "transparent" : "#000"} 0, #000 4%, #000 90%, ${canR ? "transparent" : "#000"} 100%)`;
                return { maskImage: g, WebkitMaskImage: g };
              })()
            : undefined
        }
      >
        {children}
      </div>
    </section>
  );
}
