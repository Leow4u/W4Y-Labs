import { useEffect } from "react";

/**
 * Closes a menu/popover on a click OUTSIDE it (or Esc) — via a GLOBAL
 * pointerdown listener on the document (capture phase).
 *
 * Why not just the `fixed inset-0` backdrop? /chat is mounted persistently
 * outside <Routes> with its own stacking context ABOVE z-40 — clicks on it
 * never reached the backdrop (feedback 09/07: "clicking anywhere on the
 * screen doesn't close the dropdown"). A document listener is immune to stacking.
 *
 * Mark the menu with data-menu-root={key} and the trigger button(s) with
 * data-menu-trigger={key} — pointerdown on them is ignored (the trigger's/
 * backdrop's own onClick handles the toggle, with no close-and-reopen race).
 */
export function useMenuDismiss(open: boolean, onClose: () => void, key: string) {
  useEffect(() => {
    if (!open) return;
    const sel = `[data-menu-root="${key}"],[data-menu-trigger="${key}"]`;
    const onDown = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(sel)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, key]);
}
