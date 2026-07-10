/**
 * SidebarTasks — Projetos + Recentes da SIDEBAR GLOBAL (estrutura do Hermes
 * desktop, decisão 10/07): cada projeto lista as PRÓPRIAS sessões aninhadas
 * (agrupadas pelo cwd que o GET /api/sessions já devolve em cada linha), com
 * menu "…" do projeto (fixar/abrir em Arquivos/arquivar sessões/remover) e
 * menu reduzido por sessão aninhada (fixar/arquivar). "Recentes" = sessões
 * sem projeto, com o menu completo e o filtro.
 *
 * Regra da curadoria: TUDO aqui opera sobre endpoints que o backend JÁ tem —
 * nada inventado:
 *   listar/filtrar  GET  /api/sessions (order=recent, source, exclude_sources,
 *                        archived=only — soft-archive já existia p/ o desktop)
 *   renomear        PATCH /api/sessions/{id} {title}
 *   arquivar        PATCH /api/sessions/{id} {archived}
 *   exportar        GET  /api/sessions/{id}/export (mesmo fluxo da SessionsPage)
 *   eliminar        DELETE /api/sessions/{id}
 *   abrir em aba    window.open(/chat?resume=…) — frontend puro
 *   ramificar       session.branch (RPC) — via /chat?resume=…&branch=1, o
 *                   NativeChatPage dispara ao conectar (não há gateway aqui)
 *   fixar           client-side só (localStorage) — igual ao desktop
 *                   (apps/desktop `$pinnedSessionIds`, um `persistentAtom`);
 *                   não existe pin no backend, não tem o que reusar lá
 * Compartilhar-link/Mover para projeto NÃO existem no backend → fora.
 *
 * O menu usa position:fixed pra escapar do overflow-y-auto da sidebar.
 */
import {
  Archive,
  ArchiveRestore,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FolderClosed,
  FolderOpen,
  GitBranch,
  ListFilter,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Shuffle,
  SquarePen,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useConfirmDelete } from "@nous-research/ui/hooks/use-confirm-delete";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useI18n } from "@/i18n";
import { api, type SessionInfo } from "@/lib/api";
import {
  PROJECTS_DIR,
  getFilesRoot,
  projectCwd,
  slugifyProject,
} from "@/lib/projects";
import { isPinned, onPinnedChange, togglePin } from "@/lib/pinned-sessions";
import {
  isProjectPinned,
  onProjectPinnedChange,
  toggleProjectPin,
} from "@/lib/pinned-projects";
import {
  loadAllProjectMeta,
  onProjectMetaChange,
  projectColorHex,
  projectDisplayName,
  getProjectMetaCached,
} from "@/lib/project-meta";
import { ProjectEditModal } from "@/components/chat/ProjectEditModal";
import { randomIdeaTemplates, type ProjectIdeaTemplate } from "@/lib/project-idea-templates";
import { cn, timeAgoShort } from "@/lib/utils";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";

const LIMIT = 60;
/** Tarefas visíveis antes do "Mostrar mais X" (padrão Claude). */
const COLLAPSED_COUNT = 10;
/** Sessões aninhadas visíveis por projeto (benchmark Hermes desktop). */
const PROJECT_CHAT_COUNT = 3;

type TaskFilter = "none" | "scheduled" | "archived";

const FILTER_OPTS: Record<
  TaskFilter,
  { source?: string; excludeSources?: string; archived?: "only"; minMessages?: number }
> = {
  // "Nenhum" = recentes limpos — mesmo escopo do desktop (exclui cron) e sem
  // sessões vazias (abrir o /chat cria sessão; ela só vira "tarefa" ao falar).
  none: { excludeSources: "cron", minMessages: 1 },
  scheduled: { source: "cron", minMessages: 1 },
  archived: { archived: "only" },
};

function rowLabel(s: SessionInfo, untitled: string): string {
  const title = s.title?.trim();
  if (title && title !== "Untitled") return title;
  const preview = s.preview?.trim();
  if (preview) return preview;
  return untitled;
}

// Idade compacta localizada: agora compartilhada em lib/utils.timeAgoShort
// (Onda 0) — o chat usa a mesma.

interface Anchor {
  id: string;
  x: number;
  y: number;
}

/** Rascunho do modal "Novo projeto" — nome + subpastas opcionais + ideia. */
interface NewProjectDraft {
  name: string;
  folders: string[];
  folderDraft: string;
  addingFolder: boolean;
  idea: string;
}

const EMPTY_PROJECT_DRAFT: NewProjectDraft = {
  name: "",
  folders: [],
  folderDraft: "",
  addingFolder: false,
  idea: "",
};

function MenuItem({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
        danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-muted",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      {label}
    </button>
  );
}

