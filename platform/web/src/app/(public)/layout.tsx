import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import CookieBanner from "@/components/CookieBanner";
import { getSiteLocale } from "@/lib/site-locale";

// Public pages layout (landing + institutional). Committed to the light
// "Papel & Mata" look regardless of OS theme — warm paper ground, warm ink.
// Locale (pt/en) comes from the w4y_site_locale cookie set by the header chip.
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getSiteLocale();

  return (
    <div className="min-h-screen bg-paper text-ink">
      <PublicHeader locale={locale} />
      <main>{children}</main>
      <PublicFooter locale={locale} />
      <CookieBanner locale={locale} />
    </div>
  );
}
