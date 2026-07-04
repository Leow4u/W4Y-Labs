"use client";

import { useState } from "react";
import Link from "next/link";

// Menu mobile mínimo do header público: hambúrguer → painel com a navegação
// e o CTA. Fecha ao navegar.
export default function MobileNav({
  items,
  authenticated,
}: {
  items: { href: string; label: string }[];
  authenticated: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-neutral-700 hover:bg-neutral-100"
      >
        {open ? "✕" : "☰"}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-16 z-50 border-b border-neutral-100 bg-white px-6 pb-6 pt-2 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.15)]">
          <nav className="flex flex-col">
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="border-b border-neutral-50 py-3.5 text-[15px] text-neutral-700"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Link
            href={authenticated ? "/abrir" : "/login"}
            onClick={() => setOpen(false)}
            className="font-brand mt-5 block rounded-full bg-neutral-100 px-5 py-3 text-center text-sm font-medium text-neutral-800"
          >
            {authenticated ? "Abrir o Work4You" : "Conecte-se"}
          </Link>
        </div>
      )}
    </div>
  );
}
