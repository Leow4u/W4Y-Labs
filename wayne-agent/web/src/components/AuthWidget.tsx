/**
 * AuthWidget — user chip at the sidebar footer (Work4You UX).
 *
 * Shows the user's initials + display name and, on click, opens a menu
 * (upwards, via portal — not clipped by the sidebar) with:
 *   - "Configurações"   → opens the Config screen as an overlay (onOpenSettings)
 *   - "Idioma"          → item with a side submenu on hover (Claude style);
 *                         reuses the i18n primitives (useI18n + LOCALE_META)
 *   - "Sair"            → POST /auth/logout + navigation to /login
 *
 * The theme moved out of here and into Config → Appearance.
 *
 * Reuses /api/auth/me (Phase 7 of the OAuth dashboard). On loopback/--insecure
 * /api/auth/me answers 401/403 and the widget renders nothing. The tenant's
 * "plan" does NOT show up here yet (it lives in the platform, not in the Wayne
 * instance — that is Onda 2 of this reorganization).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type AuthMeResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LogOut, Settings, ChevronUp, ChevronRight, Globe, Check, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { LOCALE_META } from "@/i18n";
import type { Locale } from "@/i18n";

interface AuthWidgetProps {
  className?: string;
  /** Opens the Config screen as an overlay (mounted in App). */
  onOpenSettings?: () => void;
}

function truncateUserId(id: string): string {
  return id.length <= 14 ? id : `${id.slice(0, 14)}…`;
}

/** Avatar initials: first letters of the label's first two "words"
 *  (split on non-alphanumerics), uppercased. */
function initialsOf(label: string): string {
  const parts = label.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "•";
}

export function AuthWidget({ className, onOpenSettings }: AuthWidgetProps) {
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const { locale, setLocale } = useI18n();
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const langListRef = useRef<HTMLDivElement>(null);

  // Opens the language submenu with the current language in view. Runs ONLY on
  // open (not on every render): an inline callback ref would re-run on
  // re-renders and undo the user's manual scrolling mid-gesture.
  useEffect(() => {
    if (!langOpen) return;
    langListRef.current
      ?.querySelector('[aria-checked="true"]')
      ?.scrollIntoView({ block: "center" });
  }, [langOpen]);

  useEffect(() => {
    let cancelled = false;
    api
      .getAuthMe()
      .then((data) => { if (!cancelled) setMe(data); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("401:") || msg.startsWith("403:")) { setHidden(true); return; }
        setError("auth status unavailable");
      });
    return () => { cancelled = true; };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setLangOpen(false);
  }, []);

  // Closes on Escape and on outside click (same pattern as ThemeSwitcher).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (chipRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  if (hidden) return null;

  if (error) {
    return (
      <div className={cn("px-5 py-2 text-[0.65rem] tracking-[0.05em] text-muted-foreground/70", className)}>
        {error}
      </div>
    );
  }

  if (!me) {
    return (
      <div className={cn("h-11 px-5 py-2 text-[0.65rem] text-muted-foreground/40", className)} aria-busy="true">
        …
      </div>
    );
  }

  const label = me.display_name || me.email || truncateUserId(me.user_id);
  const initials = initialsOf(label);

  const menuRow =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground/90 " +
    "transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:bg-current/10";

  return (
    <div className={cn("relative border-t border-current/10", className)}>
      <button
        ref={chipRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-2.5 text-left",
          "transition-colors hover:bg-current/5",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40 focus-visible:ring-inset",
        )}
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-midground/15 font-mono text-[0.7rem] font-semibold text-foreground/90"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90" title={me.user_id}>
          {label}
        </span>
        <ChevronUp className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform", !open && "rotate-180")} />
      </button>

      {open && (() => {
        const rect = chipRef.current?.getBoundingClientRect();
        const menu = (
          <div
            ref={menuRef}
            role="menu"
            className={cn(
              "fixed z-[100] min-w-[220px]",
              "border border-current/20 bg-background-base/95",
              "shadow-pop",
            )}
            style={rect ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width } : undefined}
          >
            <button
              type="button"
              role="menuitem"
              className={menuRow}
              onClick={() => { close(); onOpenSettings?.(); }}
            >
              <Settings className="h-4 w-4 shrink-0 text-muted-foreground/80" />
              Configurações
            </button>

            {/* "Idioma" — item with a side submenu on hover (Claude style).
                The flyout is a child of the wrapper and sticks to it via padding
                (pl-1.5), no real gap: the mouse never "leaves" the wrapper on
                the way across. Click toggles too (touch screens, no hover). */}
            <div
              role="none"
              className="relative border-t border-current/10"
              onMouseEnter={() => setLangOpen(true)}
              onMouseLeave={() => setLangOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={langOpen}
                className={menuRow}
                onClick={() => setLangOpen((v) => !v)}
              >
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground/80" />
                Idioma
                <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              </button>

              {langOpen && (
                <div
                  role="none"
                  className={cn(
                    "absolute bottom-0 left-full pl-1.5",
                    // On narrow screens (sidebar nearly full-width) there is no
                    // room on the right: opens ABOVE the menu, right-aligned.
                    "max-sm:bottom-full max-sm:left-auto max-sm:right-0 max-sm:pb-1 max-sm:pl-0",
                  )}
                >
                  <div
                    ref={langListRef}
                    role="menu"
                    aria-label="Idioma"
                    className={cn(
                      "max-h-[min(24rem,70vh)] min-w-[11rem] overflow-y-auto py-1",
                      "border border-current/20 bg-background-base/95",
                      "shadow-pop",
                    )}
                  >
                    {(Object.entries(LOCALE_META) as Array<[Locale, (typeof LOCALE_META)[Locale]]>).map(
                      ([code, meta]) => (
                        <button
                          key={code}
                          type="button"
                          role="menuitemradio"
                          aria-checked={code === locale}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                            "transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:bg-current/10",
                            code === locale ? "font-semibold text-foreground" : "text-muted-foreground",
                          )}
                          onClick={() => { setLocale(code); close(); }}
                        >
                          <span className="truncate">{meta.name}</span>
                          {code === locale && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-midground" />}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* "Atualizar plano" → deep-link to the subscription page in the shell
                (same work4you.ai origin; the LB routes /planos to Next).
                Full-page navigation (leaves the agent SPA) — intentional. */}
            <a
              href="/planos"
              role="menuitem"
              className={cn(menuRow, "border-t border-current/10")}
              onClick={() => close()}
            >
              <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground/80" />
              Atualizar plano
            </a>

            <button
              type="button"
              role="menuitem"
              className={cn(menuRow, "border-t border-current/10 text-destructive/90 hover:text-destructive")}
              onClick={() => { close(); void api.logout(); }}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sair
            </button>
          </div>
        );
        return createPortal(menu, document.body);
      })()}
    </div>
  );
}
