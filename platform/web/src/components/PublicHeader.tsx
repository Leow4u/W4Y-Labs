import Image from "next/image";
import Link from "next/link";
import { getDevSession } from "@/lib/dev-auth";
import MobileNav from "@/components/MobileNav";
import ResourcesMenu from "@/components/ResourcesMenu";

// Public header — light ground, generous spacing. "Recursos" is a real
// dropdown (ResourcesMenu); mobile gets the flattened list.
// "/baixar" intentionally out of the nav: the desktop app is being reworked
// and downloads are paused. Re-add the entry when it ships.
const NAV = [
  { href: "/plataforma", label: "Plataforma" },
  { href: "/precos", label: "Preços" },
];

const RESOURCES = [
  { href: "/documentacao", label: "Documentação" },
  { href: "/ajuda", label: "Ajuda" },
  { href: "/blog", label: "Blog" },
  { href: "/comunidade", label: "Comunidade" },
  { href: "/workshops", label: "Workshops" },
  { href: "/carreiras", label: "Carreiras" },
];

export default async function PublicHeader() {
  const session = await getDevSession();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 px-6 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6">
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
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-[13.5px] text-ink-soft transition-colors hover:text-ink"
            >
              {n.label}
            </Link>
          ))}
          <ResourcesMenu />
        </nav>

        <div className="hidden md:block">
          {session ? (
            <Link
              href="/abrir"
              className="inline-block whitespace-nowrap rounded-full bg-mata px-5 py-2 text-sm font-semibold text-paper transition-colors hover:bg-mata-deep"
            >
              Abrir o Work4You
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-block whitespace-nowrap rounded-full bg-mata px-5 py-2 text-sm font-semibold text-paper transition-colors hover:bg-mata-deep"
            >
              Conecte-se
            </Link>
          )}
        </div>

        <MobileNav items={[...NAV, ...RESOURCES]} authenticated={!!session} />
      </div>
    </header>
  );
}
