/**
 * useScheduleText — descreve um agendamento (cron/intervalo/uma-vez) em frase
 * humana LOCALIZADA, reusando a lógica nativa da tela de Cron (lib/schedule).
 *
 * Centraliza a montagem das ScheduleDescribeStrings (nomes de dias + ordinais
 * já traduzidos em t.cron.*) pra que o módulo de Agentes NÃO reinvente cron:
 * "30 14 * * 1,3,5" → "Semanalmente Seg, Qua, Sex às 14:30". A função é
 * estável (memoizada por t/locale) pra poder entrar em deps de effect sem
 * disparar re-render em loop.
 */
import { useCallback } from "react";

import { useI18n } from "@/i18n";
import {
  describeSchedule,
  englishOrdinal,
  type ScheduleLike,
} from "@/lib/schedule";

export function useScheduleText() {
  const { t, locale } = useI18n();
  return useCallback(
    (schedule: ScheduleLike | undefined, fallback?: string): string =>
      describeSchedule(schedule, fallback, {
        ...t.cron.scheduleDescribe,
        weekdaysShort: t.cron.scheduleModes.weekdaysShort,
        // Ordinais só o inglês tem sufixo ("1st"); demais idiomas = número cru.
        ordinal: locale === "en" ? englishOrdinal : (n: number) => String(n),
      }),
    [t, locale],
  );
}
