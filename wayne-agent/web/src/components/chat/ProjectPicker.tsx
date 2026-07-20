/**
 * ProjectPicker — the PROJECT selector above the composer (Codex "Choose
 * project" benchmark, decision 10/07: chip SEPARATE from the "Nuvem" env).
 *
 *   [search: Pesquisar projetos]
 *   📁 projeto-a  ✓        ← projects/<slug> (folders)
 *   📁 projeto-b
 *   + Novo projeto  ›       ← submenu:
 *       • Começar do zero        (event → SidebarTasks' rich modal)
 *       • Usar uma pasta existente (browser for SAFE FOLDERS in the cloud)
 *       • Clonar repositório      (git modal — moved from EnvironmentChip)
 *   ✕ Trabalhar sem projeto
 *
 * "Usar pasta existente" is restricted to safe folders (Leonardo's decision):
 * it only browses inside projects/ and uploads/ — it NEVER exposes the root's
 * config/dbs/.git. Selecting → ?cwd=<abs> (or ?project=<slug> for projects/<slug>).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  Github,
  Loader2,
  Plus,
  Search,
  SquareDashed,
  X,
} from "lucide-react";

import { useI18n } from "@/i18n";
import { api, type ManagedFileEntry } from "@/lib/api";
import {
  PROJECTS_DIR,
  getFilesRoot,
  registerProjectRow,
  setLastProject,
  slugifyProject,
} from "@/lib/projects";
import {
  getProjectMetaCached,
  loadAllProjectMeta,
  onProjectMetaChange,
  projectDisplayName,
} from "@/lib/project-meta";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";

// Safe work roots — the "usar pasta existente" browser only enters HERE
// (never the /opt/data root, with the system's dbs/config/auth/.git).
const SAFE_ROOTS = [PROJECTS_DIR, "uploads"];

const GIT_URL_RE = /^(https?:\/\/|git@)[\w.@:\-~/]+$/i;
function repoNameFromUrl(url: string): string {
  return url.replace(/\.git$/i, "").replace(/\/+$/, "").split(/[/:]/).pop() || "repo";
}

export function ProjectPicker({
  project,
  cwd,
  onSendPrompt,
}: {
  /** Active formal project (projects/ slug) — null when no project/folder. */
  project: string | null;
  /** Active absolute cwd (existing folder) — to label it when not a project. */
  cwd: string | null;
  /** Fires a task in the current session (used by Conectar GitHub). */
  onSendPrompt: (text: string) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<string[] | null>(null);
  useMenuDismiss(open, () => {
    setOpen(false);
    setSubmenu(false);
  }, "project-picker");

  // Re-render when the metadata cache (name/emoji) arrives.
  const [, setMetaTick] = useState(0);
  useEffect(() => onProjectMetaChange(() => setMetaTick((n) => n + 1)), []);

  useEffect(() => {
    if (!open || projects !== null) return;
    void api
      .listFiles(PROJECTS_DIR)
      .then((res) => {
        const slugs = (res.entries ?? []).filter((e) => e.is_directory).map((e) => e.name);
        setProjects(slugs);
        void loadAllProjectMeta(slugs);
      })
      .catch(() => setProjects([]));
  }, [open, projects]);

  // Metadata of the ACTIVE project — to label the chip even with the popover
  // closed (the list only loads on open).
  useEffect(() => {
    if (project) void loadAllProjectMeta([project]);
  }, [project]);

  const label = project
    ? projectDisplayName(project)
    : cwd
      ? cwd.split(/[/\\]/).pop() || t.chat.projectPickerNone
      : t.chat.projectPickerNone;

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (projects ?? []).filter((p) => !q || p.toLowerCase().includes(q)),
    [projects, q],
  );

  const goProject = useCallback(
    (slug: string | null) => {
      setOpen(false);
      setSubmenu(false);
      setLastProject(slug); // null = "sem projeto" (persists the choice)
      navigate(slug ? `/chat?project=${encodeURIComponent(slug)}` : "/chat?new=1");
    },
    [navigate],
  );

  // ── Modals ────────────────────────────────────────────────────────────
  const [folderOpen, setFolderOpen] = useState(false);
  const [repoOpen, setRepoOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        data-menu-trigger="project-picker"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 type-caption font-medium text-foreground shadow-card transition-colors hover:border-foreground/25"
      >
        {project && getProjectMetaCached(project).icon ? (
          <span className="text-[13px] leading-none">{getProjectMetaCached(project).icon}</span>
        ) : project || cwd ? (
          <Folder className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <SquareDashed className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="max-w-[12rem] truncate">{label}</span>
        <ChevronDown className="h-3 w-3 text-text-tertiary" />
      </button>

      {open && (
        <div
          data-menu-root="project-picker"
          className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-2xl border border-border bg-card p-1.5 shadow-pop"
        >
          {/* Search */}
          <div className="mb-1 flex items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.chat.searchProjects}
              className="min-w-0 flex-1 bg-transparent type-ui text-foreground outline-none placeholder:text-text-tertiary"
            />
          </div>

          {/* Project list */}
          <div className="max-h-56 overflow-y-auto">
            {projects === null ? (
              <Loader2 className="m-2 h-4 w-4 animate-spin text-text-tertiary" />
            ) : (
              filtered.map((slug) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => goProject(slug)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left type-ui transition-colors hover:bg-muted/60"
                >
                  {getProjectMetaCached(slug).icon ? (
                    <span className="grid h-4 w-4 shrink-0 place-items-center text-[13px] leading-none">
                      {getProjectMetaCached(slug).icon}
                    </span>
                  ) : (
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate ${slug === project ? "font-semibold text-foreground" : "text-foreground"}`}
                  >
                    {projectDisplayName(slug)}
                  </span>
                  {slug === project && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />}
                </button>
              ))
            )}
          </div>

          <div className="mx-1 my-1 h-px bg-border/70" />

          {/* + Novo projeto (submenu) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSubmenu((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left type-ui text-foreground transition-colors hover:bg-muted/60"
            >
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">{t.chat.newProjectMenu}</span>
              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform ${submenu ? "rotate-90" : ""}`}
              />
            </button>
            {submenu && (
              <div className="ml-6 mt-0.5 space-y-0.5 border-l border-border/70 pl-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setSubmenu(false);
                    // Reuses SidebarTasks' rich modal (name+folders+idea).
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

          {/* Trabalhar sem projeto */}
          <button
            type="button"
            onClick={() => goProject(null)}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left type-ui text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-4 w-4 shrink-0" />
            {t.chat.workWithoutProject}
          </button>
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

/* ── Browser for safe folders in the cloud (Phase 3) ──────────────────── */

export function FolderBrowser({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  // "" = virtual root (shows only the SAFE_ROOTS); otherwise the current relative path.
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<ManagedFileEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (path === "") {
      // Virtual root: the safe roots as "folders".
      setEntries(
        SAFE_ROOTS.map((name) => ({
          name,
          path: name,
          is_directory: true,
          size: null,
          mtime: 0,
          mime_type: null,
        })),
      );
      return;
    }
    setEntries(null);
    void api
      .listFiles(path)
      .then((res) => {
        if (!cancelled)
          setEntries(
            (res.entries ?? [])
              // Hidden ones (.git etc) are out — the end client does not browse
              // internals, and picking .git as cwd would be a disaster.
              .filter((e) => e.is_directory && !e.name.startsWith("."))
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const pick = useCallback(() => {
    onClose();
    // Exact projects/<slug> → uses the project model (gains "último projeto").
    const m = path.match(/^projects\/([^/]+)$/);
    if (m) {
      setLastProject(m[1]);
      navigate(`/chat?project=${encodeURIComponent(m[1])}`);
      return;
    }
    // Arbitrary safe folder → absolute cwd (managed root + relative path —
    // the path here is NEVER absolute, see the entries' click handler).
    void getFilesRoot().then((root) => {
      const base = (root ?? "").replace(/\/$/, "");
      navigate(`/chat?cwd=${encodeURIComponent(base ? `${base}/${path}` : path)}`);
    });
  }, [path, navigate, onClose]);

  const crumbs = path ? path.split("/") : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-[min(520px,94vw)] flex-col rounded-2xl border border-border bg-card p-4 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 type-ui font-semibold text-foreground">
            {t.chat.pickFolderTitle}
          </span>
          <button
            type="button"
            aria-label={t.common.close}
            onClick={onClose}
            className="shrink-0 rounded p-1 text-text-tertiary transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Breadcrumb — never goes above the virtual root (safe folders). */}
        <div className="mb-1 flex items-center gap-1 overflow-x-auto type-caption text-muted-foreground">
          <button
            type="button"
            onClick={() => setPath("")}
            className="rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
          {crumbs.map((seg, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="h-3 w-3 shrink-0 text-text-tertiary" />
              <button
                type="button"
                onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}
                className="max-w-[10rem] truncate rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-background p-1">
          {entries === null ? (
            <Loader2 className="m-2 h-4 w-4 animate-spin text-text-tertiary" />
          ) : entries.length === 0 ? (
            <p className="px-2.5 py-4 type-caption text-text-tertiary">
              {t.common.noResults}
            </p>
          ) : (
            entries.map((e) => (
              <button
                key={e.path}
                type="button"
                // ALWAYS a RELATIVE path (path/name) — the API's e.path may come
                // back absolute (/opt/data/...), which broke the projects/<slug>
                // match and leaked the root into the breadcrumb.
                onClick={() => setPath(path ? `${path}/${e.name}` : e.name)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left type-ui text-foreground transition-colors hover:bg-muted/60"
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
              </button>
            ))
          )}
        </div>

        <p className="mt-2 type-micro text-text-tertiary">{t.chat.pickFolderHint}</p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={path === ""}
            onClick={pick}
            className="rounded-lg bg-foreground px-4 py-2 type-ui font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t.chat.selectThisFolder}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Clone-repository modal (moved from EnvironmentChip) ──────────────── */

export function RepoModal({
  onClose,
  onSendPrompt,
  navigate,
}: {
  onClose: () => void;
  onSendPrompt: (text: string) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [ghReady, setGhReady] = useState<boolean | null>(null);
  const focusRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setGhReady(null);
    void api
      .gitShipInfo("/opt/data")
      .then((r) => setGhReady(!!r.ghReady))
      .catch(() => setGhReady(false));
  }, []);

  const submit = async () => {
    const u = url.trim();
    if (!GIT_URL_RE.test(u) || busy) return;
    setBusy(true);
    try {
      const slug = slugifyProject(repoNameFromUrl(u)) || "repo";
      await api.createDirectory(`${PROJECTS_DIR}/${slug}`).catch(() => {});
      await registerProjectRow(slug, repoNameFromUrl(u));
      setLastProject(slug);
      onClose();
      navigate(`/chat?project=${encodeURIComponent(slug)}&clone=${encodeURIComponent(u)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-[min(480px,94vw)] rounded-2xl border border-border bg-card p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Github className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 type-ui font-semibold text-foreground">
            {t.chat.repoModalTitle}
          </span>
          <button
            type="button"
            aria-label={t.common.close}
            onClick={onClose}
            className="shrink-0 rounded p-1 text-text-tertiary transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {ghReady === null ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
          </div>
        ) : ghReady ? (
          <>
            <span className="mb-2 flex items-center gap-1.5 type-micro text-success">
              <Check className="h-3.5 w-3.5" />
              {t.chat.repoConnected}
            </span>
            <input
              ref={focusRef}
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder={t.chat.repoUrlPlaceholder}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 font-mono type-ui text-foreground outline-none placeholder:text-text-tertiary focus:border-foreground/30"
            />
            <p className="mt-2 type-micro text-muted-foreground">{t.chat.repoAnyProvider}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={!GIT_URL_RE.test(url.trim()) || busy}
                onClick={() => void submit()}
                className="rounded-lg bg-foreground px-4 py-2 type-ui font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? t.common.loading : t.common.confirm}
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                window.open("https://github.com/login/device", "_blank", "noopener,noreferrer");
                onSendPrompt(t.chat.ghConnectPrompt);
                onClose();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 type-body font-semibold text-background transition-opacity hover:opacity-90"
            >
              <Github className="h-4 w-4" />
              {t.chat.ghConnectCta}
            </button>
            <p className="mt-2.5 text-center type-caption text-muted-foreground">
              {t.chat.ghConnectDesc}
            </p>
            <div className="my-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-border/70" />
              <span className="type-micro text-text-tertiary">{t.chat.repoOrUrl}</span>
              <span className="h-px flex-1 bg-border/70" />
            </div>
            <div className="flex items-center gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                placeholder={t.chat.repoUrlPlaceholder}
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 font-mono type-caption text-foreground outline-none placeholder:text-text-tertiary focus:border-foreground/30"
              />
              <button
                type="button"
                disabled={!GIT_URL_RE.test(url.trim()) || busy}
                onClick={() => void submit()}
                className="shrink-0 rounded-lg border border-border bg-background px-3 py-2 type-ui font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                {busy ? t.common.loading : t.common.confirm}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
