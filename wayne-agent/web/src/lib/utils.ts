import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Mondwest font only — use on layout shells; do not force normal-case here or `text-display` chrome (Segmented, badges) stops uppercasing. */
export const themedFont = "font-mondwest";

/** Mondwest body copy — sentence-case themed text (not uppercase chrome). */
export const themedBody = "font-mondwest normal-case";

/** Mondwest brand chrome — uppercase section headers and nav labels. */
export const themedChrome = "font-mondwest text-display";

/** Relative time from a Unix epoch timestamp (seconds). */
export function timeAgo(ts: number): string {
  const delta = Date.now() / 1000 - ts;
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 172800) return "yesterday";
  return `${Math.floor(delta / 86400)}d ago`;
}

/** Idade compacta LOCALIZADA ("agora"/"43m"/"2h"/"3d") — o formato curto do
 *  produto (chat + sidebar). Recebe os rótulos `chat.age*` do i18n em vez de
 *  importar o hook (função pura, usável fora de componentes). Substitui o
 *  `timeAgo` inglês-hardcoded acima nas superfícies do usuário final. */
export function timeAgoShort(
  epochSeconds: number,
  labels: { ageNow: string; ageMin: string; ageHour: string; ageDay: string },
): string {
  const deltaS = Date.now() / 1000 - epochSeconds;
  if (deltaS < 60) return labels.ageNow;
  if (deltaS < 3600) return labels.ageMin.replace("{n}", String(Math.floor(deltaS / 60)));
  if (deltaS < 86400) return labels.ageHour.replace("{n}", String(Math.floor(deltaS / 3600)));
  return labels.ageDay.replace("{n}", String(Math.floor(deltaS / 86400)));
}

/** Relative time from an ISO-8601 timestamp string. */
export function isoTimeAgo(iso: string): string {
  const delta = (Date.now() - new Date(iso).getTime()) / 1000;
  if (delta < 0 || Number.isNaN(delta)) return "unknown";
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}
