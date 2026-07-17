/**
 * SidebarTasks — Projects + Recents of the GLOBAL SIDEBAR (Hermes desktop
 * structure, decision 10/07): each project lists its OWN nested sessions
 * (grouped by the cwd that GET /api/sessions already returns on every row),
 * with a project "…" menu (pin/open in Files/archive sessions/remove) and a
 * reduced menu per nested session (pin/archive). "Recentes" = sessions with
 * no project, with the full menu and the filter.
 *
 * Curation rule: EVERYTHING here runs on endpoints the backend ALREADY has —
 * nothing invented:
 *   list/filter     GET  /api/sessions (order=recent, source, exclude_sources,
 *                        archived=only — soft-archive already existed for desktop)
 *   rename          PATCH /api/sessions/{id} {title}
 *   archive         PATCH /api/sessions/{id} {archived}
 *   export          GET  /api/sessions/{id}/export (same flow as SessionsPage)
 *   delete          DELETE /api/sessions/{id}
 *   open in a tab   window.open(/chat?resume=…) — pure frontend
 *   branch          session.branch (RPC) — via /chat?resume=…&branch=1, the
 *                   NativeChatPage fires on connect (there is no gateway here)
 *   pin             client-side only (localStorage) — same as the desktop
 *                   (apps/desktop `$pinnedSessionIds`, a `persistentAtom`);
 *                   there is no pin in the backend, nothing to reuse there
 * Share-link/Move to project do NOT exist in the backend → out.
 *
 * The menu uses position:fixed to escape the sidebar's overflow-y-auto.
 */
import {
  Archive,
  ArchiveRestore,
  Clock,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  FolderClosed,
  FolderGit2,
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
import {
  api,
  type ProjectRow,
  type ProjectsTreeResponse,
  type SessionInfo,
} from "@/lib/api";
import {
  LOCAL_PATH_RE,
  PROJECTS_DIR,
  getFilesRoot,
  isDesktopDefaultWorkspacePath,
  isLocalEngine,
  projectCwd,
  registerFolderProject,
  registerProjectRow,
  slugifyProject,
} from "@/lib/projects";
import { cloudBridge, cloudGetJson } from "@/lib/cloudSession";
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
/** Tasks visible before "Mostrar mais X" (Claude pattern). */
const COLLAPSED_COUNT = 10;
/** Nested sessions visible per project (Hermes desktop benchmark). */
const PROJECT_CHAT_COUNT = 3;

/**
 * Split a path on EITHER separator — the same rule the backend's grouping index
 * uses (tui_gateway/project_tree._segments). Comparing segments instead of raw
 * strings is what lets one rule match a POSIX cloud path and a Windows path
 * from the user's machine without knowing which is which.
 */
const pathSegments = (path: string): string[] =>
  (path || "").replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);

/** A session row + its nesting depth (0 = flat, 1+ = branch under its parent). */
interface SessionEntry {
  session: SessionInfo;
  depth: number;
}

/**
 * Nest branch/fork children under their parent when BOTH sit in the same
 * visible list — the Hermes desktop pattern (flattenSessionsWithBranches):
 * a child whose parent is absent from the list renders flat, never orphaned
 * with a dangling connector. Children keep the list's (recency) order.
 */
function flattenWithBranches(list: SessionInfo[]): SessionEntry[] {
  const ids = new Set(list.map((s) => s.id));
  const children = new Map<string, SessionInfo[]>();
  for (const s of list) {
    const pid = s.parent_session_id;
    if (pid && pid !== s.id && ids.has(pid)) {
      const arr = children.get(pid);
      if (arr) arr.push(s);
      else children.set(pid, [s]);
    }
  }
  const claimed = new Set<string>();
  children.forEach((kids) => kids.forEach((k) => claimed.add(k.id)));
  const out: SessionEntry[] = [];
  const emitted = new Set<string>();
  const append = (s: SessionInfo, depth: number) => {
    if (emitted.has(s.id)) return;
    emitted.add(s.id);
    out.push({ session: s, depth });
    for (const kid of children.get(s.id) ?? []) append(kid, depth + 1);
  };
  for (const s of list) if (!claimed.has(s.id)) append(s, 0);
  // Parent cycles (corrupt data) would leave every member "claimed" — emit
  // them flat rather than dropping rows.
  for (const s of list) if (!emitted.has(s.id)) out.push({ session: s, depth: 0 });
  return out;
}

