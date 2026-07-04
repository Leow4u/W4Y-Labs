"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Casca fina: a plataforma NÃO recria o dashboard do Wayne (Chat, Files,
// Cron, Skills, Logs vivem no Wayne). Após o login o usuário cai no fluxo SSO
// e acessa o dashboard em /chat na mesma origem work4you.ai.
const NAV = [{ href: "/instancias", label: "Instâncias", icon: "▦" }];

export default function AppShell({
  email,
  isAdmin = false,
  children,
}: {
  email: string;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const linkCls = (active: boolean) =>
    `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
      active
        ? "bg-neutral-900 font-medium text-white dark:bg-white dark:text-neutral-900"
        : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
    }`;

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="px-4 py-4">
          {/* Logo Work4You — a palavra escrita em Cascadia Mono (branding W4Y). */}
          <span className="font-brand text-lg font-semibold">Work4You</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map((m) => (
            <Link key={m.href} href={m.href} className={linkCls(pathname.startsWith(m.href))}>
              <span className="w-4 text-center">{m.icon}</span>
              {m.label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <div className="pt-3 pb-1 pl-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Plataforma
              </div>
              <Link href="/admin" className={linkCls(pathname.startsWith("/admin"))}>
                <span className="w-4 text-center">⛭</span>
                Admin
              </Link>
            </>
          )}
        </nav>
        <div className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <p className="truncate text-xs text-neutral-500">{email}</p>
          <div className="mt-1 flex items-center justify-between">
            <form action="/login/logout" method="post">
              <button
                type="submit"
                className="text-xs text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                Sair
              </button>
            </form>
            <span className="font-brand text-[10px] tracking-wider text-neutral-400">W4Y-Labs</span>
          </div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
