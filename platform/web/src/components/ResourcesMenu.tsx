"use client";

import { useState } from "react";
import Link from "next/link";

// Cursor-style "Recursos" dropdown: two link columns, opens on hover
// (desktop) and on click. Closes on navigation.
const COL_A = [
  { href: "/documentacao", label: "Documentação" },
  { href: "/ajuda", label: "Ajuda" },
];
const COL_B = [
  { href: "/blog", label: "Blog" },
  { href: "/comunidade", label: "Comunidade" },
  { href: "/workshops", label: "Workshops" },
  { href: "/carreiras", label: "Carreiras" },
];

export default function ResourcesMenu() {
  const [open, setOpen] = useState(false);

  const item = (l: { href: string; label: string }) => (
    <Link
      key={l.href}
      href={l.href}
      onClick={() => setOpen(false)}
      className="block rounded-lg px-3 py-2 text-[13.5px] text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink"
    >
      {l.label}
    </Link>
  );

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center text-[13.5px] text-ink-soft transition-colors hover:text-ink"
      >
        Recursos
        <span className="ml-1 text-[10px] text-ink-faint">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 w-[310px] pt-2">
          <div className="grid grid-cols-2 gap-x-1 rounded-xl border border-line bg-paper p-2 shadow-[0_20px_60px_-20px_rgba(26,28,24,0.25)]">
            <div>{COL_A.map(item)}</div>
            <div>{COL_B.map(item)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
