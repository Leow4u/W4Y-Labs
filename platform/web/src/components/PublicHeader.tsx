import Image from "next/image";
import Link from "next/link";
import { getDevSession } from "@/lib/dev-auth";
import MobileNav from "@/components/MobileNav";
import ResourcesMenu from "@/components/ResourcesMenu";
import type { SiteLocale } from "@/lib/site-locale";
import { BROWSER_ENTER, BROWSER_ENTER_AUTHED } from "@/lib/product-download";

// Public header — light ground, generous spacing. "Recursos" is a real
// dropdown (ResourcesMenu); mobile gets the flattened list. The PT|EN chip
// switches the whole public site via the locale cookie.
const NAV = {
  pt: [
    { href: "/plataforma", label: "Plataforma" },
    { href: "/precos", label: "Preços" },
  ],
  en: [
    { href: "/plataforma", label: "Platform" },
    { href: "/precos", label: "Pricing" },
  ],
} as const;

const RESOURCES = {
  pt: [
    { href: "/documentacao", label: "Documentação" },
    { href: "/ajuda", label: "Ajuda" },
    { href: "/blog", label: "Blog" },
    { href: "/comunidade", label: "Comunidade" },
    { href: "/workshops", label: "Workshops" },
    { href: "/carreiras", label: "Carreiras" },
  ],
  en: [
    { href: "/documentacao", label: "Documentation" },
    { href: "/ajuda", label: "Help" },
    { href: "/blog", label: "Blog" },
    { href: "/comunidade", label: "Community" },
    { href: "/workshops", label: "Workshops" },
    { href: "/carreiras", label: "Careers" },
  ],
} as const;

const LABELS = {
  pt: { resources: "Recursos", open: "Abrir o Work4You" },
  en: { resources: "Resources", open: "Open Work4You" },
} as const;

export default async function PublicHeader({ locale }: { locale: SiteLocale }) {
  const session = await getDevSession();
  const nav = NAV[locale];
  const resources = RESOURCES[locale];
  const t = LABELS[locale];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 px-6 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="flex items-center">
          <Image
            src="/brand/work4you-logo.png"
            alt="Work4You"
            width={2400}
            height={244}
            priority
            className="h-[17px] w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-[13.5px] text-ink-soft transition-colors hover:text-ink"
            >
              {n.label}
            </Link>
          ))}
          <ResourcesMenu
            label={t.resources}
            colA={resources.slice(0, 2)}
            colB={resources.slice(2)}
          />
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <Link
              href={session ? BROWSER_ENTER_AUTHED : BROWSER_ENTER}
              className="inline-block whitespace-nowrap rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper transition-colors hover:bg-black"
            >
              {t.open}
            </Link>
          </div>
          <MobileNav
            items={[...nav, ...resources]}
            openHref={session ? BROWSER_ENTER_AUTHED : BROWSER_ENTER}
            ctaOpen={t.open}
          />
        </div>
      </div>
    </header>
  );
}
