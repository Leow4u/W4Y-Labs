"use client";

import { useState } from "react";
import Link from "next/link";

// Cursor-style resources dropdown: two link columns, opens on hover
// (desktop) and on click. Closes on navigation. Labels come translated
// from the server header (locale-aware).
interface Item {
  href: string;
  label: string;
}

export default function ResourcesMenu({
  label,
  colA,
  colB,
}: {
  label: string;
  colA: readonly Item[];
  colB: readonly Item[];
}) {
  const [open, setOpen] = useState(false);

  const item = (l: Item) => (
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
        {label}
        <span className="ml-1 text-[10px] text-ink-faint">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 w-[310px] pt-2">
          <div className="grid grid-cols-2 gap-x-1 rounded-xl border border-line bg-paper p-2 shadow-[0_20px_60px_-20px_rgba(26,28,24,0.25)]">
            <div>{colA.map(item)}</div>
            <div>{colB.map(item)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
