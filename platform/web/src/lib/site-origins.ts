/** Public origins for the split-domain product (platform vs app SPA). */

export function platformOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_PLATFORM_ORIGIN ||
    process.env.PLATFORM_ORIGIN ||
    "https://work4you.ai"
  ).replace(/\/$/, "");
}

export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.APP_ORIGIN ||
    "https://app.work4you.ai"
  ).replace(/\/$/, "");
}

/** When true, post-login flow lands on app.work4you.ai (not same-origin /chat). */
export function appSubdomainEnabled(): boolean {
  return (process.env.W4Y_APP_SUBDOMAIN ?? "1") === "1";
}

/** Shared cookie domain for w4y_route + platform session (production only). */
export function cookieDomain(): string | undefined {
  const explicit = process.env.W4Y_COOKIE_DOMAIN?.trim();
  if (explicit) return explicit || undefined;
  if (platformOrigin().includes("localhost") || platformOrigin().includes("127.0.0.1")) {
    return undefined;
  }
  return ".work4you.ai";
}

export function platformUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${platformOrigin()}${p}`;
}

export function appUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${appOrigin()}${p}`;
}

/** Client-safe app origin (PlansView, etc.). */
export function publicAppOrigin(): string {
  return appOrigin();
}
