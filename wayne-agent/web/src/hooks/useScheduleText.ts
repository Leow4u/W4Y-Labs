/**
 * useScheduleText — describes a schedule (cron/interval/one-off) as a LOCALIZED
 * human sentence, reusing the native logic of the Cron screen (lib/schedule).
 *
 * Centralizes assembling the ScheduleDescribeStrings (day names + ordinals
 * already translated under t.cron.*) so the Agents module does NOT reinvent
 * cron: "30 14 * * 1,3,5" → "Semanalmente Seg, Qua, Sex às 14:30". The function
 * is stable (memoized by t/locale) so it can go into effect deps without
 * triggering a re-render loop.
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
        // Ordinals: only English has a suffix ("1st"); other languages = raw number.
        ordinal: locale === "en" ? englishOrdinal : (n: number) => String(n),
      }),
    [t, locale],
  );
}
