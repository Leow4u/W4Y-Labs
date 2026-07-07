/**
 * SettingsOverlay — Configuração como tela sobreposta (estilo Manus/Claude).
 *
 * Aberto pelo menu do chip do usuário (AuthWidget). Por padrão mostra a tela
 * ENXUTA do usuário (ConfigUser — só Geral/Aparência/Memória, curadoria do
 * Bloco 2). A tela técnica completa de config.yaml (ConfigPage) fica atrás da
 * escotilha interna `?full=1`, para nós/suporte.
 *
 * Ambas injetam sua barra de ação (Guardar etc.) via usePageHeader().setEnd —
 * por isso o corpo é envolvido num PageHeaderProvider FRESCO aqui dentro (a
 * barra é renderizada dentro do overlay, não na página de fundo). O título do
 * provider é esvaziado; o título + o X ficam na barra própria do overlay.
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

/** Escotilha interna (nós/suporte): `?full=1` na URL mostra a tela técnica
 *  completa de config.yaml em vez da tela enxuta do usuário. */
export function isFullConfigRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("full") === "1";
  } catch {
    return false;
  }
}

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
  const { t } = useI18n();
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

  const full = isFullConfigRequested();
  const title = t.configUser.title;
  const closeLabel = t.common.close;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3">
      {/* Fundo escurecido — clique fecha. */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Card do modal, centralizado (estilo Manus/Claude). Altura quase cheia
          (fica perto do topo e do rodapé do navegador — só ~0,75rem de folga
          de cada lado, casada com o p-3 do overlay). Conteúdo curto deixa
          espaço, conteúdo longo rola. `settings-modal` ativa o Title Case
          interno (ver index.css) para suavizar o MAIÚSCULO do design-system. */}
      <div
        className={cn(
          "settings-modal relative flex w-full max-w-5xl flex-col",
          "h-[calc(100vh-1.5rem)] overflow-hidden rounded-xl",
          "border border-current/20 bg-background-base",
          "shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7)]",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Sem barra de título (estilo Claude): o X flutua no canto e a busca
            fica no topo do menu (dentro da ConfigUser). */}
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

        {/* Corpo: tela enxuta (padrão) ou técnica (`?full=1`), rolando dentro
            do card. `flex flex-col` é essencial: cria o contexto flex que
            limita a altura do conteúdo (senão ele expande para a altura
            natural e vaza do modal). `pt-12` reserva uma faixa no topo: evita
            o conteúdo "esmagado" e deixa o X (canto sup. dir.) livre, sem ficar
            atrás do "Criar" da tela de Habilidades. */}
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
