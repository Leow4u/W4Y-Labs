/**
 * EnvironmentChip — o seletor de AMBIENTE acima do composer (chip SEPARADO do
 * projeto, decisão 10/07). Diferencial do produto "Code": a nuvem do Claude é
 * sandbox efêmera que o usuário configura; a NOSSA é a máquina persistente do
 * tenant — "Nuvem" já nasce ligada, zero configuração.
 *
 *   Local   "Apenas desktop · Em breve" (vira "Baixar" com a casca; "Abrir"
 *           NÃO — browser não detecta app instalado, igual ao Claude)
 *   Nuvem ✓ o computador do tenant, sempre ligado (engrenagem → aba Projeto)
 *
 * "Adicionar ambiente" e "Controle Remoto" saíram (redundantes / roadmap);
 * "Selecionar repo" migrou pro ProjectPicker ("Novo projeto › Clonar").
 */
import { useState } from "react";
import { Check, ChevronDown, Laptop, MonitorDot, Settings } from "lucide-react";

import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";

export function EnvironmentChip({
  onOpenProjectSettings,
}: {
  /** Abre a aba Projeto do dock (engrenagem do ambiente). */
  onOpenProjectSettings: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useMenuDismiss(open, () => setOpen(false), "env");

  return (
    <div className="relative">
      <button
        type="button"
        data-menu-trigger="env"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 type-caption font-medium text-foreground shadow-card transition-colors hover:border-foreground/25"
      >
        <MonitorDot className="h-3.5 w-3.5 text-live" />
        {t.chat.envCloudSection}
        <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
      </button>

      {open && (
        <div
          data-menu-root="env"
          className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-2xl border border-border bg-card p-1.5 shadow-pop"
        >
          {/* Local — apenas desktop (em breve) */}
          <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 opacity-60">
            <Laptop className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block type-ui font-medium text-foreground">{t.chat.envLocal}</span>
              <span className="block type-micro text-muted-foreground">
                {t.chat.envOnlyDesktop}
              </span>
            </span>
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-px type-micro font-medium text-muted-foreground">
              {t.chat.comingSoon}
            </span>
          </div>

          <div className="mx-2.5 my-1 h-px bg-border/70" />

          {/* Nuvem ✓ — o computador do tenant, sempre ligado */}
          <div className="flex items-center gap-2.5 rounded-xl bg-muted/60 px-2.5 py-2">
            <MonitorDot className="h-4 w-4 shrink-0 text-live" />
            <span className="min-w-0 flex-1 type-ui font-medium text-foreground">
              {t.chat.envCloudSection}
            </span>
            <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
            <button
              type="button"
              title={t.chat.dockProject}
              onClick={() => {
                setOpen(false);
                onOpenProjectSettings();
              }}
              className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
