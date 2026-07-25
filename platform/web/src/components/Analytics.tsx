"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getCookieConsent } from "@/lib/consent";

// Google Analytics 4, strictly consent-gated: the gtag script only ever
// loads after the visitor clicks "Accept all" on the cookie banner
// ("essentials only" or no choice = zero analytics, zero requests).
// GA measurement IDs are public by design (visible in any site's source),
// so a constant here is fine — no secret involved.
export const GA_MEASUREMENT_ID = "G-5NY8BM3DNJ"; // empty = analytics off

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function loadGa() {
  if (!GA_MEASUREMENT_ID || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  // gtag.js only processes `arguments` objects pushed into dataLayer —
  // plain arrays are silently ignored, which kills config and every hit.
  // So this must be a classic function pushing `arguments` itself.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  } as unknown as (...args: unknown[]) => void;
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID);
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);
}

export default function Analytics() {
  const pathname = usePathname();
  const loaded = useRef(false);

  // Load on mount if consent was already given; otherwise wait for the
  // banner's consent event (fires the moment "Accept all" is clicked).
  useEffect(() => {
    const maybeLoad = () => {
      if (!loaded.current && getCookieConsent() === "all") {
        loaded.current = true;
        loadGa();
      }
    };
    maybeLoad();
    window.addEventListener("w4y:consent", maybeLoad);
    return () => window.removeEventListener("w4y:consent", maybeLoad);
  }, []);

  // SPA navigations: report page_view on route change (initial view is
  // reported by the config call itself).
  useEffect(() => {
    if (loaded.current && window.gtag) {
      window.gtag("event", "page_view", { page_path: pathname });
    }
  }, [pathname]);

  return null;
}
