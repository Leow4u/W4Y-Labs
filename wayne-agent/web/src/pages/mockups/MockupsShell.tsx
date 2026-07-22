import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  Bot,
  Clock,
  FolderOpen,
  MessageSquare,
  Puzzle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NewTaskIcon } from "@/components/SidebarTasks";
import { MOCK_SESSIONS } from "./mock-data";

const NAV = [
  { to: "/mockups/v1/chat-hero", label: "Nova tarefa", icon: NewTaskIcon },
  { to: "/mockups/v1/entregas", label: "Entregas", icon: FolderOpen },
  { to: "/mockups/v1/integracoes", label: "Integrações", icon: Puzzle },
  { to: "/mockups/v1/agentes", label: "Agentes", icon: Bot },
  { to: "/mockups/v1/agenda", label: "Agenda", icon: Clock },
] as const;

export function MockSpecBanner() {
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center type-ui text-amber-900 dark:text-amber-200">
      <span className="font-medium">Spec preview v1</span>
      <span className="mx-2 opacity-50">·</span>
      Mock interativo — não é produção
      <span className="mx-2 opacity-50">·</span>
      <Link to="/mockups/v1" className="underline underline-offset-2 hover:opacity-80">
        Índice de telas
      </Link>
    </div>
  );
}

export function MockTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly string[];
  active: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border pb-3">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            "rounded-full px-3 py-1.5 type-ui transition-colors",
            active === tab
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function MockupsShell({
  title,
  children,
  headerEnd,
}: {
  title?: string;
  children: ReactNode;
  headerEnd?: ReactNode;
}) {
  return (
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-background-base text-text-primary antialiased">
      <MockSpecBanner />
      <div className="flex min-h-0 flex-1">
        <aside
          className="hidden w-56 shrink-0 flex-col border-r border-border lg:flex"
          style={{
            background: "var(--component-sidebar-background)",
          }}
        >
          <div className="flex items-center gap-2 px-4 py-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-brand text-sm tracking-wide">Work4You</span>
          </div>
          <nav className="flex flex-col gap-0.5 px-2">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 type-ui transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 px-4">
            <div className="type-caption font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Tarefas
            </div>
            <ul className="mt-2 space-y-1">
              {MOCK_SESSIONS.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/mockups/v1/chat-session"
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 type-ui truncate",
                      s.active
                        ? "bg-muted/80 text-foreground"
                        : "text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-auto border-t border-border p-3">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 type-ui hover:bg-muted/50"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-medium">
                L
              </span>
              <span>Leo ▾</span>
            </button>
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {(title || headerEnd) && (
            <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
              {title ? (
                <h1 className="font-mondwest text-display text-sm tracking-[0.06em]">{title}</h1>
              ) : (
                <span />
              )}
              {headerEnd}
            </header>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function MockUsageFooter({
  credits,
  context,
}: {
  credits: string;
  context: string;
}) {
  return (
    <div className="mt-3 flex items-center justify-between border-t border-border pt-3 type-caption text-muted-foreground">
      <span>
        {credits} · {context}
      </span>
      <button type="button" className="hover:text-foreground">
        ? usage
      </button>
    </div>
  );
}

export function MockComposerBar() {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 type-ui"
        >
          Relay <span className="text-muted-foreground">▾</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 type-ui text-muted-foreground"
        >
          Aprovações <span>▾</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 type-ui text-muted-foreground"
        >
          Conectores <span>▾</span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <input
            readOnly
            placeholder="Descreva a tarefa…"
            className="w-48 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 type-ui sm:w-72"
          />
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
