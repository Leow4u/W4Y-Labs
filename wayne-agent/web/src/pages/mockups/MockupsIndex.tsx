import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Clock,
  FolderOpen,
  MessageSquare,
  Puzzle,
  Settings,
} from "lucide-react";
import { MockSpecBanner } from "./MockupsShell";

const SCREENS = [
  {
    path: "/mockups/v1/chat-hero",
    title: "Nova tarefa — hero",
    desc: "Relay · footer créditos · Ambiente colapsado",
    icon: MessageSquare,
  },
  {
    path: "/mockups/v1/chat-session",
    title: "Nova tarefa — sessão",
    desc: "Ambiente Codex · subagentes · toolbar unificada",
    icon: MessageSquare,
  },
  {
    path: "/mockups/v1/entregas",
    title: "Entregas",
    desc: "Biblioteca por tarefa · layer Workspace",
    icon: FolderOpen,
  },
  {
    path: "/mockups/v1/integracoes",
    title: "Integrações",
    desc: "Conectores · Habilidades · Canais",
    icon: Puzzle,
  },
  {
    path: "/mockups/v1/agentes",
    title: "Agentes",
    desc: "Equipe · Trabalho · Governança",
    icon: Bot,
  },
  {
    path: "/mockups/v1/agenda",
    title: "Agenda",
    desc: "Rotinas · blueprints PT",
    icon: Clock,
  },
  {
    path: "/mockups/v1/config",
    title: "Configurações",
    desc: "Modal Cursor parity · Modelos",
    icon: Settings,
  },
] as const;

export default function MockupsIndex() {
  return (
    <div className="min-h-dvh bg-background-base text-text-primary antialiased">
      <MockSpecBanner />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="type-caption uppercase tracking-[0.1em] text-muted-foreground">
          Auditoria produto · Fase 9
        </p>
        <h1 className="mt-2 font-serif text-3xl font-medium">Mockups v1</h1>
        <p className="mt-3 max-w-xl type-body text-muted-foreground">
          Telas-alvo renderizadas com o design system Editorial do produto. Use para validar
          visualmente antes do roadmap de implementação (Fase 10).
        </p>
        <ul className="mt-8 grid gap-3">
          {SCREENS.map(({ path, title, desc, icon: Icon }) => (
            <li key={path}>
              <Link
                to={path}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/25 hover:bg-muted/30"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block type-body font-medium">{title}</span>
                  <span className="block type-ui text-muted-foreground">{desc}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 type-caption text-muted-foreground">
          Spec: <code className="rounded bg-muted px-1">docs/MOCKUPS-V1-SPEC.md</code>
        </p>
      </div>
    </div>
  );
}