type TaskFilter = "none" | "scheduled" | "archived";

const FILTER_OPTS: Record<
  TaskFilter,
  { source?: string; excludeSources?: string; archived?: "only"; minMessages?: number }
> = {
  // "Nenhum" = clean recents — same scope as the desktop (excludes cron) and no
  // empty sessions (opening /chat creates a session; it only becomes a "task"
  // once you speak).
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

// Localized compact age: now shared in lib/utils.timeAgoShort (Onda 0) — the
// chat uses the same one.

interface Anchor {
  id: string;
  x: number;
  y: number;
}

/** Draft of the "Novo projeto" modal — name + optional subfolders + idea. */
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
  /** Collapsed desktop sidebar (icons only) — the section disappears. */
  collapsed: boolean;
  /** Closes the mobile drawer after navigating. */
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const { toast, showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const onChat = location.pathname === "/chat";
  const activeId = onChat ? searchParams.get("resume") : null;
  // Selected project (workspace) — lives in the chat URL (?project=…).
  const activeProject = onChat ? searchParams.get("project") : null;
  // Only HIGHLIGHT the project in the sidebar when we are in ITS SPACE (?home=1).
  // On the "Nova sessão" hero (?project=X without home) the one that lights up
  // is the nav's "Nova sessão" item — otherwise the project stayed lit and gave
  // the odd feeling Leonardo pointed out (10/07).
  const inProjectHome = onChat && searchParams.has("home");

  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  // S2 slice 1 ("one product, two computers"): on the local-engine desktop the
  // CLOUD brain's sessions merge into Recents through the shell bridge. null =
  // bridge absent / signed out / timed out — the list is local-only and the
  // screen says nothing (fail-open by contract).
  const [cloudSessions, setCloudSessions] = useState<SessionInfo[] | null>(null);
  // Server-decided grouping (GET /api/projects/tree): which sessions each
  // project claims (scoped ids) + per-project previews/counts. null = not
  // loaded or failed → the client-side grouping below takes over (plan B).
  const [tree, setTree] = useState<ProjectsTreeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("none");
  const [reloadNonce, setReloadNonce] = useState(0);
  // Collapses the list: shows only the N most recent; the rest behind "Mostrar
  // mais X" (Claude pattern). Resets when the filter/project changes.
  const [expanded, setExpanded] = useState(false);
  // Just-started tasks (OPTIMISTIC insert): they show up the moment the user
  // sends the 1st msg (wayne:session-started event), before the server persists/
  // titles it — ChatGPT/Manus pattern. It goes away when REST reloads and brings
  // the real one.
  const [optimistic, setOptimistic] = useState<SessionInfo[]>([]);
  // Pinned — client-side (localStorage), see lib/pinned-sessions.ts. The tick
  // forces a re-render/re-ordering of the list when the set changes (isPinned()
  // reads the module cache directly, with no React state — it only needs a
  // re-render).
  const [, setPinTick] = useState(0);
  useEffect(() => onPinnedChange(() => setPinTick((n) => n + 1)), []);
  useEffect(() => onProjectPinnedChange(() => setPinTick((n) => n + 1)), []);
  // Display metadata (name/emoji/color) from the sidecar — the same tick forces
  // a re-render when the cache arrives/changes. See lib/project-meta.ts.
  useEffect(() => onProjectMetaChange(() => setPinTick((n) => n + 1)), []);
  // Project being edited (emoji+name+color modal).
  const [editingProject, setEditingProject] = useState<string | null>(null);

  // ── Projects = first-class ROWS that own folder paths (the Hermes model,
  // wayne_cli/projects_db). A cloud project's folder lives under projects/; a
  // Local (desktop) project's folder lives on the user's machine. Same object,
  // one list, one history — the folder decides where the agent runs, so there
  // is nothing else to pick.
  const [projectRows, setProjectRows] = useState<ProjectRow[] | null>(null);
  /** Slugs, in row order — what the rows below render and the meta sidecar keys on. */
  const [projects, setProjects] = useState<string[] | null>(null);
  const [projRoot, setProjRoot] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingProjectBusy, setCreatingProjectBusy] = useState(false);
  // "Novo projeto" modal (parity with the desktop): name + optional subfolders
  // (mkdir inside the project — our model has neither Electron's native folder
  // picker nor multi-root) + idea (optional, saved in IDEA.md).
  const [newProject, setNewProject] = useState<NewProjectDraft>(EMPTY_PROJECT_DRAFT);
  const [projectTemplates, setProjectTemplates] = useState<ProjectIdeaTemplate[]>(
    () => randomIdeaTemplates(),
  );

  const openNewProject = useCallback(() => {
    setNewProject(EMPTY_PROJECT_DRAFT);
    setProjectTemplates(randomIdeaTemplates());
    setCreatingProject(true);
  }, []);

  // The ProjectPicker's "Começar do zero" (above the composer) reuses THIS rich
  // modal (name+folders+idea) — no duplication. See ProjectPicker.tsx.
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
    void (async () => {
      const root = await getFilesRoot();
      setProjRoot(root);
      try {
        // A project is a ROW that owns folder paths — the Hermes model. That is
        // what makes a cloud folder and a folder on the user's own machine the
        // same kind of thing, so one history covers both. The folders under
        // projects/ are just the cloud ones' storage.
        let rows = (await api.listProjects()).projects;

        // Self-healing backfill: projects born before the row model existed have
        // a folder but no row. Adopt them on sight — POST /api/projects hands
        // back the incumbent when a folder is already owned, so this is safe to
        // repeat and converges after the first load.
        if (root) {
          const owned = new Set(rows.flatMap((r) => r.folders.map((f) => f.path)));
          const folders = await api
            .listFiles(PROJECTS_DIR)
            .then((res) => res.entries.filter((e) => e.is_directory).map((e) => e.name))
            // projects/ may not exist yet — it is created on the 1st "+".
            .catch(() => [] as string[]);
          const orphans = folders.filter((slug) => !owned.has(projectCwd(root, slug)));
          if (orphans.length) {
            await Promise.all(orphans.map((slug) => registerProjectRow(slug)));
            rows = (await api.listProjects()).projects;
          }
        }

        setProjectRows(rows);
        const slugs = rows.map((r) => r.slug);
        setProjects(slugs);
        // Preloads each project's name/emoji/color (sidecar) — it notifies on
        // its own when it arrives and re-renders the list already personalized.
        void loadAllProjectMeta(slugs);
      } catch {
        setProjectRows([]);
        setProjects([]);
      }
    })();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProjects();
  }, [loadProjects]);

  const pickProject = useCallback(
    (name: string) => {
      onNavigate?.();
      // Opens the project SPACE (?home=1). The new-chat screen with the chip is
      // up to the ProjectPicker/Nova tarefa (?project without home).
      navigate(`/chat?project=${encodeURIComponent(name)}&home=1`);
    },
    [navigate, onNavigate],
  );

  // Creates the project (mkdir), optional subfolders (mkdir inside it) and
  // writes IDEA.md if the idea was filled in — parity with the desktop flow
  // (name + folders + idea), all on top of already-existing REST endpoints
  // (createDirectory/uploadFile), with no new RPC/infra.
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
      await registerProjectRow(slug, newProject.name);
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

  // Menus (fixed, to escape the sidebar's overflow).
  const [rowMenu, setRowMenu] = useState<Anchor | null>(null);
  const [filterMenuAt, setFilterMenuAt] = useState<{ x: number; y: number } | null>(null);
  // Projects section menus: the project's "…" (id = slug) and the NESTED
  // session's "…" (reduced menu: pin/archive — decision 10/07, Hermes mirror).
  const [projMenu, setProjMenu] = useState<Anchor | null>(null);
  const [chatMenu, setChatMenu] = useState<Anchor | null>(null);
  // Click outside/Esc close them (global listener — backdrops do not cover the chat).
  useMenuDismiss(!!rowMenu, () => setRowMenu(null), "sb-row");
  useMenuDismiss(!!filterMenuAt, () => setFilterMenuAt(null), "sb-filter");
  useMenuDismiss(!!projMenu, () => setProjMenu(null), "sb-proj");
  useMenuDismiss(!!chatMenu, () => setChatMenu(null), "sb-chat");

  // Inline rename.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const reqRef = useRef(0);
  const load = useCallback(() => {
    const myReq = ++reqRef.current;
    setLoading(true);
    // SINGLE global list — every row carries the cwd. The grouping AUTHORITY
    // is the server tree (fetched below); the client rule only covers
    // optimistic rows and the tree-request-failed fallback.
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
    // The server-decided tree, refreshed in the same beat so both lists stay
    // consistent. Failure → null → the client grouping fallback kicks in.
    api
      .getProjectsTree()
      .then((res) => {
        if (reqRef.current !== myReq) return;
        setTree(res);
      })
      .catch(() => {
        if (reqRef.current !== myReq) return;
        setTree(null);
      });
    // S2: the CLOUD brain's list, same filter options, refreshed on the same
    // beat (this load() already re-runs on navigation/filter/manual refresh —
    // that IS the light cache). 5s deadline + null on any failure = the local
    // list stands alone with zero error on screen.
    if (isLocalEngine() && cloudBridge()) {
      const o = FILTER_OPTS[filter];
      let url = `/api/sessions?limit=${LIMIT}&offset=0&order=recent`;
      if (o.minMessages) url += `&min_messages=${o.minMessages}`;
      if (o.source) url += `&source=${encodeURIComponent(o.source)}`;
      if (o.excludeSources) url += `&exclude_sources=${encodeURIComponent(o.excludeSources)}`;
      if (o.archived) url += `&archived=${o.archived}`;
      void cloudGetJson<{ sessions?: SessionInfo[] }>(url, 5000).then((res) => {
        if (reqRef.current !== myReq) return;
        setCloudSessions(res?.sessions ?? null);
      });
    } else {
      setCloudSessions(null);
    }
  }, [filter]);

  // Reloads when the filter changes, when navigating between conversations (the
  // new task's title materializes on the server) and on the manual trigger.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, reloadNonce, activeId]);

  // The chat auto-titles the session on the 1st turn (session.info) and fires
  // this event — we reload so the live title shows up without switching tabs.
  useEffect(() => {
    const onTitled = () => setReloadNonce((n) => n + 1);
    window.addEventListener("wayne:session-titled", onTitled);
    return () => window.removeEventListener("wayne:session-titled", onTitled);
  }, []);

  // 1st send of a new task (wayne:session-started, fired by the chat hook):
  // inserts the session NOW with the 1st msg as a provisional title. It carries
  // the cwd along — the grouping nests it in the right project (or in Recents).
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

  // LIVE per-session state (Onda 1, desktop pattern): "working" = pulsing dot in
  // place of the icon (agent working), "attention" = amber (waiting for the user
  // to answer approval/clarify). Emitted by useChatSession.
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

  // When REST reloads and already brings the task (now persisted/titled), drops
  // the optimistic version (same id) — the real one takes over, with the real title.
  useEffect(() => {
    if (sessions) setOptimistic((prev) => prev.filter((o) => !sessions.some((s) => s.id === o.id)));
  }, [sessions]);

  // Switching the filter changes the scope → clears the optimistic ones (the real
  // list of the new scope takes over) and collapses the list.
  useEffect(() => {
    setOptimistic([]);
    setExpanded(false);
  }, [filter]);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  const pick = useCallback(
    (id: string, proj?: string | null) => {
      onNavigate?.();
      // A nested session opens with its project's context in the chip.
      const p = proj ? `project=${encodeURIComponent(proj)}&` : "";
      navigate(`/chat?${p}resume=${encodeURIComponent(id)}`);
    },
    [navigate, onNavigate],
  );

  // A CLOUD session opens in the SAME chat UI with the run target pinned to
  // the cloud brain (?run=cloud): resume + history + approvals ride the S1
  // bridge/WS contract (NativeChatPage honors run=cloud on resume).
  const pickCloud = useCallback(
    (id: string) => {
      onNavigate?.();
      navigate(`/chat?resume=${encodeURIComponent(id)}&run=cloud`);
    },
    [navigate, onNavigate],
  );

  // ── Menu actions (all on existing endpoints) ─────────────────────────
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

  // Branching a session that is not necessarily open right now: the
  // session.branch RPC needs a live gateway connection (this sidebar is
  // REST-only) — so it navigates to the resume with ?branch=1, and the
  // NativeChatPage fires branchChat() as soon as it connects (same ?new=1 pattern).
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
        // Same flow as the SessionsPage: authenticated fetch → blob → download.
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

  /** A project owning a folder on the USER's machine (Windows/UNC path): row
   *  operations only — the server must NEVER touch that folder or its chats. */
  const isLocalProject = useCallback(
    (slug: string): boolean => {
      const row = projectRows?.find((r) => r.slug === slug);
      return !!row && row.folders.some((f) => LOCAL_PATH_RE.test(f.path));
    },
    [projectRows],
  );

  // BULK soft-archive of a project's cloud sessions (native PATCH per session;
  // there is no bulk in the backend). 200 covers any real project.
  const archiveSessionsUnder = useCallback(async (cwdPrefix: string) => {
    const res = await api.getSessions(200, 0, "", "recent", { cwdPrefix });
    await Promise.all(
      (res.sessions ?? []).map((s) => api.setSessionArchived(s.id, true).catch(() => {})),
    );
  }, []);

  // The project's "Arquivar" — archives the ROW (POST /api/projects/{id}/
  // archive), so the project leaves the sidebar on every surface. Cloud
  // projects keep the previous behavior on top: their sessions are
  // soft-archived so they don't fall back into "Recentes". Local-folder
  // projects get the row operation ONLY.
  const archiveProjectRow = useCallback(
    async (slug: string) => {
      try {
        const row = projectRows?.find((r) => r.slug === slug);
        if (row && !isLocalProject(slug)) {
          for (const f of row.folders) await archiveSessionsUnder(f.path);
        }
        await api.archiveProject(row?.id ?? slug);
        showToast(t.chat.archived, "success");
        loadProjects();
        reload();
        if (activeProject === slug) navigate("/chat?new=1");
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      }
    },
    [
      projectRows,
      isLocalProject,
      archiveSessionsUnder,
      loadProjects,
      reload,
      activeProject,
      navigate,
      showToast,
      t.chat.archived,
      t.status.error,
    ],
  );

  // Removing a project = deletes the ROW (DELETE /api/projects/{id}). Cloud
  // projects also archive their sessions + delete the projects/<slug> folder
  // (previous behavior — otherwise orphaned sessions pollute "Recentes").
  // Local-folder projects: row only — the folder lives on the user's machine.
  const projectDelete = useConfirmDelete<string>({
    onDelete: useCallback(
      async (slug: string) => {
        try {
          const row = projectRows?.find((r) => r.slug === slug);
          if (!isLocalProject(slug)) {
            if (projRoot) await archiveSessionsUnder(projectCwd(projRoot, slug));
            // The cloud folder may not exist (row-first projects) — the row
            // is the identity now, so a missing folder must not block removal.
            await api.deleteFile(`${PROJECTS_DIR}/${slug}`, true).catch(() => {});
          }
          if (row) await api.deleteProject(row.id);
          loadProjects();
          reload();
          if (activeProject === slug) navigate("/chat?new=1");
        } catch (e) {
          showToast(`${t.status.error}: ${e}`, "error");
          throw e;
        }
      },
      [
        projectRows,
        isLocalProject,
        archiveSessionsUnder,
        projRoot,
        loadProjects,
        reload,
        activeProject,
        navigate,
        showToast,
        t.status.error,
      ],
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

  // Rendered list = optimistic ones (only in the "recents" view) at the top + the
  // real ones from REST, with no duplicate id. Optimistic ones already persisted
  // were dropped in the effect.
  const base = sessions ?? [];
  const merged =
    filter === "none"
      ? [...optimistic, ...base.filter((s) => !optimistic.some((o) => o.id === s.id))]
      : base;

  // ── Grouping by project — the Hermes rule, verbatim: a session belongs to a
  // project when its cwd IS one of the project's folders or sits under it, and
  // the DEEPEST matching folder wins (nested projects resolve to the innermost).
  // Ported from wayne_cli/projects_db.project_for_path + project_tree._FolderIndex.
  //
  // This is deliberately blind to WHERE the folder lives. `/opt/data/projects/x`
  // (cloud) and `C:\DEV\Dute` (the user's machine) group identically, because a
  // project is a row that owns paths — not a directory in our filesystem. That
  // is the whole reason one history can cover web and desktop.
  const folderOwners: {
    path: string;
    segs: string[];
    slug: string;
    /** The desktop's default workspace (~/Work4You) — never a grouping owner. */
    isDefaultWs: boolean;
  }[] = (projectRows ?? [])
    .flatMap((r) =>
      r.folders.map((f) => ({
        path: f.path,
        segs: pathSegments(f.path),
        slug: r.slug,
        isDefaultWs: isDesktopDefaultWorkspacePath(f.path),
      })),
    )
    .filter((o) => o.segs.length > 0);
  const ownerOf = (s: SessionInfo): (typeof folderOwners)[number] | null => {
    if (!s.cwd) return null;
    const segs = pathSegments(s.cwd);
    let best: (typeof folderOwners)[number] | null = null;
    for (const o of folderOwners) {
      if (o.segs.length > segs.length || (best && o.segs.length <= best.segs.length))
        continue;
      if (o.segs.every((seg, i) => seg === segs[i])) best = o;
    }
    return best;
  };
  // Desktop pivot rule (17/07): ~/Work4You (the shell's default workspace) is
  // the ENGINE's execution directory, never an organizing project. A session
  // that would group under it is a FREE chat and belongs in "Recentes" — even
  // when a pre-existing user row still owns that folder (installs from before
  // the rule). The row is the user's, so code never deletes it; the RENDERER
  // simply refuses to group by that folder — which also voids the server
  // tree's claim for those sessions (the tree honors explicit rows, so the
  // defaultWorkspace filter has to live here on the client).
  const inDefaultWorkspace = (s: SessionInfo, owner: (typeof folderOwners)[number] | null) =>
    isDesktopDefaultWorkspacePath(s.cwd) || !!owner?.isDefaultWs;
  const knownProjects = new Set(projects ?? []);
  // ── Server-decided grouping (Onda 1): /api/projects/tree claims sessions
  // for explicit projects (scoped ids) and hands each project its previews +
  // counts. Only the default view uses it — the scheduled/archived filters
  // list session classes the tree deliberately excludes. When the tree failed
  // to load, the ported client rule above is the whole grouping (plan B).
  const serverGrouping = tree !== null && filter === "none";
  const scopedIds = new Set(tree?.scoped_session_ids ?? []);
  const treeNodeByRowId = new Map(
    (tree?.projects ?? []).map((n) => [n.id, n] as const),
  );
  const rowBySlug = new Map((projectRows ?? []).map((r) => [r.slug, r] as const));
  const isOptimistic = (s: SessionInfo) => optimistic.some((o) => o.id === s.id);
  const byProject = new Map<string, SessionInfo[]>();
  const general: SessionInfo[] = [];
  for (const s of merged) {
    const owner = ownerOf(s);
    // Free chat at the default workspace → Recents, never a project (see
    // inDefaultWorkspace above).
    const freeChat = inDefaultWorkspace(s, owner);
    const slug = owner && !owner.isDefaultWs ? owner.slug : null;
    // Project deleted → the session goes back to Recents (better visible than gone).
    const owned = slug && knownProjects.has(slug) ? slug : null;
    if (owned && !freeChat) {
      const arr = byProject.get(owned);
      if (arr) arr.push(s);
      else byProject.set(owned, [s]);
    }
    // Recents = whatever no rendered project claims. Under server grouping
    // the server's claim set is the authority; the client rule still routes
    // rows the server can't know yet (the optimistic inserts) and OVERRULES
    // claims that ride on the default workspace (freeChat).
    const claimed = freeChat
      ? false
      : serverGrouping
        ? scopedIds.has(s.id) || !!owned
        : !!owned;
    if (!claimed) general.push(s);
  }
  // S2 merge: the cloud brain's sessions join Recents by recency, each
  // carrying its origin for the discreet badge. They never belong to a local
  // project row (their cwd lives on the other computer), so Recents is the
  // only insertion point — no concept collision. Local wins an id tie.
  const cloudIds = new Set<string>();
  const generalMerged: SessionInfo[] = [...general];
  for (const s of cloudSessions ?? []) {
    if (merged.some((m) => m.id === s.id)) continue;
    cloudIds.add(s.id);
    generalMerged.push(s);
  }
  if (cloudIds.size) {
    generalMerged.sort(
      (a, b) => (b.last_active || b.started_at) - (a.last_active || a.started_at),
    );
  }
  // Pinned ones float to the top WITHIN their group — same as the desktop.
  const pinnedFirst = (list: SessionInfo[]) => [
    ...list.filter((s) => isPinned(s.id)),
    ...list.filter((s) => !isPinned(s.id)),
  ];
  const orderedProjects = [
    ...(projects ?? []).filter((p) => isProjectPinned(p)),
    ...(projects ?? []).filter((p) => !isProjectPinned(p)),
  ];
  // Branch sessions nest under their parent (└ connector) when both are
  // visible — flatten BEFORE slicing so the pair is never split by the fold.
  const visible = flattenWithBranches(pinnedFirst(generalMerged));
  // Collapsed: only the COLLAPSED_COUNT most recent; the rest behind "Mostrar
  // mais X". The optimistic ones stay at the top, so they are never cut off.
  const shown = expanded ? visible : visible.slice(0, COLLAPSED_COUNT);
  const hiddenCount = visible.length - shown.length;
  // Nested-chat menu target: server previews may list sessions beyond the
  // /api/sessions page, so look them up in the tree too.
  const chatMenuSession = chatMenu
    ? (merged.find((s) => s.id === chatMenu.id) ??
      tree?.projects
        .flatMap((n) => n.previewSessions)
        .find((s) => s.id === chatMenu.id))
    : undefined;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col border-t border-current/10 pt-2.5",
        collapsed && "lg:hidden",
      )}
    >
      {/* ── Projects (real workspaces — folders in projects/) ── */}
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
          // Server grouping: this row's previews come from its tree node;
          // optimistic rows (which the server hasn't persisted yet) are
          // prepended via the client rule so a just-started task shows
          // instantly. Fallback (tree failed / other filters): client rule.
          const node = serverGrouping
            ? treeNodeByRowId.get(rowBySlug.get(p)?.id ?? "")
            : undefined;
          // Server previews minus default-workspace free chats — those live in
          // Recents (the tree honors the row that owns ~/Work4You; the client
          // does not — see inDefaultWorkspace).
          const nodePreviews = (node?.previewSessions ?? []).filter(
            (ps) => !inDefaultWorkspace(ps, ownerOf(ps)),
          );
          const clientChats = pinnedFirst(byProject.get(p) ?? []);
          const chats = flattenWithBranches(
            (node
              ? [
                  ...clientChats.filter(
                    (s) =>
                      isOptimistic(s) &&
                      !nodePreviews.some((ps) => ps.id === s.id),
                  ),
                  ...pinnedFirst(nodePreviews),
                ]
              : clientChats
            ).slice(0, PROJECT_CHAT_COUNT),
          );
          return (
            <div key={p} className="mb-0.5">
              {/* Project row + "…" (pin/Files/archive/remove) */}
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
                  {/* Sidecar emoji, otherwise the folder icon; color = tint. */}
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

              {/* Project sessions, nested (age visible; "…" on hover with the
                  reduced pin/archive menu — Hermes desktop mirror) */}
              {chats.length === 0 ? (
                sessions !== null && (
                  <div className="py-1 pl-9 pr-2.5 text-xs text-text-tertiary/80">
                    {t.chat.projectNoSessions}
                  </div>
                )
              ) : (
                chats.map(({ session: s, depth }) => {
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
                        // Branch sessions indent under their parent (desktop's
                        // └ connector). pl-9 = 36px base.
                        style={depth ? { paddingLeft: `${36 + depth * 14}px` } : undefined}
                      >
                        {depth > 0 && (
                          <span
                            aria-hidden
                            className="shrink-0 font-mono text-[10px] leading-none text-text-tertiary"
                          >
                            └
                          </span>
                        )}
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

        {/* Auto-promoted repo roots (the Hermes desktop pattern: project_tree's
            tier-2 nodes, isAuto=true). They have no row yet, so no meta/menu —
            clicking the header ADOPTS the folder as a real project (idempotent
            projects.create) and enters it. Until adopted, their sessions still
            live here (scoped out of Recentes), so nothing is orphaned. */}
        {serverGrouping &&
          (tree?.projects ?? [])
            // The default workspace never shows as an auto project either (its
            // free chats are routed to Recents by the exact-cwd rule above).
            .filter((n) => n.isAuto && n.path && !isDesktopDefaultWorkspacePath(n.path))
            .map((n) => (
              <div key={n.id} className="mb-0.5">
                <button
                  type="button"
                  title={n.path ?? undefined}
                  onClick={() =>
                    void (async () => {
                      const row = await registerFolderProject(n.path as string, n.label);
                      if (!row) return;
                      showToast(t.chat.projectCreated, "success");
                      loadProjects();
                      reload();
                      pickProject(row.slug);
                    })()
                  }
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-midground/5 hover:text-foreground"
                >
                  <FolderGit2 className="h-4 w-4 shrink-0 opacity-60" />
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                </button>
                {flattenWithBranches(n.previewSessions.slice(0, PROJECT_CHAT_COUNT)).map(
                  ({ session: s, depth }) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pick(s.id)}
                      className="flex w-full items-center gap-2 py-2 pr-3 text-left text-[13px] text-text-secondary transition-colors hover:bg-midground/5 hover:text-foreground"
                      style={{ paddingLeft: `${2.25 + depth * 0.9}rem` }}
                    >
                      {depth > 0 && (
                        <span aria-hidden className="shrink-0 text-text-tertiary/70">
                          └
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {rowLabel(s, t.sessions.untitledSession)}
                      </span>
                    </button>
                  ),
                )}
              </div>
            ))}
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
          shown.map(({ session: s, depth }) => {
            const isActive = s.id === activeId;
            const label = rowLabel(s, t.sessions.untitledSession);
            const pinned = isPinned(s.id);
            // Cloud-brain session (S2): badge + open with ?run=cloud; the "…"
            // menu stays off — its REST operations (PATCH/DELETE) cannot cross
            // the bridge (GET/POST allowlist), and a menu that half-works is a
            // broken promise.
            const fromCloud = cloudIds.has(s.id);
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
                  onClick={() => (fromCloud ? pickCloud(s.id) : pick(s.id))}
                  aria-current={isActive ? "true" : undefined}
                  title={`${label} · ${age}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2.5 text-left text-sm"
                  // Branch sessions indent under their parent (desktop's └
                  // connector). px-2.5 = 10px base.
                  style={depth ? { paddingLeft: `${10 + depth * 14}px` } : undefined}
                >
                  {depth > 0 && (
                    <span
                      aria-hidden
                      className="shrink-0 font-mono text-[10px] leading-none text-text-tertiary"
                    >
                      └
                    </span>
                  )}
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
                  {fromCloud && (
                    <span
                      title={t.chat.cloudOriginTooltip}
                      className="grid shrink-0 place-items-center"
                    >
                      <Cloud className="h-3 w-3 text-text-tertiary" aria-hidden />
                    </span>
                  )}
                </button>
                {/* Compact age ("43m"/"2h"/"3d") — disappears on hover, same as
                    the desktop; hidden when the "…" menu is open (the button
                    takes the same corner). */}
                {rowMenu?.id !== s.id && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-8 shrink-0 text-[10px] tabular-nums text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    {age}
                  </span>
                )}
                {!fromCloud && (
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
                )}
              </div>
            );
          })
        )}

        {/* "Mostrar mais X" / "Mostrar menos" (Claude pattern) — only when there
            are more tasks than the collapsed cap. */}
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

      {/* ── Task "…" menu ── */}
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

      {/* ── PROJECT "…" menu (pin/Files/archive sessions/remove) ── */}
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
              label={t.chat.archiveProject}
              onClick={() => {
                const slug = projMenu.id;
                setProjMenu(null);
                void archiveProjectRow(slug);
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

      {/* ── NESTED session "…" menu — pin/archive only (Hermes) ── */}
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

      {/* ── Filter menu ── */}
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

      {/* ── "Novo projeto" modal (parity with the desktop) ── */}
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

/** Icon of the "Nova tarefa" nav item — exported so the App can build the item. */
export const NewTaskIcon = SquarePen;
