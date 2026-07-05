/**
 * SettingsOverlay — Configuração como tela sobreposta (estilo Manus/Claude).
 *
 * Aberto pelo menu do chip do usuário (AuthWidget). Reusa a ConfigPage
 * inteira, sem recriar nada. A ConfigPage injeta seus botões de ação (YAML /
 * Guardar / download…) no cabeçalho via usePageHeader().setEnd — por isso
 * envolvemos a página num PageHeaderProvider FRESCO aqui dentro: assim a
 * barra de ferramentas dela é renderizada dentro do overlay (não na barra da
 * página de fundo, que fica escondida atrás). O título da barra do provider é
 * esvaziado; o título "Configuração" + o X ficam na barra própria do overlay.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ConfigPage from "@/pages/ConfigPage";
import { PageHeaderProvider } from "@/contexts/PageHeaderProvider";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn } from "@/lib/utils";

/** Esvazia o título da barra do provider aninhado — o overlay já tem o seu.
 *  (setTitle("") vence o defaultTitle da rota atual, que seria "Chat" etc.) */
function BlankProviderTitle() {
  const { setTitle } = usePageHeader();
  useEffect(() => {
    setTitle("");
    return () => setTitle(null);
  }, [setTitle]);
  return null;
}

export function SettingsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Trava o scroll do fundo enquanto o overlay está aberto.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const title = "Configuração";
  const closeLabel = "Fechar";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
      {/* Fundo escurecido — clique fecha. */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Card do modal, centralizado (estilo Manus/Claude). */}
      <div
        className={cn(
          "relative flex w-full max-w-5xl flex-col",
          "max-h-[85vh] overflow-hidden rounded-xl",
          "border border-current/20 bg-background-base",
          "shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7)]",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Barra do modal: título + fechar. */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-current/20 px-4 py-2.5 sm:px-5">
          <span className="font-expanded text-sm font-bold tracking-[0.08em] text-midground">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded text-muted-foreground/80",
              "transition-colors hover:bg-current/10 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40",
            )}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo: a ConfigPage reusada (rola dentro do card), com sua própria
            barra Guardar/YAML via o provider aninhado. */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <PageHeaderProvider pluginTabs={[]}>
            <BlankProviderTitle />
            <ConfigPage />
          </PageHeaderProvider>
        </div>
      </div>
    </div>,
    document.body,
  );
}
