"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookieConsent, setCookieConsent, type CookieConsent } from "@/lib/consent";
import type { SiteLocale } from "@/lib/site-locale-shared";

const COPY = {
  pt: {
    text: "Usamos cookies essenciais pro site funcionar e, com a sua permissão, cookies de análise pra entender como ele é usado.",
    policy: "Política de Privacidade",
    all: "Aceitar todos",
    essential: "Somente essenciais",
  },
  en: {
    text: "We use essential cookies to make the site work and, with your permission, analytics cookies to understand how it's used.",
    policy: "Privacy Policy",
    all: "Accept all",
    essential: "Essentials only",
  },
} as const;

// LGPD-friendly consent banner: no pre-checked non-essential consent, a real
// "essentials only" choice, decision persisted. Rendered only until a choice
// is made. Analytics loaders must gate on getCookieConsent() === "all".
export default function CookieBanner({ locale }: { locale: SiteLocale }) {
  const [visible, setVisible] = useState(false);
  const t = COPY[locale];

  // Read the stored choice only on the client (avoids hydration mismatch).
  useEffect(() => {
    setVisible(getCookieConsent() === null);
  }, []);

  if (!visible) return null;

  const decide = (choice: CookieConsent) => {
    setCookieConsent(choice);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-line bg-paper p-5 shadow-[0_24px_70px_-24px_rgba(26,28,24,0.4)] sm:left-6 sm:right-auto sm:mx-0"
    >
      <p className="text-sm leading-relaxed text-ink-soft">
        {t.text}{" "}
        <Link
          href="/privacidade"
          className="font-medium text-mata underline decoration-salvia underline-offset-2 hover:text-mata-deep"
        >
          {t.policy}
        </Link>
      </p>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => decide("all")}
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper transition-colors hover:bg-black"
        >
          {t.all}
        </button>
        <button
          type="button"
          onClick={() => decide("essential")}
          className="rounded-full border border-line bg-paper px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-deep"
        >
          {t.essential}
        </button>
      </div>
    </div>
  );
}
