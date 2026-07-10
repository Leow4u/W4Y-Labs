import { useEffect } from "react";

/**
 * Fecha um menu/popover ao clicar FORA dele (ou Esc) — via listener GLOBAL
 * de pointerdown no document (fase de captura).
 *
 * Por que não só o backdrop `fixed inset-0`? O /chat é montado persistente
 * fora do <Routes> com stacking context próprio ACIMA do z-40 — cliques nele
 * nunca alcançavam o backdrop (feedback 09/07: "clicar em qualquer local da
 * tela não fecha o dropdown"). O listener no document é imune a stacking.
 *
 * Marque o menu com data-menu-root={key} e o(s) botão(ões) gatilho com
 * data-menu-trigger={key} — pointerdown neles é ignorado (o próprio onClick
 * do gatilho/backdrop cuida do toggle, sem corrida fecha-e-reabre).
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
