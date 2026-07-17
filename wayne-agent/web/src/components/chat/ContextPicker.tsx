/**
 * ContextPicker — the SINGLE "work context" picker above the composer (decision
 * 14/07: UNIFIES the old EnvironmentChip + ProjectPicker into one chip; Manus
 * "My Computer" benchmark). It used to be TWO loose chips (Cloud/Local and
 * Project) that did not talk to each other — you could have "local folder Dute"
 * and "cloud project Work4you" lit at the same time (a contradiction). Now it is
 * ONE context at a time:
 *
 *   COMPUTADOR NA NUVEM
 *     🖥️ Nuvem            ← the tenant's computer, with no project  [⚙ Projeto]
 *     📁 Work4you         ← formal projects (projects/<slug>)
 *     📁 Hello World
 *     + Novo projeto ›    ← from scratch / use existing folder / clone repo
 *   SEU COMPUTADOR (desktop app only)
 *     💾 Dute             ← folders from the authorized vault
 *     + Adicionar pasta local
 *
 * Mutually exclusive: picking a LOCAL folder turns the machine's executor on
 * (desk.setLocal) + marks the session (onLocalEnv) and CLEARS the cloud project;
 * picking Cloud/project turns Local OFF (onLocalEnv(false)+stopLocal) and navigates.
 * The chip's label reflects the active context (Local takes priority).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Folder,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Loader2,
  MonitorDot,
  Plus,
  Search,
  Settings,
} from "lucide-react";

import { useI18n } from "@/i18n";
import { api, type ProjectRow } from "@/lib/api";
import {
  LOCAL_PATH_RE,
  registerFolderProject,
  setLastProject,
} from "@/lib/projects";
import {
  getProjectMetaCached,
  loadAllProjectMeta,
  onProjectMetaChange,
  projectDisplayName,
} from "@/lib/project-meta";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import { cn } from "@/lib/utils";
import { FolderBrowser, RepoModal } from "./ProjectPicker";

interface W4YDesktop {
  isDesktop?: boolean;
  platform?: string;
  /** Absolute path of the desktop's default local workspace (~/Work4You). */
  defaultWorkspace?: string;
  pickFolder: () => Promise<string[]>;
  listFolders: () => Promise<string[]>;
  removeFolder: (p: string) => Promise<string[]>;
  setLocal: (sessionKey: string) => Promise<{ ok: boolean }>;
  stopLocal: () => Promise<{ ok: boolean }>;
}

