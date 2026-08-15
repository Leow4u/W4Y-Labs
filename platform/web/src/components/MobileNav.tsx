"use client";

import { useState } from "react";
import Link from "next/link";

// Menu mobile mínimo do header público: hambúrguer → painel com a navegação
// e o CTA. Fecha ao navegar.
export default function MobileNav({
  items,
  openHref,
  ctaOpen = "Abrir o Work4You",
}: {
  items: { href: string; label: string }[];
  openHref: string;
  ctaOpen?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-ink-soft hover:bg-paper-deep"
      >
        {open ? "✕" : "☰"}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-16 z-50 border-b border-line bg-paper px-6 pb-6 pt-2 shadow-[0_20px_40px_-20px_rgba(26,28,24,0.18)]">
          <nav className="flex flex-col">
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="border-b border-line/60 py-3.5 text-[15px] text-ink-soft"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <a
            href={openHref}
            onClick={() => setOpen(false)}
            className="mt-5 block rounded-full bg-mata px-5 py-3 text-center text-sm font-semibold text-paper"
          >
            {ctaOpen}
          </a>
        </div>
      )}
    </div>
  );
}
