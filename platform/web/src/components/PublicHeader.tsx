import Image from "next/image";
import Link from "next/link";
import { getDevSession } from "@/lib/dev-auth";
import MobileNav from "@/components/MobileNav";

// Header público da Work4You — fundo claro, espaçamento generoso, nada de
// cara técnica. "Plataforma/Soluções/Recursos" carregam o marcador ▾ (terão
// dropdown em fase futura; hoje levam às páginas de seção).
const NAV = [
  { href: "/plataforma", label: "Plataforma", caret: true },
  { href: "/solucoes", label: "Soluções", caret: true },
  { href: "/modelos", label: "Modelos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/precos", label: "Preços" },
  { href: "/recursos", label: "Recursos", caret: true },
  { href: "/baixar", label: "Baixar" },
];

export default async function PublicHeader() {
  const session = await getDevSession();

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/" className="flex items-center">
          <Image
            src="/brand/work4you-logo.png"
            alt="Work4You"
            width={2400}
            height={244}
            priority
            className="h-[22px] w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-[13.5px] text-neutral-600 transition-colors hover:text-neutral-900"
            >
              {n.label}
              {n.caret && <span className="ml-1 text-[10px] text-neutral-400">▾</span>}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          {session ? (
            <Link
              href="/abrir"
              className="font-brand rounded-full bg-neutral-100 px-5 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-200"
            >
              Abrir o Work4You
            </Link>
          ) : (
            <Link
              href="/login"
              className="font-brand rounded-full bg-neutral-100 px-5 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-200"
            >
              Conecte-se
            </Link>
          )}
        </div>

        <MobileNav
          items={NAV.map(({ href, label }) => ({ href, label }))}
          authenticated={!!session}
        />
      </div>
    </header>
  );
}
