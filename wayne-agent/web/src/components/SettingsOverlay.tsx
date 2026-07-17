/**
 * SettingsOverlay — Config as an overlay screen (Manus/Claude style).
 *
 * Opened from the user chip menu (AuthWidget). By default it shows the user's
 * LEAN screen (ConfigUser — only General/Appearance/Memory, the Bloco 2
 * curation). The full technical config.yaml screen (ConfigPage) sits behind the
 * internal `?full=1` hatch, for us/support.
 *
 * Both inject their action bar (Save etc.) via usePageHeader().setEnd — that is
 * why the body is wrapped in a FRESH PageHeaderProvider in here (the bar is
 * rendered inside the overlay, not on the background page). The provider's title
 * is blanked out; the title + the X live in the overlay's own bar.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ConfigPage from "@/pages/ConfigPage";
import ConfigUser from "@/components/ConfigUser";
import { PageHeaderProvider } from "@/contexts/PageHeaderProvider";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/** Internal hatch (us/support): `?full=1` in the URL shows the full technical
 *  config.yaml screen instead of the user's lean screen. */
export function isFullConfigRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("full") === "1";
  } catch {
    return false;
  }
}

/** Blanks the nested provider's bar title — the overlay already has its own.
 *  (setTitle("") beats the current route's defaultTitle, which would be "Chat" etc.) */
function BlankProviderTitle() {
  const { setTitle } = usePageHeader();
  useEffect(() => {
    setTitle("");
    return () => setTitle(null);
  }, [setTitle]);
  return null;
}

export function SettingsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Locks the background scroll while the overlay is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const full = isFullConfigRequested();
  const title = t.configUser.title;
  const closeLabel = t.common.close;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3">
      {/* Dimmed backdrop — click closes. */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal card, centered (Manus/Claude style). Nearly full height (sits
          close to the browser's top and bottom — only ~0.75rem of slack on each
          side, matched to the overlay's p-3). Short content leaves space, long
          content scrolls. `settings-modal` turns on the internal Title Case
          (see index.css) to soften the design system's UPPERCASE. */}
      <div
        className={cn(
          // Settings width from the Hermes desktop (feedback 10/07: "tela
          // apertada") — nearly the whole window, capped at 1180px.
          "settings-modal relative flex w-[min(1180px,calc(100vw-1.5rem))] flex-col",
          "h-[calc(100vh-1.5rem)] overflow-hidden rounded-2xl",
          "border border-border bg-background-base",
          "shadow-pop",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* No title bar (Claude style): the X floats in the corner and the
            search sits at the top of the menu (inside ConfigUser). */}
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          title={closeLabel}
          className={cn(
            "absolute right-3 top-3 z-10 grid h-8 w-8 shrink-0 place-items-center rounded",
            "text-muted-foreground/80 transition-colors hover:bg-current/10 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40",
          )}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Body: lean screen (default) or technical (`?full=1`), scrolling
            inside the card. `flex flex-col` is essential: it creates the flex
            context that bounds the content's height (otherwise it expands to
            its natural height and overflows the modal). `pt-12` reserves a band
            at the top: it avoids "squashed" content and keeps the X (top-right
            corner) clear, not sitting behind the Skills screen's "Criar". */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-12">
          <PageHeaderProvider pluginTabs={[]}>
            <BlankProviderTitle />
            {full ? <ConfigPage /> : <ConfigUser />}
          </PageHeaderProvider>
        </div>
      </div>
    </div>,
    document.body,
  );
}
