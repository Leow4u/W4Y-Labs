"use client";

import { useRouter } from "next/navigation";
import { SITE_LOCALE_COOKIE, type SiteLocale } from "@/lib/site-locale-shared";

// PT | EN segmented chip. Sets the locale cookie and refreshes the tree —
// every server component re-renders in the chosen language, same URL.
export default function LocaleChip({ locale }: { locale: SiteLocale }) {
  const router = useRouter();

  const set = (next: SiteLocale) => {
    if (next === locale) return;
    document.cookie = `${SITE_LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  const seg = (value: SiteLocale, label: string) => (
    <button
      type="button"
      onClick={() => set(value)}
      aria-pressed={locale === value}
      className={`rounded-full px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] transition-colors ${
        locale === value
          ? "bg-paper text-ink shadow-sm"
          : "text-ink-faint hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full border border-line bg-paper-deep p-0.5"
      aria-label="Idioma / Language"
    >
      {seg("pt", "PT")}
      {seg("en", "EN")}
    </div>
  );
}