function getDesktop(): W4YDesktop | null {
  if (typeof window === "undefined") return null;
  const d = (window as unknown as { work4youDesktop?: W4YDesktop }).work4youDesktop;
  return d && d.isDesktop ? d : null;
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

export function ContextPicker({
  locked,
  project,
  cwd,
  storedSessionId,
  activeLocal,
  onActiveLocalChange,
  onLocalEnv,
  onSendPrompt,
  onOpenProjectSettings,
}: {
  /**
   * The conversation already started, so its folder is settled: the chip becomes
   * a label. Not a restriction we invented — the backend ships the cwd in
   * session.create and IGNORES it on resume, so switching here after the first
   * message only ever moved the chip. To work somewhere else, start a chat there.
   */
  locked?: boolean;
  /** Active formal project (projects/ slug) — null if no project/folder. */
  project: string | null;
  /** Active absolute cwd (existing folder in the cloud) — for labeling. */
  cwd: string | null;
  /** Durable session_key — the local executor registers under it. */
  storedSessionId?: string | null;
  /** Active local folder (CONTROLLED by the NativeChatPage — survives the
   *  hero→conversation remount; null = Cloud). */
  activeLocal: string | null;
  /** Notifies the owner (NativeChatPage) of the new active local folder / null. */
  onActiveLocalChange: (folder: string | null) => void;
  /** Turns Local mode on/off in the gateway (useChatSession.localEnv). */
  onLocalEnv?: (enabled: boolean, cwd?: string) => Promise<void> | void;
  /** Fires a task on the current session (used by Connect GitHub). */
  onSendPrompt: (text: string) => void;
  /** Opens the dock's Project tab (the Cloud's gear). */
  onOpenProjectSettings: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const desk = getDesktop();

  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState(false);
  const [query, setQuery] = useState("");
  // ONE list. A project is a row that owns folders; the folder decides where the
  // agent runs (cloud path vs a path on this machine). There is no environment
  // to pick — picking the project IS picking where you work. Same idea as
  // opening a folder in Cursor.
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [foldersList, setFoldersList] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [repoOpen, setRepoOpen] = useState(false);
  useMenuDismiss(
    open,
    () => {
      setOpen(false);
      setSubmenu(false);
    },
    "context-picker",
  );

  // Re-render when the project's metadata cache (name/emoji) arrives.
  const [, setMetaTick] = useState(0);
  useEffect(() => onProjectMetaChange(() => setMetaTick((n) => n + 1)), []);

  // Loads the project list on open.
  const loadRows = useCallback(async () => {
    try {
      let list = (await api.listProjects()).projects;

      // Self-healing: a vault folder the user allowed but never worked in yet has
      // no row, so it would be missing from this list. Adopt it on sight (the
      // backend does the same the first time a chat runs in it). Without this,
      // merging the two lists into one would make those folders disappear.
      if (desk) {
        const owned = new Set(list.flatMap((r) => r.folders.map((f) => f.path)));
        const vault = await desk.listFolders().catch(() => [] as string[]);
        const orphans = vault.filter((f) => !owned.has(f));
        if (orphans.length) {
          await Promise.all(orphans.map((f) => registerFolderProject(f)));
          list = (await api.listProjects()).projects;
        }
      }

      setRows(list);
      void loadAllProjectMeta(list.map((r) => r.slug));
    } catch {
      setRows([]);
    }
  }, [desk]);

  useEffect(() => {
    if (!open || rows !== null) return;
    void loadRows();
  }, [open, rows, loadRows]);

  // Metadata of the ACTIVE project (labels the chip with the popover closed).
  useEffect(() => {
    if (project) void loadAllProjectMeta([project]);
  }, [project]);

  // Loads the vault folders on open (desktop).
  const refreshFolders = useCallback(async () => {
    if (!desk) return;
    try {
      setFoldersList(await desk.listFolders());
    } catch {
      /* ignore */
    }
  }, [desk]);
  useEffect(() => {
    if (open && desk) void refreshFolders();
  }, [open, desk, refreshFolders]);

  // ── Context choice ──────────────────────────────────────────────────────
  // Cloud / project: turns Local off and navigates (the cwd comes from the
  // project slug).
  const chooseCloud = useCallback(
    (slug: string | null) => {
      setOpen(false);
      setSubmenu(false);
      onActiveLocalChange(null);
      try {
        void onLocalEnv?.(false);
        void desk?.stopLocal();
      } catch {
        /* ignore */
      }
      setLastProject(slug);
      navigate(slug ? `/chat?project=${encodeURIComponent(slug)}` : "/chat?new=1");
    },
    [navigate, onLocalEnv, desk, onActiveLocalChange],
  );

  // Local folder: turns the machine's executor on (vault) + marks the session.
  const chooseLocal = useCallback(
    async (folder: string) => {
      setOpen(false);
      setSubmenu(false);
      if (!desk || !storedSessionId) return;
      setBusy(true);
      onActiveLocalChange(folder);
      try {
        await desk.setLocal(storedSessionId);
        await onLocalEnv?.(true, folder);
      } catch {
        onActiveLocalChange(null);
      } finally {
        setBusy(false);
      }
    },
    [desk, storedSessionId, onLocalEnv, onActiveLocalChange],
  );

  /** The folder that defines a project — primary if set, else the first. */
  const primaryFolder = (r: ProjectRow): string | null =>
    r.primary_path || r.folders.find((f) => f.is_primary)?.path || r.folders[0]?.path || null;

  /**
   * Pick a project. The environment is DERIVED from its folder, never asked:
   * a path on this machine runs through the desktop executor, a cloud path runs
   * in the cloud. This is the whole simplification — the user picks WHAT to work
   * on, not WHERE it runs.
   */
  const chooseProject = useCallback(
    async (r: ProjectRow) => {
      const folder = primaryFolder(r);
      if (folder && LOCAL_PATH_RE.test(folder)) {
        await chooseLocal(folder);
        return;
      }
      chooseCloud(r.slug);
    },
    [chooseCloud, chooseLocal],
  );

  // Add folder: opens the native picker + authorization; AUTO-SELECTS the
  // just-added folder (kills the "after Allow it did not activate" bug).
  const addFolder = useCallback(async () => {
    if (!desk) return;
    try {
      const prev = foldersList;
      const list = await desk.pickFolder();
      setFoldersList(list);
      const added = list.find((f) => !prev.includes(f));
      if (added) {
        // The folder becomes a project the moment it is allowed — so it shows in
        // this list and in the history sidebar, on this machine and on the web.
        await registerFolderProject(added);
        setRows(null);
        await chooseLocal(added);
      }
    } catch {
      /* ignore */
    }
  }, [desk, foldersList, chooseLocal]);

  // The desktop's default local workspace (~/Work4You) reads as the brand name,
  // not the raw folder basename — DL-05/DL-06: the resolved default communicates
  // "Work4You".
  const isDefaultLocal = !!activeLocal && !!desk?.defaultWorkspace && activeLocal === desk.defaultWorkspace;

  // Chip label/icon: the folder in use, whichever machine it lives on.
  const label = activeLocal
    ? isDefaultLocal
      ? t.chat.dockLocalDefault
      : baseName(activeLocal)
    : project
      ? projectDisplayName(project)
      : cwd
        ? baseName(cwd)
        : // Same words as the menu's first item. This used to read "Nuvem",
          // which sold an environment to choose — there is none to choose.
          t.chat.projectPickerNone;

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          !q ||
          r.slug.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          // A local project is found by its path too — that is how you tell two
          // folders with the same name apart.
          r.folders.some((f) => f.path.toLowerCase().includes(q)),
      ),
    [rows, q],
  );

  return (
    <div className="relative">
      <button
        type="button"
        data-menu-trigger="context-picker"
        onClick={() => !locked && setOpen((v) => !v)}
        disabled={locked}
        title={locked ? t.chat.ctxLockedHint : undefined}
        className={cn(
          "flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 type-caption font-medium text-foreground shadow-card transition-colors",
          // Settled: reads as a label, not a control. No hover affordance and no
          // dimming — the folder is still live information, it just isn't a choice
          // any more.
          locked ? "cursor-default" : "hover:border-foreground/25",
        )}
      >
        {activeLocal ? (
          <HardDrive className="h-3.5 w-3.5 text-live" />
        ) : project && getProjectMetaCached(project).icon ? (
          <span className="text-[13px] leading-none">{getProjectMetaCached(project).icon}</span>
        ) : project || cwd ? (
          <Folder className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <MonitorDot className="h-3.5 w-3.5 text-live" />
        )}
        <span className="max-w-[12rem] truncate">{label}</span>
        {/* No caret once settled: a caret promises a menu. */}
        {!locked && <ChevronDown className="h-3 w-3 text-muted-foreground/60" />}
      </button>

      {open && !locked && (
        <div
          data-menu-root="context-picker"
          className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-2xl border border-border bg-card p-1.5 shadow-pop"
        >
          {/* First item = where the agent runs with no project chosen.
              DL-06 splits by surface:
                • Desktop → "Run in the cloud" is an EXPLICIT opt-out. The default
                  here is the local ~/Work4You workspace (armed automatically), so
                  "no project" is not an environment to offer — only its opposite,
                  the cloud, is a real choice. Same chooseCloud(null) wiring.
                • Web → "No project" IS the legitimate default (no folder = cloud),
                  unchanged. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => chooseCloud(null)}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/60"
          >
            {desk ? (
              <Cloud className="h-4 w-4 shrink-0 text-live" />
            ) : (
              <MonitorDot className="h-4 w-4 shrink-0 text-live" />
            )}
            <span className="min-w-0 flex-1 type-ui font-medium text-foreground">
              {desk ? t.chat.ctxRunInCloud : t.chat.projectPickerNone}
            </span>
            {!activeLocal && !project && !cwd && (
              <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
            )}
            <button
              type="button"
              title={t.chat.dockProject}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onOpenProjectSettings();
              }}
              className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Search (only when there are many projects) */}
          {(rows?.length ?? 0) > 6 && (
            <div className="mx-1 mb-1 mt-0.5 flex items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.chat.searchProjects}
                className="min-w-0 flex-1 bg-transparent type-ui text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          )}

          {/* ONE project list — cloud and local side by side. The glyph says
              where it lives; nothing here asks the user to choose that. */}
          <div className="max-h-48 overflow-y-auto">
            {rows === null ? (
              <Loader2 className="m-2 h-4 w-4 animate-spin text-muted-foreground/60" />
            ) : (
              filtered.map((r) => {
                const folder = primaryFolder(r);
                const local = !!folder && LOCAL_PATH_RE.test(folder);
                const active = local ? activeLocal === folder : !activeLocal && r.slug === project;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => void chooseProject(r)}
                    disabled={busy}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 pl-3 text-left type-ui transition-colors hover:bg-muted/60 disabled:opacity-60"
                  >
                    {getProjectMetaCached(r.slug).icon ? (
                      <span className="grid h-4 w-4 shrink-0 place-items-center text-[13px] leading-none">
                        {getProjectMetaCached(r.slug).icon}
                      </span>
                    ) : local ? (
                      <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate ${active ? "font-semibold text-foreground" : "text-foreground"}`}
                      >
                        {projectDisplayName(r.slug) || r.name}
                      </span>
                      {/* The path only shows for a folder on this machine — for a
                          cloud project it is our storage detail, not information. */}
                      {local && folder && (
                        <span className="block truncate type-micro text-muted-foreground/70">
                          {folder}
                        </span>
                      )}
                    </span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />}
                  </button>
                );
              })
            )}
          </div>

          {/* + New project (submenu) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSubmenu((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left type-ui text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{t.chat.newProjectMenu}</span>
              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform ${submenu ? "rotate-90" : ""}`}
              />
            </button>
            {submenu && (
              <div className="ml-6 mt-0.5 space-y-0.5 border-l border-border/70 pl-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setSubmenu(false);
                    window.dispatchEvent(new CustomEvent("wayne:open-new-project"));
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left type-ui text-foreground transition-colors hover:bg-muted/60"
                >
                  <FolderPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {t.chat.startFromScratch}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubmenu(false);
                    setOpen(false);
                    setFolderOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left type-ui text-foreground transition-colors hover:bg-muted/60"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {t.chat.useExistingFolder}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubmenu(false);
                    setOpen(false);
                    setRepoOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left type-ui text-foreground transition-colors hover:bg-muted/60"
                >
                  <FolderGit2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {t.chat.cloneRepo}
                </button>
              </div>
            )}
          </div>

          {/* Adding a folder from this machine is just another way to create a
              project — so it sits with the other create actions, not under a
              separate "Seu computador" heading. Desktop only: the browser has no
              folder picker and no executor. */}
          {desk && (
            <button
              type="button"
              onClick={addFolder}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left type-ui text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <HardDrive className="h-4 w-4 shrink-0" />
              {t.chat.ctxAddLocalFolder}
            </button>
          )}
        </div>
      )}

      {folderOpen && <FolderBrowser onClose={() => setFolderOpen(false)} />}
      {repoOpen && (
        <RepoModal
          onClose={() => setRepoOpen(false)}
          onSendPrompt={onSendPrompt}
          navigate={navigate}
        />
      )}
    </div>
  );
}
