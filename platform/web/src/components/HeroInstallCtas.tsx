"use client";

import { WINDOWS_DESKTOP_URL } from "@/lib/product-download";

function WindowsMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M3 5.5 10.5 4.3V11H3V5.5zm0 7h7.5v6.7L3 18.5V12.5zm9-8.2L21 3v7.5h-9V4.3zm0 8.2H21V21l-9-1.5v-7z" />
    </svg>
  );
}

export default function HeroInstallCtas({
  downloadLabel,
  terminalLabel,
}: {
  downloadLabel: string;
  terminalLabel: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <a
        href={WINDOWS_DESKTOP_URL}
        className="inline-flex items-center justify-center gap-2.5 rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-paper transition-colors hover:bg-black"
      >
        <WindowsMark className="h-5 w-5 shrink-0" />
        {downloadLabel}
      </a>
      <a
        href="#install-terminal"
        className="inline-flex items-center justify-center rounded-full border border-line bg-paper px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:border-ink/30 hover:bg-paper-deep"
      >
        {terminalLabel}
      </a>
    </div>
  );
}