export function SidebarTasks({
  collapsed,
  onNavigate,
}: {
  /** Sidebar desktop colapsada (só ícones) — a seção some. */
  collapsed: boolean;
  /** Fecha o drawer mobile após navegar. */
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const { toast, showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const onChat = location.pathname === "/chat";
  const activeId = onChat ? searchParams.get("resume") : null;
  // Projeto selecionado (workspace) — vive na URL do chat (?project=…).
  const activeProject = onChat ? searchParams.get("project") : null;
  // Só DESTACA o projeto na sidebar quando estamos no ESPAÇO dele (?home=1).
  // No hero de "Nova sessão" (?project=X sem home) quem acende é o item
  // "Nova sessão" da nav — senão o projeto ficava aceso e passava a sensação
  // estranha que o Leonardo apontou (10/07).
  const inProjectHome = onChat && searchParams.has("home");

  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("none");
  const [reloadNonce, setReloadNonce] = useState(0);
  // Colapsa a lista: mostra só as N mais recentes; o resto atrás de "Mostrar
  // mais X" (padrão Claude). Reseta ao trocar filtro/projeto.
  const [expanded, setExpanded] = useState(false);
  // Tarefas recém-iniciadas (inserção OTIMISTA): aparecem na hora que o usuário
  // envia a 1ª msg (evento wayne:session-started), antes do servidor persistir/
  // titular — padrão ChatGPT/Manus. Some quando o REST recarrega e traz a real.
  const [optimistic, setOptimistic] = useState<SessionInfo[]>([]);
  // Fixadas — client-side (localStorage), ver lib/pinned-sessions.ts. O tick
  // força re-render/re-ordenação da lista quando o conjunto muda (isPinned()
  // lê o cache do módulo direto, sem estado React — só precisa re-renderizar).
  const [, setPinTick] = useState(0);
  useEffect(() => onPinnedChange(() => setPinTick((n) => n + 1)), []);
  useEffect(() => onProjectPinnedChange(() => setPinTick((n) => n + 1)), []);
  // Metadados de exibição (nome/emoji/cor) do sidecar — mesmo tick força
  // re-render quando o cache chega/muda. Ver lib/project-meta.ts.
  useEffect(() => onProjectMetaChange(() => setPinTick((n) => n + 1)), []);
  // Projeto sendo editado (modal emoji+nome+cor).
  const [editingProject, setEditingProject] = useState<string | null>(null);

  // ── Projetos = pastas reais em projects/ (ver lib/projects.ts) ───────
  const [projects, setProjects] = useState<string[] | null>(null);
  const [projRoot, setProjRoot] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingProjectBusy, setCreatingProjectBusy] = useState(false);
  // Modal "Novo projeto" (paridade com o desktop): nome + subpastas opcionais
  // (mkdir dentro do projeto — nosso modelo não tem o seletor de pasta nativa
  // do Electron nem multi-root) + ideia (opcional, salva em IDEA.md).
  const [newProject, setNewProject] = useState<NewProjectDraft>(EMPTY_PROJECT_DRAFT);
  const [projectTemplates, setProjectTemplates] = useState<ProjectIdeaTemplate[]>(
    () => randomIdeaTemplates(),
  );

  const openNewProject = useCallback(() => {
    setNewProject(EMPTY_PROJECT_DRAFT);
    setProjectTemplates(randomIdeaTemplates());
    setCreatingProject(true);
  }, []);

  // "Começar do zero" do ProjectPicker (acima do composer) reusa ESTE modal
  // rico (nome+pastas+ideia) — sem duplicar. Ver ProjectPicker.tsx.
  useEffect(() => {
    const onOpen = () => openNewProject();
    window.addEventListener("wayne:open-new-project", onOpen);
    return () => window.removeEventListener("wayne:open-new-project", onOpen);
  }, [openNewProject]);

  const closeNewProject = useCallback(() => {
    setCreatingProject(false);
    setNewProject(EMPTY_PROJECT_DRAFT);
  }, []);

  const loadProjects = useCallback(() => {
    void getFilesRoot().then((r) => setProjRoot(r));
    api
      .listFiles(PROJECTS_DIR)
      .then((res) => {
        const slugs = res.entries.filter((e) => e.is_directory).map((e) => e.name);
        setProjects(slugs);
        // Pré-carrega nome/emoji/cor de cada projeto (sidecar) — notifica
        // sozinho quando chega e re-renderiza a lista já personalizada.
        void loadAllProjectMeta(slugs);
      })
      // Pasta projects/ ainda não existe → sem projetos (criada no 1º "+").
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProjects();
  }, [loadProjects]);

  const pickProject = useCallback(
    (name: string) => {
      onNavigate?.();
      // Abre o ESPAÇO do projeto (?home=1). A tela de chat novo com o chip
      // fica por conta do ProjectPicker/Nova tarefa (?project sem home).
      navigate(`/chat?project=${encodeURIComponent(name)}&home=1`);
    },
    [navigate, onNavigate],
  );

  // Cria o projeto (mkdir), subpastas opcionais (mkdir dentro dele) e grava
  // IDEA.md se a ideia foi preenchida — paridade com o fluxo do desktop
  // (nome + pastas + ideia), tudo em cima de endpoints REST já existentes
  // (createDirectory/uploadFile), sem RPC/infra nova.
  const submitNewProject = useCallback(async () => {
    const slug = slugifyProject(newProject.name);
    if (!slug || creatingProjectBusy) return;
    setCreatingProjectBusy(true);
    try {
      await api.createDirectory(`${PROJECTS_DIR}/${slug}`);
      for (const folder of newProject.folders) {
        const sub = slugifyProject(folder);
        if (sub) await api.createDirectory(`${PROJECTS_DIR}/${slug}/${sub}`).catch(() => {});
      }
      const idea = newProject.idea.trim();
      if (idea) {
        const body = idea.endsWith("\n") ? idea : `${idea}\n`;
        const file = new File([new Blob([body], { type: "text/markdown" })], "IDEA.md", {
          type: "text/markdown",
        });
        await api.uploadFile(`${PROJECTS_DIR}/${slug}/IDEA.md`, file).catch(() => {});
      }
      showToast(t.chat.projectCreated, "success");
      closeNewProject();
      loadProjects();
      navigate(`/chat?project=${encodeURIComponent(slug)}&home=1`);
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    } finally {
      setCreatingProjectBusy(false);
    }
  }, [
    newProject,
    creatingProjectBusy,
    closeNewProject,
    loadProjects,
    navigate,
    showToast,
    t.chat.projectCreated,
    t.status.error,
  ]);

  // Menus (fixed pra escapar do overflow da sidebar).
  const [rowMenu, setRowMenu] = useState<Anchor | null>(null);
  const [filterMenuAt, setFilterMenuAt] = useState<{ x: number; y: number } | null>(null);
  // Menus da seção Projetos: "…" do projeto (id = slug) e "…" da sessão
  // ANINHADA (menu reduzido: fixar/arquivar — decisão 10/07, espelho Hermes).
  const [projMenu, setProjMenu] = useState<Anchor | null>(null);
  const [chatMenu, setChatMenu] = useState<Anchor | null>(null);
  // Clique fora/Esc fecham (listener global — backdrops não cobrem o chat).
  useMenuDismiss(!!rowMenu, () => setRowMenu(null), "sb-row");
  useMenuDismiss(!!filterMenuAt, () => setFilterMenuAt(null), "sb-filter");
  useMenuDismiss(!!projMenu, () => setProjMenu(null), "sb-proj");
  useMenuDismiss(!!chatMenu, () => setChatMenu(null), "sb-chat");

  // Renomear inline.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const reqRef = useRef(0);
  const load = useCallback(() => {
    const myReq = ++reqRef.current;
    setLoading(true);
    // Lista ÚNICA global — cada linha traz o cwd; o agrupamento por projeto
    // é client-side (as sessões de projeto aninham na seção Projetos, o
    // resto cai em "Recentes"). O escopo por pasta via cwd_prefix saiu.
    api
      .getSessions(LIMIT, 0, "", "recent", FILTER_OPTS[filter])
      .then((res) => {
        if (reqRef.current !== myReq) return;
        setSessions(res.sessions);
      })
      .catch(() => {
        if (reqRef.current !== myReq) return;
        setSessions([]);
      })
      .finally(() => {
        if (reqRef.current === myReq) setLoading(false);
      });
  }, [filter]);

  // Recarrega ao trocar filtro, ao navegar entre conversas (o título da nova
  // tarefa materializa no servidor) e no gatilho manual.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, reloadNonce, activeId]);

  // O chat auto-titula a sessão no 1º turno (session.info) e dispara este
  // evento — recarregamos pra o título vivo aparecer sem trocar de aba.
  useEffect(() => {
    const onTitled = () => setReloadNonce((n) => n + 1);
    window.addEventListener("wayne:session-titled", onTitled);
    return () => window.removeEventListener("wayne:session-titled", onTitled);
  }, []);

  // 1º envio de uma tarefa nova (wayne:session-started, disparado pelo hook do
  // chat): insere a sessão AGORA com a 1ª msg como título provisório. Leva o
  // cwd junto — o agrupamento aninha no projeto certo (ou em Recentes).
  useEffect(() => {
    const onStarted = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        id?: string;
        title?: string;
        cwd?: string | null;
      };
      const id = d?.id;
      if (!id) return;
      const now = Date.now();
      setOptimistic((prev) =>
        prev.some((s) => s.id === id)
          ? prev
          : [
              {
                id,
                source: null,
                model: null,
                title: d.title ?? null,
                started_at: now,
                ended_at: null,
                last_active: now,
                is_active: true,
                message_count: 1,
                tool_call_count: 0,
                input_tokens: 0,
                output_tokens: 0,
                preview: d.title ?? null,
                cwd: d.cwd ?? null,
              },
              ...prev,
            ],
      );
    };
    window.addEventListener("wayne:session-started", onStarted);
    return () => window.removeEventListener("wayne:session-started", onStarted);
  }, []);

  // Estado VIVO por sessão (Onda 1, padrão desktop): "working" = ponto pulsando
  // no lugar do ícone (agente trabalhando), "attention" = âmbar (esperando o
  // usuário responder approval/clarify). Emitido pelo useChatSession.
  const [liveState, setLiveState] = useState<Record<string, "working" | "attention">>({});
  useEffect(() => {
    const onActivity = (e: Event) => {
      const d = (e as CustomEvent).detail as { id?: string; state?: string };
      const id = d?.id;
      if (!id) return;
      setLiveState((prev) => {
        if (d.state === "working" || d.state === "attention") {
          if (prev[id] === d.state) return prev;
          return { ...prev, [id]: d.state };
        }
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };
    window.addEventListener("wayne:session-activity", onActivity);
    return () => window.removeEventListener("wayne:session-activity", onActivity);
  }, []);

  // Quando o REST recarrega e já traz a tarefa (agora persistida/titulada),
  // dropa a versão otimista (mesmo id) — a real assume, com o título de verdade.
  useEffect(() => {
    if (sessions) setOptimistic((prev) => prev.filter((o) => !sessions.some((s) => s.id === o.id)));
  }, [sessions]);

  // Trocar de filtro muda o escopo → zera as otimistas (a lista real do novo
  // escopo assume) e recolhe a lista.
  useEffect(() => {
    setOptimistic([]);
    setExpanded(false);
  }, [filter]);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  const pick = useCallback(
    (id: string, proj?: string | null) => {
      onNavigate?.();
      // Sessão aninhada abre com o contexto do projeto dela no chip.
      const p = proj ? `project=${encodeURIComponent(proj)}&` : "";
      navigate(`/chat?${p}resume=${encodeURIComponent(id)}`);
    },
    [navigate, onNavigate],
  );

  // ── Ações do menu (todas em endpoints existentes) ────────────────────
  const openInNewTab = useCallback((id: string) => {
    window.open(`/chat?resume=${encodeURIComponent(id)}`, "_blank", "noopener");
  }, []);

  const copySessionId = useCallback(
    (id: string) => {
      navigator.clipboard
        .writeText(id)
        .then(() => showToast(t.chat.idCopied, "success"))
        .catch(() => showToast(t.chat.copyIdFailed, "error"));
    },
    [showToast, t.chat.idCopied, t.chat.copyIdFailed],
  );

  // Ramificar uma sessão que não está necessariamente aberta agora: a RPC
  // session.branch precisa de uma conexão de gateway ao vivo (esta sidebar é
  // REST-only) — então navega pro resume com ?branch=1, e o NativeChatPage
  // dispara branchChat() assim que conecta (mesmo padrão do ?new=1).
  const branchSession = useCallback(
    (id: string) => {
      onNavigate?.();
      const proj = activeProject ? `project=${encodeURIComponent(activeProject)}&` : "";
      navigate(`/chat?${proj}resume=${encodeURIComponent(id)}&branch=1`);
    },
    [activeProject, navigate, onNavigate],
  );

  const exportSession = useCallback(
    async (id: string) => {
      try {
        // Mesmo fluxo da SessionsPage: fetch autenticado → blob → download.
        const res = await fetch(api.exportSessionUrl(id), {
          credentials: "include",
          headers: {
            "X-Wayne-Session-Token":
              (window as unknown as { __WAYNE_SESSION_TOKEN__?: string })
                .__WAYNE_SESSION_TOKEN__ ?? "",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `session-${id}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      }
    },
    [showToast, t.status.error],
  );

  const setArchived = useCallback(
    async (id: string, archived: boolean) => {
      try {
        await api.setSessionArchived(id, archived);
        showToast(archived ? t.chat.archived : t.chat.restored, "success");
        reload();
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      }
    },
    [showToast, t.chat.archived, t.chat.restored, t.status.error, reload],
  );

  const taskDelete = useConfirmDelete<string>({
    onDelete: useCallback(
      async (id: string) => {
        try {
          await api.deleteSession(id);
          reload();
        } catch (e) {
          showToast(`${t.status.error}: ${e}`, "error");
          throw e;
        }
      },
      [reload, showToast, t.status.error],
    ),
  });

  // "Arquivar sessões" do projeto — soft-archive em LOTE (PATCH nativo por
  // sessão; não existe bulk no backend). 200 cobre qualquer projeto real.
  const archiveProjectChats = useCallback(
    async (slug: string) => {
      if (!projRoot) return;
      try {
        const res = await api.getSessions(200, 0, "", "recent", {
          cwdPrefix: projectCwd(projRoot, slug),
        });
        await Promise.all(
          (res.sessions ?? []).map((s) => api.setSessionArchived(s.id, true).catch(() => {})),
        );
        showToast(t.chat.sessionsArchivedToast, "success");
        reload();
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      }
    },
    [projRoot, reload, showToast, t.chat.sessionsArchivedToast, t.status.error],
  );

  // Remover projeto = arquiva as sessões dele + apaga a pasta (recursivo).
  // Sem isso as sessões ficariam órfãs poluindo "Recentes".
  const projectDelete = useConfirmDelete<string>({
    onDelete: useCallback(
      async (slug: string) => {
        try {
          if (projRoot) {
            const res = await api.getSessions(200, 0, "", "recent", {
              cwdPrefix: projectCwd(projRoot, slug),
            });
            await Promise.all(
              (res.sessions ?? []).map((s) => api.setSessionArchived(s.id, true).catch(() => {})),
            );
          }
          await api.deleteFile(`${PROJECTS_DIR}/${slug}`, true);
          loadProjects();
          reload();
          if (activeProject === slug) navigate("/chat?new=1");
        } catch (e) {
          showToast(`${t.status.error}: ${e}`, "error");
          throw e;
        }
      },
      [projRoot, loadProjects, reload, activeProject, navigate, showToast, t.status.error],
    ),
  });

  const startRename = useCallback(
    (s: SessionInfo) => {
      setRenamingId(s.id);
      setRenameValue(s.title && s.title !== "Untitled" ? s.title : "");
    },
    [],
  );

  const submitRename = useCallback(async () => {
    if (!renamingId) return;
    const id = renamingId;
    const title = renameValue.trim();
    setRenamingId(null);
    try {
      await api.renameSession(id, title);
      showToast(t.chat.renamed, "success");
      reload();
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    }
  }, [renamingId, renameValue, reload, showToast, t.chat.renamed, t.status.error]);

  const menuSession = rowMenu ? sessions?.find((s) => s.id === rowMenu.id) : undefined;

  const FILTER_LABEL: Record<TaskFilter, string> = {
    none: t.chat.filterNone,
    scheduled: t.chat.filterScheduled,
    archived: t.chat.filterArchived,
  };

  // Lista renderizada = otimistas (só na visão "recentes") no topo + as reais do
  // REST, sem duplicar id. Otimistas já persistidas foram dropadas no effect.
  const base = sessions ?? [];
  const merged =
    filter === "none"
      ? [...optimistic, ...base.filter((s) => !optimistic.some((o) => o.id === s.id))]
      : base;

  // ── Agrupamento por projeto (estrutura Hermes desktop): cada linha traz o
  // cwd — as de projects/<slug> aninham no projeto; o resto cai em Recentes.
  const projPrefix = projRoot ? `${projRoot.replace(/\/$/, "")}/${PROJECTS_DIR}/` : null;
  const projectOf = (s: SessionInfo): string | null => {
    if (!s.cwd || !projPrefix || !s.cwd.startsWith(projPrefix)) return null;
    return s.cwd.slice(projPrefix.length).split("/")[0] || null;
  };
  const knownProjects = new Set(projects ?? []);
  const byProject = new Map<string, SessionInfo[]>();
  const general: SessionInfo[] = [];
  for (const s of merged) {
    const slug = projectOf(s);
    // Projeto apagado → a sessão volta pra Recentes (melhor visível que sumida).
    if (slug && knownProjects.has(slug)) {
      const arr = byProject.get(slug);
      if (arr) arr.push(s);
      else byProject.set(slug, [s]);
    } else general.push(s);
  }
  // Fixadas flutuam pro topo DENTRO do seu grupo — igual ao desktop.
  const pinnedFirst = (list: SessionInfo[]) => [
    ...list.filter((s) => isPinned(s.id)),
    ...list.filter((s) => !isPinned(s.id)),
  ];
  const orderedProjects = [
    ...(projects ?? []).filter((p) => isProjectPinned(p)),
    ...(projects ?? []).filter((p) => !isProjectPinned(p)),
  ];
  const visible = pinnedFirst(general);
  // Colapsada: só as COLLAPSED_COUNT mais recentes; o resto atrás de "Mostrar
  // mais X". As otimistas ficam no topo, então nunca são cortadas.
  const shown = expanded ? visible : visible.slice(0, COLLAPSED_COUNT);
  const hiddenCount = visible.length - shown.length;
  const chatMenuSession = chatMenu ? merged.find((s) => s.id === chatMenu.id) : undefined;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col border-t border-current/10 pt-2.5",
        collapsed && "lg:hidden",
      )}
    >
      {/* ── Projetos (workspaces reais — pastas em projects/) ── */}
      <div className="flex items-center justify-between gap-1 px-5 pb-1">
        <span className="font-sans text-display text-xs tracking-[0.12em] text-text-tertiary">
          {t.chat.projects}
        </span>
        <button
          type="button"
          onClick={openNewProject}
          aria-label={t.chat.newProject}
          title={t.chat.newProject}
          className="rounded p-1 text-text-tertiary transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-2 pb-2">
        {orderedProjects.map((p) => {
          const isActive = p === activeProject;
          const chats = pinnedFirst(byProject.get(p) ?? []).slice(0, PROJECT_CHAT_COUNT);
          return (
            <div key={p} className="mb-0.5">
              {/* Linha do projeto + "…" (fixar/Arquivos/arquivar/remover) */}
              <div
                className={cn(
                  "group relative flex items-center rounded-lg transition-colors",
                  isActive && inProjectHome
                    ? "bg-midground/10 text-foreground"
                    : "text-text-secondary hover:bg-midground/5 hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => pickProject(p)}
                  aria-current={isActive ? "true" : undefined}
                  title={projectDisplayName(p)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2.5 text-left text-sm"
                >
                  {/* Emoji do sidecar, senão o ícone de pasta; cor = tinta. */}
                  {getProjectMetaCached(p).icon ? (
                    <span className="grid h-4 w-4 shrink-0 place-items-center text-[13px] leading-none">
                      {getProjectMetaCached(p).icon}
                    </span>
                  ) : (
                    <FolderClosed
                      className="h-4 w-4 shrink-0 opacity-60"
                      style={projectColorHex(p) ? { color: projectColorHex(p)!, opacity: 1 } : undefined}
                    />
                  )}
                  <span className={cn("min-w-0 flex-1 truncate", isActive && "font-medium")}>
                    {projectDisplayName(p)}
                  </span>
                  {projectColorHex(p) && getProjectMetaCached(p).icon && (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: projectColorHex(p)! }}
                    />
                  )}
                  {isProjectPinned(p) && (
                    <Pin className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  aria-label="…"
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    setProjMenu({ id: p, x: r.right, y: r.bottom + 4 });
                  }}
                  className={cn(
                    "mr-1 shrink-0 rounded p-1 text-text-tertiary transition-all hover:text-foreground",
                    projMenu?.id === p
                      ? "opacity-100"
                      : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>

              {/* Sessões do projeto, aninhadas (idade visível; "…" no hover
                  com menu reduzido fixar/arquivar — espelho Hermes desktop) */}
              {chats.length === 0 ? (
                sessions !== null && (
                  <div className="py-1 pl-9 pr-2.5 text-xs text-text-tertiary/80">
                    {t.chat.projectNoSessions}
                  </div>
                )
              ) : (
                chats.map((s) => {
                  const isActiveRow = s.id === activeId;
                  const label = rowLabel(s, t.sessions.untitledSession);
                  const age = timeAgoShort(s.last_active || s.started_at, {
                    ageNow: t.chat.ageNow,
                    ageMin: t.chat.ageMin,
                    ageHour: t.chat.ageHour,
                    ageDay: t.chat.ageDay,
                  });
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "group relative flex items-center rounded-lg transition-colors",
                        isActiveRow
                          ? "bg-midground/10 text-foreground"
                          : "text-text-secondary hover:bg-midground/5 hover:text-foreground",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => pick(s.id, p)}
                        aria-current={isActiveRow ? "true" : undefined}
                        title={`${label} · ${age}`}
                        className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-9 pr-14 text-left text-[13px]"
                      >
                        {liveState[s.id] === "working" ? (
                          <span className="relative grid h-3.5 w-3.5 shrink-0 place-items-center">
                            <span className="absolute h-2 w-2 animate-ping rounded-full bg-live/40" />
                            <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
                          </span>
                        ) : liveState[s.id] === "attention" ? (
                          <span className="grid h-3.5 w-3.5 shrink-0 place-items-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-warning shadow-[0_0_6px_1px_var(--color-warning)]" />
                          </span>
                        ) : isPinned(s.id) ? (
                          <Pin className="h-3 w-3 shrink-0 opacity-50" />
                        ) : null}
                        <span
                          className={cn("min-w-0 flex-1 truncate", isActiveRow && "font-medium")}
                        >
                          {label}
                        </span>
                      </button>
                      {chatMenu?.id !== s.id && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute right-8 shrink-0 text-[10px] tabular-nums text-text-tertiary transition-opacity group-hover:opacity-0"
                        >
                          {age}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label="…"
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = e.currentTarget.getBoundingClientRect();
                          setChatMenu({ id: s.id, x: r.right, y: r.bottom + 4 });
                        }}
                        className={cn(
                          "mr-1 shrink-0 rounded p-1 text-text-tertiary transition-all hover:text-foreground",
                          chatMenu?.id === s.id
                            ? "opacity-100"
                            : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                        )}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-1 px-5 pb-1">
        <span className="font-sans text-display text-xs tracking-[0.12em] text-text-tertiary">
          {t.chat.recents}
        </span>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={reload}
            aria-label={t.common.refresh}
            title={t.common.refresh}
            className="rounded p-1 text-text-tertiary transition-colors hover:text-foreground"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setFilterMenuAt({ x: r.right, y: r.bottom + 4 });
            }}
            aria-label={t.chat.filterBy}
            title={`${t.chat.filterBy}: ${FILTER_LABEL[filter]}`}
            className={cn(
              "rounded p-1 transition-colors hover:text-foreground",
              filter === "none" ? "text-text-tertiary" : "text-live",
            )}
          >
            <ListFilter className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      <div className="min-h-0 overflow-y-auto px-2 pb-2">
        {sessions === null && optimistic.length === 0 ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
          </div>
        ) : visible.length === 0 ? (
          <div className="px-3 py-3 text-xs text-text-tertiary">
            {t.sessions.noSessions}
          </div>
        ) : (
          shown.map((s) => {
            const isActive = s.id === activeId;
            const label = rowLabel(s, t.sessions.untitledSession);
            const pinned = isPinned(s.id);
            const RowIcon = pinned ? Pin : s.source === "cron" ? Clock : MessageSquare;
            const age = timeAgoShort(s.last_active || s.started_at, {
              ageNow: t.chat.ageNow,
              ageMin: t.chat.ageMin,
              ageHour: t.chat.ageHour,
              ageDay: t.chat.ageDay,
            });
            if (renamingId === s.id) {
              return (
                <input
                  key={s.id}
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => void submitRename()}
                  className="mx-0.5 my-px w-[calc(100%-4px)] rounded-lg border border-live/50 bg-background px-2.5 py-1.5 text-sm text-foreground outline-none"
                />
              );
            }
            return (
              <div
                key={s.id}
                className={cn(
                  "group relative flex items-center rounded-lg transition-colors",
                  isActive
                    ? "bg-midground/10 text-foreground"
                    : "text-text-secondary hover:bg-midground/5 hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => pick(s.id)}
                  aria-current={isActive ? "true" : undefined}
                  title={`${label} · ${age}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2.5 text-left text-sm"
                >
                  {liveState[s.id] === "working" ? (
                    <span className="relative grid h-4 w-4 shrink-0 place-items-center">
                      <span className="absolute h-2 w-2 animate-ping rounded-full bg-live/40" />
                      <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
                    </span>
                  ) : liveState[s.id] === "attention" ? (
                    <span className="grid h-4 w-4 shrink-0 place-items-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-warning shadow-[0_0_6px_1px_var(--color-warning)]" />
                    </span>
                  ) : (
                    <RowIcon className="h-4 w-4 shrink-0 opacity-60" />
                  )}
                  <span className={cn("min-w-0 flex-1 truncate", isActive && "font-medium")}>
                    {label}
                  </span>
                </button>
                {/* Idade compacta ("43m"/"2h"/"3d") — some no hover, igual ao
                    desktop; escondida quando o menu "…" está aberto (o botão
                    ocupa o mesmo canto). */}
                {rowMenu?.id !== s.id && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-8 shrink-0 text-[10px] tabular-nums text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    {age}
                  </span>
                )}
                <button
                  type="button"
                  aria-label="…"
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    setRowMenu({ id: s.id, x: r.right, y: r.bottom + 4 });
                  }}
                  className={cn(
                    "mr-1 shrink-0 rounded p-1 text-text-tertiary transition-all hover:text-foreground",
                    rowMenu?.id === s.id
                      ? "opacity-100"
                      : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}

        {/* "Mostrar mais X" / "Mostrar menos" (padrão Claude) — só quando há
            mais tarefas do que o teto colapsado. */}
        {visible.length > COLLAPSED_COUNT && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-text-tertiary transition-colors hover:bg-midground/5 hover:text-foreground"
          >
            {expanded ? t.chat.showLess : `${t.chat.showMore} ${hiddenCount}`}
          </button>
        )}
      </div>

      {/* ── Menu "…" da tarefa ── */}
      {rowMenu && menuSession && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setRowMenu(null)}
            aria-hidden
          />
          <div
            role="menu"
            data-menu-root="sb-row"
            className="fixed z-50 w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl"
            style={{
              left: Math.max(8, Math.min(rowMenu.x - 224, window.innerWidth - 232)),
              top: Math.min(rowMenu.y, window.innerHeight - 360),
            }}
          >
            <MenuItem
              icon={Pin}
              label={isPinned(menuSession.id) ? t.chat.unpin : t.chat.pin}
              onClick={() => {
                setRowMenu(null);
                togglePin(menuSession.id);
              }}
            />
            <MenuItem
              icon={Copy}
              label={t.chat.copyId}
              onClick={() => {
                setRowMenu(null);
                copySessionId(menuSession.id);
              }}
            />
            <MenuItem
              icon={Pencil}
              label={t.chat.rename}
              onClick={() => {
                setRowMenu(null);
                startRename(menuSession);
              }}
            />
            <MenuItem
              icon={ExternalLink}
              label={t.chat.openNewTab}
              onClick={() => {
                setRowMenu(null);
                openInNewTab(menuSession.id);
              }}
            />
            <MenuItem
              icon={GitBranch}
              label={t.chat.branchChat}
              onClick={() => {
                setRowMenu(null);
                branchSession(menuSession.id);
              }}
            />
            <MenuItem
              icon={Download}
              label={t.chat.export}
              onClick={() => {
                setRowMenu(null);
                void exportSession(menuSession.id);
              }}
            />
            {filter === "archived" ? (
              <MenuItem
                icon={ArchiveRestore}
                label={t.chat.restore}
                onClick={() => {
                  setRowMenu(null);
                  void setArchived(menuSession.id, false);
                }}
              />
            ) : (
              <MenuItem
                icon={Archive}
                label={t.chat.archive}
                onClick={() => {
                  setRowMenu(null);
                  void setArchived(menuSession.id, true);
                }}
              />
            )}
            <div className="mx-2 my-1 h-px bg-border" />
            <MenuItem
              icon={Trash2}
              danger
              label={t.common.delete}
              onClick={() => {
                setRowMenu(null);
                taskDelete.requestDelete(menuSession.id);
              }}
            />
          </div>
        </>
      )}

      {/* ── Menu "…" do PROJETO (fixar/Arquivos/arquivar sessões/remover) ── */}
      {projMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setProjMenu(null)}
            aria-hidden
          />
          <div
            role="menu"
            data-menu-root="sb-proj"
            className="fixed z-50 w-60 rounded-xl border border-border bg-card p-1.5 shadow-xl"
            style={{
              left: Math.max(8, Math.min(projMenu.x - 240, window.innerWidth - 248)),
              top: Math.min(projMenu.y, window.innerHeight - 240),
            }}
          >
            <MenuItem
              icon={Pencil}
              label={t.chat.editProject}
              onClick={() => {
                const slug = projMenu.id;
                setProjMenu(null);
                setEditingProject(slug);
              }}
            />
            <MenuItem
              icon={Pin}
              label={isProjectPinned(projMenu.id) ? t.chat.unpinProject : t.chat.pinProject}
              onClick={() => {
                const slug = projMenu.id;
                setProjMenu(null);
                toggleProjectPin(slug);
              }}
            />
            <MenuItem
              icon={FolderOpen}
              label={t.chat.openInFilesApp}
              onClick={() => {
                const slug = projMenu.id;
                setProjMenu(null);
                onNavigate?.();
                navigate(`/files?path=${encodeURIComponent(`${PROJECTS_DIR}/${slug}`)}`);
              }}
            />
            <MenuItem
              icon={Archive}
              label={t.chat.archiveChats}
              onClick={() => {
                const slug = projMenu.id;
                setProjMenu(null);
                void archiveProjectChats(slug);
              }}
            />
            <div className="mx-2 my-1 h-px bg-border" />
            <MenuItem
              icon={Trash2}
              danger
              label={t.chat.removeProject}
              onClick={() => {
                const slug = projMenu.id;
                setProjMenu(null);
                projectDelete.requestDelete(slug);
              }}
            />
          </div>
        </>
      )}

      {/* ── Menu "…" da sessão ANINHADA — só fixar/arquivar (Hermes) ── */}
      {chatMenu && chatMenuSession && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setChatMenu(null)}
            aria-hidden
          />
          <div
            role="menu"
            data-menu-root="sb-chat"
            className="fixed z-50 w-52 rounded-xl border border-border bg-card p-1.5 shadow-xl"
            style={{
              left: Math.max(8, Math.min(chatMenu.x - 208, window.innerWidth - 216)),
              top: Math.min(chatMenu.y, window.innerHeight - 130),
            }}
          >
            <MenuItem
              icon={Pin}
              label={isPinned(chatMenuSession.id) ? t.chat.unpin : t.chat.pin}
              onClick={() => {
                const id = chatMenuSession.id;
                setChatMenu(null);
                togglePin(id);
              }}
            />
            {chatMenuSession.archived ? (
              <MenuItem
                icon={ArchiveRestore}
                label={t.chat.restore}
                onClick={() => {
                  const id = chatMenuSession.id;
                  setChatMenu(null);
                  void setArchived(id, false);
                }}
              />
            ) : (
              <MenuItem
                icon={Archive}
                label={t.chat.archive}
                onClick={() => {
                  const id = chatMenuSession.id;
                  setChatMenu(null);
                  void setArchived(id, true);
                }}
              />
            )}
          </div>
        </>
      )}

      {/* ── Menu do filtro ── */}
      {filterMenuAt && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setFilterMenuAt(null)}
            aria-hidden
          />
          <div
            role="menu"
            data-menu-root="sb-filter"
            className="fixed z-50 w-48 rounded-xl border border-border bg-card p-1.5 shadow-xl"
            style={{
              left: Math.max(8, Math.min(filterMenuAt.x - 192, window.innerWidth - 200)),
              top: filterMenuAt.y,
            }}
          >
            <div className="px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">
              {t.chat.filterBy}
            </div>
            {(["none", "scheduled", "archived"] as TaskFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="menuitemradio"
                aria-checked={filter === f}
                onClick={() => {
                  setFilter(f);
                  setFilterMenuAt(null);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
              >
                {FILTER_LABEL[f]}
                {filter === f && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Modal "Novo projeto" (paridade com o desktop) ── */}
      {creatingProject && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={closeNewProject} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.chat.newProjectTitle}
            className="fixed left-1/2 top-1/2 z-50 w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">{t.chat.newProjectTitle}</h2>
              <button
                type="button"
                onClick={closeNewProject}
                aria-label={t.common.cancel}
                className="shrink-0 rounded p-1 text-text-tertiary transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-xs text-text-tertiary">{t.chat.newProjectDesc}</p>

            <input
              autoFocus
              value={newProject.name}
              placeholder={t.chat.namePlaceholder}
              onChange={(e) => setNewProject((d) => ({ ...d, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !newProject.addingFolder) void submitNewProject();
                if (e.key === "Escape") closeNewProject();
              }}
              className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-live/50"
            />

            <div className="mb-4">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                {t.chat.foldersLabel}
              </span>
              {newProject.folders.length === 0 ? (
                <span className="text-xs text-text-tertiary">{t.chat.noFoldersAdded}</span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {newProject.folders.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs text-foreground"
                    >
                      <FolderClosed className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                      <span className="min-w-0 flex-1 truncate" title={f}>
                        {f}
                      </span>
                      <button
                        type="button"
                        aria-label={t.chat.removeFolder}
                        onClick={() =>
                          setNewProject((d) => ({ ...d, folders: d.folders.filter((x) => x !== f) }))
                        }
                        className="shrink-0 text-text-tertiary transition-colors hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {newProject.addingFolder ? (
                <input
                  autoFocus
                  value={newProject.folderDraft}
                  placeholder={t.chat.addFolder}
                  onChange={(e) => setNewProject((d) => ({ ...d, folderDraft: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setNewProject((d) => {
                        const v = d.folderDraft.trim();
                        return {
                          ...d,
                          folders: v && !d.folders.includes(v) ? [...d.folders, v] : d.folders,
                          folderDraft: "",
                          addingFolder: false,
                        };
                      });
                    }
                    if (e.key === "Escape") {
                      setNewProject((d) => ({ ...d, folderDraft: "", addingFolder: false }));
                    }
                  }}
                  onBlur={() =>
                    setNewProject((d) => {
                      const v = d.folderDraft.trim();
                      return {
                        ...d,
                        folders: v && !d.folders.includes(v) ? [...d.folders, v] : d.folders,
                        folderDraft: "",
                        addingFolder: false,
                      };
                    })
                  }
                  className="mt-1.5 w-full rounded-md border border-live/50 bg-background px-2 py-1 text-xs text-foreground outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setNewProject((d) => ({ ...d, addingFolder: true }))}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-foreground"
                >
                  <Plus className="h-3 w-3" /> {t.chat.addFolder}
                </button>
              )}
            </div>

            <div className="mb-5">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                {t.chat.ideaLabel}
              </span>
              <textarea
                value={newProject.idea}
                placeholder={t.chat.ideaPlaceholder}
                onChange={(e) => setNewProject((d) => ({ ...d, idea: e.target.value }))}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-live/50"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {projectTemplates.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => setNewProject((d) => ({ ...d, idea: tpl.idea }))}
                    className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-foreground/25 hover:bg-muted hover:text-foreground"
                  >
                    <span aria-hidden>{tpl.emoji}</span>
                    {tpl.label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label={t.chat.shuffleIdeas}
                  title={t.chat.shuffleIdeas}
                  onClick={() => setProjectTemplates(randomIdeaTemplates())}
                  className="rounded p-1 text-text-tertiary transition-colors hover:text-foreground"
                >
                  <Shuffle className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeNewProject}
                className="rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-muted"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={!newProject.name.trim() || creatingProjectBusy}
                onClick={() => void submitNewProject()}
                className="rounded-lg bg-foreground px-3.5 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {t.common.create}
              </button>
            </div>
          </div>
        </>
      )}

      <DeleteConfirmDialog
        open={taskDelete.isOpen}
        onCancel={taskDelete.cancel}
        onConfirm={taskDelete.confirm}
        title={t.sessions.confirmDeleteTitle}
        description={t.sessions.confirmDeleteMessage}
        loading={taskDelete.isDeleting}
      />

      <DeleteConfirmDialog
        open={projectDelete.isOpen}
        onCancel={projectDelete.cancel}
        onConfirm={projectDelete.confirm}
        title={t.chat.confirmRemoveProjectTitle}
        description={t.chat.confirmRemoveProjectMessage}
        loading={projectDelete.isDeleting}
      />

      {editingProject && (
        <ProjectEditModal
          slug={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={() => showToast(t.chat.renamed, "success")}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}

/** Ícone do item de nav "Nova tarefa" — exportado p/ o App montar o item. */
export const NewTaskIcon = SquarePen;
