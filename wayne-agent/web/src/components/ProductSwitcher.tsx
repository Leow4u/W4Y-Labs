/**
 * ProductSwitcher — the "Work4You ⌄" chip at the top of the sidebar (0.3.7,
 * faithful to the Codex Desktop reference print: a product chip where the
 * logo square used to sit). DESKTOP ONLY — App gates it on isDesktopApp();
 * the plain web keeps the brand lockup it always had.
 *
 * Dropdown: Work4You (current, check) and Code4You with a small "em breve"
 * badge — disabled by design (default cursor, no action): the entry exists
 * to announce the product line, not to promise a screen that doesn't exist.
 */

import { useCallback, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";

const MENU_KEY = "w4y-product-switcher";

export function ProductSwitcher() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useMenuDismiss(open, close, MENU_KEY);

  return (
    <div className="relative">
      <button
        type="button"
        data-menu-trigger={MENU_KEY}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.desktop.productSwitcher}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 rounded px-1.5 py-0.5",
          "font-mono text-[15px] font-bold text-foreground transition-colors",
          "hover:bg-current/5 hover:text-midground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground",
        )}
      >
        <span className="tracking-tight">Work4You</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          data-menu-root={MENU_KEY}
          className={cn(
            "absolute left-0 top-full z-[100] mt-1 min-w-[200px] py-1",
            "border border-current/20 bg-background-base/95 shadow-pop",
          )}
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked="true"
            onClick={close}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs",
              "font-semibold text-foreground transition-colors",
              "hover:bg-current/10 focus-visible:outline-none focus-visible:bg-current/10",
            )}
          >
            <span className="truncate">Work4You</span>
            <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-midground" />
          </button>
          <div
            role="menuitemradio"
            aria-checked="false"
            aria-disabled="true"
            className="flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-left font-mono text-xs text-text-disabled"
          >
            <span className="truncate">Code4You</span>
            <span className="ml-auto shrink-0 rounded-full bg-current/10 px-1.5 py-px font-sans text-[0.625rem] leading-4 text-muted-foreground">
              {t.desktop.productCode4YouSoon}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
