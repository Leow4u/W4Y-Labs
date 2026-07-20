/**
 * FilesPage — the tenant's file explorer, with a desktop look.
 *
 * Onda 1: separates user content from system noise (lib/file-curation; system
 * only in ?full=1), desktop-style type icon (lib/file-icons), clickable
 * breadcrumb, grid↔list.
 * Onda 2: side rail (Quick access/Projects/Favorites), "Recentes" strip on Home
 * (shallow scan by mtime), favoriting (star) and inline preview
 * (image/PDF/text). Zero new backend — the API already gives name/size/mtime/
 * mime_type + path/root, and readFile gives the data_url for the preview.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  List as ListIcon,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nous-research/ui/ui/components/dialog";
import { Input } from "@nous-research/ui/ui/components/input";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { usePageHeader } from "@/contexts/usePageHeader";
import { isInternalView } from "@/lib/internal-view";
import { api, httpStatus } from "@/lib/api";
import type { KnowledgeDoc, ManagedFileEntry, ManagedFilesResponse } from "@/lib/api";
import { FileTypeIcon } from "@/lib/file-icons";
import { partitionEntries, sortEntries, isSystemEntry } from "@/lib/file-curation";
import {
  capsFor,
  knowledgeToEntry,
  parseKnowledgePath,
  type FileCaps,
  type FileSourceId,
} from "@/lib/file-sources";
import { uploadKnowledgeDocument } from "@/lib/knowledge-upload";
import { agentLabel, realAgents } from "@/lib/agents";
import { prettifyProject } from "@/lib/projects";
import { isFilePinned, toggleFilePin, removePinnedFile, onPinnedFilesChange } from "@/lib/pinned-files";
import { FilesRail, type RailProject } from "@/components/files/FilesRail";
import { FilePreview, isPreviewable } from "@/components/files/FilePreview";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { PluginSlot } from "@/plugins";

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const VIEW_KEY = "w4y-files-view";
// Transfer type of the INTERNAL drag-to-move (tells it apart from the upload of
// external files, which carries the "Files" type).
const MOVE_MIME = "application/x-w4y-move";

function joinPath(base: string, name: string): string {
  const cleanName = name.trim().replace(/^[\\/]+/, "");
  if (!cleanName) return base;
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  if (!base || base.endsWith("/") || base.endsWith("\\")) return `${base}${cleanName}`;
  return `${base}${sep}${cleanName}`;
}

function formatBytes(size: number | null): string {
  if (size === null) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function downloadDataUrl(dataUrl: string, name: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = name || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function transferHasFiles(event: ReactDragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

interface Crumb {
  label: string;
  path: string;
}

/**
 * A failed file operation, said in the owner's words.
 *
 * Reads the HTTP status (api.ApiError), never the backend's English prose —
 * that prose is not a contract. The four different 403s the server can raise
 * (outside the root, system item, unreadable directory, sensitive name) all
 * collapse into ONE sentence on purpose: to the person looking at the screen
 * they mean exactly the same thing.
 */
function describeFileError(
  e: unknown,
  tf: ReturnType<typeof useI18n>["t"]["files"],
  fallback?: string,
): string {
  switch (httpStatus(e)) {
    case 404:
      return tf.notFound;
    case 403:
      return tf.forbidden;
    case 409:
      return tf.conflict;
    case 413:
      return tf.tooLarge;
    case 422:
      return tf.unsupportedFormat;
    default:
      return fallback ? `${fallback}: ${e}` : String(e);
  }
}

export default function FilesPage() {
  const { t } = useI18n();
  const tf = t.files;
  const { toast, showToast } = useToast();
  const { setAfterTitle, setEnd } = usePageHeader();
  const routeLocation = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const [currentPath, setCurrentPath] = useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("path") ?? undefined,
  );
  // Which surface the explorer is showing. "knowledge" = one agent's documents.
  const [source, setSource] = useState<FileSourceId>("cloud");
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [agents, setAgents] = useState<Array<{ slug: string; name: string }>>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const [knowledgeProvider, setKnowledgeProvider] = useState<string | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [listing, setListing] = useState<ManagedFilesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ManagedFileEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const setViewPersist = (v: "grid" | "list") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* best effort */
    }
  };
  // Onda 2: preview, rail projects, recents, and re-render on (un)favoriting.
  const [preview, setPreview] = useState<ManagedFileEntry | null>(null);
  const [projects, setProjects] = useState<RailProject[]>([]);
  const [recents, setRecents] = useState<ManagedFileEntry[]>([]);
  const [, bumpPins] = useState(0);
  useEffect(() => onPinnedFilesChange(() => bumpPins((x) => x + 1)), []);
  // Onda 3: inline rename, drag-to-move, context menu.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: ManagedFileEntry | null } | null>(null);

  const internal = isInternalView();
  const onKnowledge = source === "knowledge" && activeAgent !== null;
  const caps: FileCaps = capsFor(onKnowledge ? "knowledge" : "cloud");
  const activePath = listing?.path ?? currentPath ?? "";
  const canUpload = onKnowledge
    ? !uploading
    : Boolean(activePath) && !uploading;
  const root = listing?.locked_root ?? listing?.root ?? null;
  const isAtRoot = Boolean(root) && activePath === root && !onKnowledge;

  /** Go back to the cloud surface (used by every "Início" affordance). */
  const goCloud = useCallback((path?: string) => {
    setSource("cloud");
    setActiveAgent(null);
    if (path !== undefined) setCurrentPath(path);
  }, []);

  const load = useCallback(
    async (path = currentPath) => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.listFiles(path);
        setListing(result);
        setCurrentPath(result.path);
        setPathInput(result.path);
      } catch (e) {
        setError(describeFileError(e, tf));
      } finally {
        setLoading(false);
      }
    },
    [currentPath],
  );

  useEffect(() => {
    if (onKnowledge) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(currentPath);
  }, [currentPath, onKnowledge]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The agents that can own knowledge — the installation is not one of them. */
  useEffect(() => {
    let dead = false;
    void api
      .getProfiles()
      .then((r) => {
        if (dead) return;
        setAgents(
          realAgents(r.profiles).map((p) => ({ slug: p.name, name: agentLabel(p.name) })),
        );
      })
      .catch(() => {
        if (!dead) setAgents([]);
      });
    return () => {
      dead = true;
    };
  }, []);

  const loadKnowledge = useCallback(
    async (slug: string) => {
      setKnowledgeLoading(true);
      setError(null);
      try {
        const r = await api.getKnowledge(slug);
        setKnowledgeDocs(r.documents ?? []);
        setKnowledgeProvider(r.provider ?? null);
      } catch (e) {
        setKnowledgeDocs([]);
        setError(describeFileError(e, tf));
      } finally {
        setKnowledgeLoading(false);
      }
    },
    [tf],
  );

  useEffect(() => {
    if (!onKnowledge || !activeAgent) return;
    void loadKnowledge(activeAgent);
  }, [onKnowledge, activeAgent, loadKnowledge]);

  // Deep link, three keys: ?path (cloud) or ?src=knowledge&agent=<slug>.
  // Reactive to location.search instead of read-once at mount — that is what
  // makes the five EXISTING deep links into this page (project workspace, task
  // header, sidebar, backups) actually change the folder, which they never did.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("src") === "knowledge") {
      const slug = q.get("agent");
      if (slug) {
        setSource("knowledge");
        setActiveAgent(slug);
        return;
      }
    }
    setSource("cloud");
    setActiveAgent(null);
    const path = q.get("path");
    if (path) setCurrentPath(path);
  }, [routeLocation.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // …and write it back, so F5 lands where the user is.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (onKnowledge && activeAgent) {
      q.delete("path");
      q.set("src", "knowledge");
      q.set("agent", activeAgent);
    } else {
      q.delete("src");
      q.delete("agent");
      if (activePath) q.set("path", activePath);
      else q.delete("path");
    }
    const next = `${window.location.pathname}${q.toString() ? `?${q}` : ""}`;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [onKnowledge, activeAgent, activePath]);

  // Navigation breadcrumb built from the absolute path relative to the root.
  const crumbs = useMemo<Crumb[]>(() => {
    const root = listing?.locked_root ?? listing?.root ?? null;
    const path = listing?.path ?? "";
    if (!root || !path) return [];
    const norm = (s: string) => s.replace(/[\\/]+$/, "");
    const r = norm(root);
    if (!path.startsWith(r)) return [{ label: tf.home, path }];
    const rel = path.slice(r.length).replace(/^[\\/]+/, "");
    const segs = rel ? rel.split(/[\\/]+/).filter(Boolean) : [];
    const out: Crumb[] = [{ label: tf.home, path: r }];
    let acc = r;
    for (const s of segs) {
      acc = `${acc}/${s}`;
      out.push({ label: s, path: acc });
    }
    return out;
  }, [listing?.locked_root, listing?.root, listing?.path, tf.home]);

  // Header: refresh only (the breadcrumb lives in the body). Clears the old badge.
  useEffect(() => {
    setAfterTitle(null);
    setEnd(
      <Button
        ghost
        size="icon"
        type="button"
        onClick={() => void load()}
        disabled={loading}
        aria-label={t.common.refresh}
      >
        {loading ? <Spinner /> : <RefreshCw />}
      </Button>,
    );
    return () => {
      setAfterTitle(null);
      setEnd(null);
    };
  }, [load, loading, setAfterTitle, setEnd, t.common.refresh]);

  const goUp = () => {
    if (listing?.parent) setCurrentPath(listing.parent);
  };

  const createDirectory = async () => {
    const name = folderName.trim();
    if (!activePath) return;
    if (!name) {
      showToast(tf.folderNameRequired, "error");
      return;
    }
    setCreating(true);
    try {
      await api.createDirectory(joinPath(activePath, name));
      setFolderName("");
      setCreateDialogOpen(false);
      showToast(tf.created, "success");
      await load();
    } catch (e) {
      showToast(describeFileError(e, tf, tf.createFailed), "error");
    } finally {
      setCreating(false);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      if (onKnowledge && activeAgent) {
        // Knowledge ingest is not a plain file write: re-uploading the same
        // name has to REPLACE, or the agent ends up with the document learned
        // twice (see lib/knowledge-upload).
        let replaced = false;
        for (const file of Array.from(files)) {
          const r = await uploadKnowledgeDocument(file, activeAgent, knowledgeDocs);
          replaced = replaced || r.replaced;
        }
        showToast(
          replaced ? tf.knowledgeReplaced : tf.uploaded.replace("{n}", String(files.length)),
          "success",
        );
        await loadKnowledge(activeAgent);
      } else {
        for (const file of Array.from(files)) {
          await api.uploadFile(joinPath(activePath, file.name), file, true);
        }
        showToast(tf.uploaded.replace("{n}", String(files.length)), "success");
        await load();
      }
    } catch (e) {
      showToast(describeFileError(e, tf, tf.uploadFailed), "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openEntry = (entry: ManagedFileEntry) => {
    if (entry.is_directory) setCurrentPath(entry.path);
    else if (isPreviewable(entry.name, entry.mime_type)) setPreview(entry);
    else void downloadFile(entry);
  };

  const togglePin = (entry: ManagedFileEntry) =>
    toggleFilePin({ path: entry.path, name: entry.name, dir: entry.is_directory });

  const downloadFile = async (entry: ManagedFileEntry) => {
    if (entry.is_directory) return;
    try {
      const file = await api.readFile(entry.path);
      downloadDataUrl(file.data_url, file.name);
    } catch (e) {
      showToast(describeFileError(e, tf, tf.downloadFailed), "error");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const known = parseKnowledgePath(pendingDelete.path);
      if (known) {
        await api.deleteKnowledge(known.name, known.slug);
        showToast(tf.deleted, "success");
        setPendingDelete(null);
        await loadKnowledge(known.slug);
      } else {
        await api.deleteFile(pendingDelete.path, pendingDelete.is_directory);
        showToast(tf.deleted, "success");
        setPendingDelete(null);
        await load();
      }
    } catch (e) {
      showToast(describeFileError(e, tf, tf.deleteFailed), "error");
    } finally {
      setDeleting(false);
    }
  };

  // ── Onda 3: rename (= move within the same dir) ────────────────────
  const beginRename = (entry: ManagedFileEntry) => {
    setMenu(null);
    setRenaming(entry.path);
    setRenameValue(entry.name);
  };
  const cancelRename = () => {
    setRenaming(null);
    setRenameValue("");
  };
  const commitRename = async (entry: ManagedFileEntry) => {
    const name = renameValue.trim();
    if (!name || name === entry.name) {
      cancelRename();
      return;
    }
    const dest = joinPath(activePath, name);
    const wasPinned = isFilePinned(entry.path);
    try {
      await api.moveFile(entry.path, dest);
      if (wasPinned) {
        removePinnedFile(entry.path);
        toggleFilePin({ path: dest, name, dir: entry.is_directory });
      }
      showToast(tf.renamed, "success");
      cancelRename();
      await load();
    } catch (e) {
      showToast(describeFileError(e, tf, tf.renameFailed), "error");
    }
  };

  // Move `src` into `destDir` (keeping the name). No-op if it is already there.
  const moveEntry = async (src: ManagedFileEntry, destDir: string) => {
    const dest = joinPath(destDir, src.name);
    if (dest === src.path) return;
    const wasPinned = isFilePinned(src.path);
    try {
      await api.moveFile(src.path, dest);
      if (wasPinned) {
        removePinnedFile(src.path);
        toggleFilePin({ path: dest, name: src.name, dir: src.is_directory });
      }
      showToast(tf.moved, "success");
      await load();
    } catch (e) {
      showToast(describeFileError(e, tf, tf.moveFailed), "error");
    }
  };

  const openMenu = (e: ReactMouseEvent, entry: ManagedFileEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entry });
  };

  // ── Drag-to-move (internal; distinct from the external upload) ──────
  const onEntryDragStart = (e: ReactDragEvent<HTMLElement>, entry: ManagedFileEntry) => {
    e.dataTransfer.setData(
      MOVE_MIME,
      JSON.stringify({ path: entry.path, name: entry.name, dir: entry.is_directory }),
    );
    e.dataTransfer.effectAllowed = "move";
  };
  // Highlights/allows a drop on a target folder — internal drag only, NEVER on
  // the source itself. (getData only exists on drop; here we check the `types`.)
  const allowDrop = (e: ReactDragEvent<HTMLElement>, destPath: string, selfPath?: string) => {
    if (!Array.from(e.dataTransfer.types).includes(MOVE_MIME)) return;
    if (selfPath && destPath === selfPath) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragOverPath !== destPath) setDragOverPath(destPath);
  };
  const dropOnDir = (e: ReactDragEvent<HTMLElement>, destDir: string) => {
    const raw = e.dataTransfer.getData(MOVE_MIME);
    setDragOverPath(null);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const src = JSON.parse(raw) as { path: string; name: string; dir: boolean };
      if (src.path && src.name) {
        void moveEntry(
          { path: src.path, name: src.name, is_directory: src.dir, size: null, mtime: 0, mime_type: null },
          destDir,
        );
      }
    } catch {
      /* invalid payload — ignore */
    }
  };

  const ops: FileOps = {
    onOpen: openEntry,
    onDelete: setPendingDelete,
    onDownload: downloadFile,
    onTogglePin: togglePin,
    onBeginRename: beginRename,
    onContextMenu: openMenu,
    renamingPath: renaming,
    renameValue,
    onRenameValue: setRenameValue,
    onRenameCommit: commitRename,
    onRenameCancel: cancelRename,
    onDragStart: onEntryDragStart,
    onAllowDrop: allowDrop,
    onDropDir: dropOnDir,
    onDragLeaveDir: () => setDragOverPath(null),
    dragOverPath,
  };

  // Drag-drop over the whole area.
  const onDragEnter = (e: ReactDragEvent<HTMLElement>) => {
    if (!canUpload || !transferHasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDraggingFiles(true);
  };
  const onDragOver = (e: ReactDragEvent<HTMLElement>) => {
    if (!canUpload || !transferHasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (e: ReactDragEvent<HTMLElement>) => {
    if (!canUpload || !transferHasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDraggingFiles(false);
  };
  const onDrop = (e: ReactDragEvent<HTMLElement>) => {
    if (!canUpload) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDraggingFiles(false);
    void uploadFiles(e.dataTransfer.files);
  };

  // User content only. The internal view (?full=1) shows everything raw; the
  // normal one hides the system folders (curation) — neither shows nor reaches them.
  const user = useMemo(() => {
    if (onKnowledge && activeAgent) {
      // Same row shape as a file, so the four columns stay filled and true.
      return knowledgeDocs.map((d) => knowledgeToEntry(d, activeAgent));
    }
    const entries = listing?.entries ?? [];
    return sortEntries(
      internal
        ? entries
        : partitionEntries(entries, { atRoot: isAtRoot }).user,
    );
  }, [listing?.entries, internal, isAtRoot, onKnowledge, activeAgent, knowledgeDocs]);

  const isEmpty = onKnowledge
    ? !knowledgeLoading && user.length === 0
    : !loading && listing && user.length === 0;

  // Rail: projects/ folders (pretty names). One call once the root is known —
  // regardless of where the navigation currently is.
  useEffect(() => {
    if (!root) return;
    let dead = false;
    void api
      .listFiles(`${root}/projects`)
      .then((r) => {
        if (dead) return;
        setProjects(
          r.entries
            .filter((e) => e.is_directory)
            .map((e) => ({ name: prettifyProject(e.name), path: e.path })),
        );
      })
      .catch(() => {
        if (!dead) setProjects([]);
      });
    return () => {
      dead = true;
    };
  }, [root]);

  // "Recentes" on Home: shallow scan (root + up to 8 user folders, 1 level)
  // → the most recent files by mtime. Best-effort; failure = no strip.
  useEffect(() => {
    if (!listing || !isAtRoot || internal) {
      setRecents([]);
      return;
    }
    let dead = false;
    const rootFiles = user.filter((e) => !e.is_directory);
    const folders = user.filter((e) => e.is_directory).slice(0, 8);
    void Promise.allSettled(folders.map((f) => api.listFiles(f.path))).then((results) => {
      if (dead) return;
      const all = [...rootFiles];
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        for (const e of r.value.entries) {
          if (!e.is_directory && !isSystemEntry(e)) all.push(e);
        }
      }
      const top = all
        .filter((e) => Number.isFinite(e.mtime) && e.mtime > 0)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 8);
      setRecents(top);
    });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.path, isAtRoot, internal]);

  return (
    <div
      className="relative flex min-w-0 max-w-full gap-4"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Toast toast={toast} />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void uploadFiles(e.currentTarget.files)}
      />

      <FilesRail
        root={root}
        activePath={onKnowledge ? "" : activePath}
        projects={projects}
        onNavigate={goCloud}
        onPreview={setPreview}
        agents={agents}
        activeAgent={onKnowledge ? activeAgent : null}
        onSelectAgent={(slug) => {
          setSource("knowledge");
          setActiveAgent(slug);
          setPreview(null);
        }}
      />

      <div
        className="flex min-h-[calc(100dvh-160px)] min-w-0 flex-1 flex-col gap-4"
        onContextMenu={(e) => openMenu(e, null)}
      >
      <PluginSlot name="files:top" />

      {/* Bar: back + breadcrumb (left) · view + actions (right). */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          ghost
          size="icon"
          type="button"
          onClick={goUp}
          disabled={!listing?.parent}
          aria-label={tf.back}
          className="shrink-0"
        >
          <ChevronLeft />
        </Button>

        {internal ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (pathInput.trim()) void load(pathInput.trim());
            }}
          >
            <Input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              aria-label="Path"
              className="h-9 min-w-0 flex-1 font-mono"
            />
            <Button type="submit" size="sm" outlined>
              Go
            </Button>
          </form>
        ) : (
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm">
            {(onKnowledge
              ? [
                  { label: tf.home, path: "" },
                  { label: agents.find((a) => a.slug === activeAgent)?.name ?? "", path: "" },
                ]
              : crumbs
            ).map((c, i, arr) => (
              // On the knowledge surface the trail is exactly [Início › agent]:
              // "Início" leaves the surface, the agent is the leaf, and neither
              // accepts a drop (caps.move is false there).
              <span key={`${i}-${c.path}`} className="flex shrink-0 items-center">
                {i > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-muted-foreground" />}
                <button
                  type="button"
                  onClick={() => (onKnowledge ? goCloud(root ?? undefined) : setCurrentPath(c.path))}
                  disabled={i === arr.length - 1}
                  onDragOver={caps.move && i < arr.length - 1 ? (e) => allowDrop(e, c.path) : undefined}
                  onDragLeave={caps.move && i < arr.length - 1 ? ops.onDragLeaveDir : undefined}
                  onDrop={caps.move && i < arr.length - 1 ? (e) => dropOnDir(e, c.path) : undefined}
                  className={cn(
                    "max-w-[14rem] truncate rounded px-1.5 py-0.5 transition-colors",
                    i === arr.length - 1
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    dragOverPath === c.path && i < arr.length - 1 && "bg-live/15 ring-1 ring-live",
                  )}
                >
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <div className="mr-1 flex items-center rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setViewPersist("grid")}
              aria-label={tf.viewGrid}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md transition-colors",
                view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewPersist("list")}
              aria-label={tf.viewList}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md transition-colors",
                view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
          {caps.upload && (
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canUpload}
              size="sm"
              outlined
              prefix={uploading ? <Spinner /> : <Upload />}
            >
              {tf.upload}
            </Button>
          )}
          {caps.mkdir && (
            <Button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              disabled={!activePath}
              size="sm"
              outlined
              prefix={<FolderPlus />}
            >
              {tf.newFolder}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* The documents are on disk but the agent is not reading them: its memory
          provider is something else, so nothing here reaches an answer. Stating
          it beats a list that silently does nothing. */}
      {onKnowledge && knowledgeProvider && knowledgeProvider !== "holographic" && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {tf.knowledgeInert}
        </div>
      )}

      {/* Recents — only on Home (shallow scan by mtime). */}
      {isAtRoot && recents.length > 0 && (
        <div>
          <div className="mb-2 type-caption text-muted-foreground">{tf.recent}</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
            {recents.map((e) => (
              <button
                key={e.path}
                type="button"
                onClick={() => openEntry(e)}
                title={e.name}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border p-2.5 text-left transition-colors hover:border-foreground/30 hover:bg-card"
              >
                <FileTypeIcon name={e.name} isDirectory={false} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-xs text-foreground">{e.name}</div>
                  <div className="type-micro text-muted-foreground">
                    {Number.isFinite(e.mtime) ? DATE_FORMAT.format(e.mtime * 1000) : "—"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {(onKnowledge ? knowledgeLoading && user.length === 0 : loading && !listing) ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner />
          {t.common.loading}
        </div>
      ) : isEmpty ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {onKnowledge ? tf.knowledgeEmpty : tf.empty}
        </div>
      ) : (
        <>
          {/* User content only. The system folders are NOT shown nor reachable
              through the normal UI (avoids deleting the runtime by accident) —
              the internal ?full=1 view is the only one that shows everything
              (the partition above puts everything in `user` when internal). The
              backend still refuses to delete critical paths as an extra defense. */}
          {view === "grid" ? (
            <FileGrid entries={user} ops={ops} tf={tf} caps={caps} />
          ) : (
            <FileList entries={user} ops={ops} tf={tf} caps={caps} />
          )}
        </>
      )}

        <PluginSlot name="files:bottom" />
      </div>

      {/* Drop overlay — covers rail+main; only shows up while dragging. */}
      {draggingFiles && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-live bg-live/10">
          <span className="flex items-center gap-2 rounded-lg bg-card px-4 py-2 text-sm font-medium text-foreground shadow-card">
            <Upload className="h-4 w-4 text-live" />
            {tf.dropHint}
          </span>
        </div>
      )}

      {preview && (
        <FilePreview entry={preview} onClose={() => setPreview(null)} onDownload={downloadFile} />
      )}

      {menu && (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          entry={menu.entry}
          pinned={menu.entry ? isFilePinned(menu.entry.path) : false}
          onClose={() => setMenu(null)}
          onOpenEntry={() => menu.entry && openEntry(menu.entry)}
          onDownload={() => menu.entry && void downloadFile(menu.entry)}
          onRename={() => menu.entry && beginRename(menu.entry)}
          onTogglePin={() => menu.entry && togglePin(menu.entry)}
          onDelete={() => menu.entry && setPendingDelete(menu.entry)}
          onUpload={() => fileInputRef.current?.click()}
          onNewFolder={() => setCreateDialogOpen(true)}
          tf={tf}
          caps={caps}
        />
      )}

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (creating) return;
          setCreateDialogOpen(open);
          if (!open) setFolderName("");
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tf.newFolder}</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <Input
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createDirectory();
              }}
              placeholder={tf.folderPlaceholder}
              disabled={creating}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              outlined
              onClick={() => {
                setCreateDialogOpen(false);
                setFolderName("");
              }}
              disabled={creating}
            >
              {t.common.cancel}
            </Button>
            <Button type="button" onClick={() => void createDirectory()} disabled={creating} prefix={creating ? <Spinner /> : <FolderPlus />}>
              {t.common.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={Boolean(pendingDelete)}
        loading={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title={pendingDelete ? tf.confirmDeleteTitle.replace("{name}", pendingDelete.name) : tf.confirmDeleteTitle}
        description={pendingDelete?.is_directory ? tf.confirmDeleteFolder : tf.confirmDeleteFile}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grid — icon blocks (desktop look)                                   */
/* ------------------------------------------------------------------ */

interface FileOps {
  onOpen: (e: ManagedFileEntry) => void;
  onDelete: (e: ManagedFileEntry) => void;
  onDownload: (e: ManagedFileEntry) => void;
  onTogglePin: (e: ManagedFileEntry) => void;
  onBeginRename: (e: ManagedFileEntry) => void;
  onContextMenu: (ev: ReactMouseEvent, e: ManagedFileEntry | null) => void;
  renamingPath: string | null;
  renameValue: string;
  onRenameValue: (v: string) => void;
  onRenameCommit: (e: ManagedFileEntry) => void;
  onRenameCancel: () => void;
  onDragStart: (ev: ReactDragEvent<HTMLElement>, e: ManagedFileEntry) => void;
  onAllowDrop: (ev: ReactDragEvent<HTMLElement>, destPath: string, selfPath?: string) => void;
  onDropDir: (ev: ReactDragEvent<HTMLElement>, destDir: string) => void;
  onDragLeaveDir: () => void;
  dragOverPath: string | null;
}

interface ViewProps {
  entries: ManagedFileEntry[];
  ops: FileOps;
  tf: ReturnType<typeof useI18n>["t"]["files"];
  /** What this surface actually supports. An action outside caps is not
   *  rendered at all — dimming it (the old `muted`) still let it be clicked. */
  caps: FileCaps;
  muted?: boolean;
}

/** Inline rename field (grid and list). Enter commits, Esc cancels, leaving
 *  (blur) commits — Explorer behavior. Stops the click/double-click/context-menu
 *  on the field itself (so paste/select still work). */
function RenameInput({
  value,
  onChange,
  onCommit,
  onCancel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  className?: string;
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onDragStart={(e) => e.preventDefault()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={onCommit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit();
        else if (e.key === "Escape") onCancel();
      }}
      className={cn(
        "min-w-0 rounded border border-live bg-background px-1 py-0.5 text-foreground outline-none focus:ring-1 focus:ring-live",
        className,
      )}
    />
  );
}

function FileGrid({ entries, ops, tf, caps, muted }: ViewProps) {
  return (
    <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2.5", muted && "opacity-70")}>
      {entries.map((entry) => {
        const pinned = isFilePinned(entry.path);
        const isRenaming = ops.renamingPath === entry.path;
        const isDrop = entry.is_directory && ops.dragOverPath === entry.path;
        return (
          <div
            key={entry.path}
            draggable={caps.move && !isRenaming}
            onDragStart={caps.move ? (e) => ops.onDragStart(e, entry) : undefined}
            onDragOver={caps.move && entry.is_directory ? (e) => ops.onAllowDrop(e, entry.path) : undefined}
            onDragLeave={caps.move && entry.is_directory ? ops.onDragLeaveDir : undefined}
            onDrop={caps.move && entry.is_directory ? (e) => ops.onDropDir(e, entry.path) : undefined}
            onContextMenu={(e) => ops.onContextMenu(e, entry)}
            className={cn(
              "group relative flex flex-col items-center gap-2.5 rounded-xl border border-transparent p-3 text-center transition-colors hover:border-border hover:bg-card",
              isDrop && "border-live bg-live/10 ring-2 ring-live",
            )}
          >
            {/* Star (favorite) — always visible when pinned; otherwise on hover. */}
            {caps.pin && (
            <button
              type="button"
              onClick={() => ops.onTogglePin(entry)}
              aria-label={pinned ? tf.unfavorite : tf.favorite}
              className={cn(
                "absolute left-1 top-1 z-[1] grid h-6 w-6 place-items-center rounded-md transition-opacity",
                pinned ? "opacity-100 text-live" : "opacity-0 text-muted-foreground group-hover:opacity-100 hover:text-foreground",
              )}
            >
              <Star className={cn("h-3.5 w-3.5", pinned && "fill-live")} />
            </button>
            )}
            {isRenaming ? (
              <div className="flex w-full flex-col items-center gap-2.5">
                <FileTypeIcon name={entry.name} isDirectory={entry.is_directory} size="lg" />
                <RenameInput
                  value={ops.renameValue}
                  onChange={ops.onRenameValue}
                  onCommit={() => ops.onRenameCommit(entry)}
                  onCancel={ops.onRenameCancel}
                  className="w-full text-center text-xs"
                />
              </div>
            ) : (
              <button
                type="button"
                disabled={!caps.preview && !caps.navigate}
                onClick={() => ops.onOpen(entry)}
                onKeyDown={(e) => {
                  if (e.key === "F2" && caps.rename) {
                    e.preventDefault();
                    ops.onBeginRename(entry);
                  }
                }}
                className="flex w-full flex-col items-center gap-2.5 disabled:cursor-default"
                title={entry.name}
              >
                <FileTypeIcon name={entry.name} isDirectory={entry.is_directory} size="lg" />
                <span className="line-clamp-2 w-full break-words text-xs leading-snug text-foreground">{entry.name}</span>
              </button>
            )}
            {/* Actions on hover (corner). */}
            {!isRenaming && (
              <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {caps.download && !entry.is_directory && (
                  <button
                    type="button"
                    onClick={() => ops.onDownload(entry)}
                    aria-label={tf.download}
                    className="grid h-6 w-6 place-items-center rounded-md bg-card/90 text-muted-foreground shadow-sm hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                )}
                {caps.rename && (
                <button
                  type="button"
                  onClick={() => ops.onBeginRename(entry)}
                  aria-label={tf.rename}
                  className="grid h-6 w-6 place-items-center rounded-md bg-card/90 text-muted-foreground shadow-sm hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                )}
                {caps.delete && (
                <button
                  type="button"
                  onClick={() => ops.onDelete(entry)}
                  aria-label={t_delete(tf, entry.name)}
                  className="grid h-6 w-6 place-items-center rounded-md bg-card/90 text-muted-foreground shadow-sm hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista — linhas detalhadas                                           */
/* ------------------------------------------------------------------ */

function FileList({ entries, ops, tf, caps, muted }: ViewProps) {
  const cols = "grid-cols-[minmax(10rem,1fr)_6rem_11rem_7.5rem]";
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border", muted && "opacity-70")}>
      <div className={cn("grid items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 type-micro uppercase tracking-wide text-muted-foreground", cols)}>
        <span>{tf.colName}</span>
        <span className="text-right">{tf.colSize}</span>
        <span>{tf.colModified}</span>
        <span className="text-right">{tf.colActions}</span>
      </div>
      {entries.map((entry) => {
        const pinned = isFilePinned(entry.path);
        const isRenaming = ops.renamingPath === entry.path;
        const isDrop = entry.is_directory && ops.dragOverPath === entry.path;
        return (
          <div
            key={entry.path}
            draggable={caps.move && !isRenaming}
            onDragStart={caps.move ? (e) => ops.onDragStart(e, entry) : undefined}
            onDragOver={caps.move && entry.is_directory ? (e) => ops.onAllowDrop(e, entry.path) : undefined}
            onDragLeave={caps.move && entry.is_directory ? ops.onDragLeaveDir : undefined}
            onDrop={caps.move && entry.is_directory ? (e) => ops.onDropDir(e, entry.path) : undefined}
            onContextMenu={(e) => ops.onContextMenu(e, entry)}
            className={cn(
              "group grid items-center gap-3 border-b border-border/60 px-4 py-1.5 text-sm last:border-b-0 hover:bg-card",
              cols,
              isDrop && "bg-live/10 ring-1 ring-inset ring-live",
            )}
          >
            {isRenaming ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <FileTypeIcon name={entry.name} isDirectory={entry.is_directory} size="sm" />
                <RenameInput
                  value={ops.renameValue}
                  onChange={ops.onRenameValue}
                  onCommit={() => ops.onRenameCommit(entry)}
                  onCancel={ops.onRenameCancel}
                  className="min-w-0 flex-1 text-sm"
                />
              </div>
            ) : (
              <button
                type="button"
                disabled={!caps.preview && !caps.navigate}
                onClick={() => ops.onOpen(entry)}
                onKeyDown={(e) => {
                  if (e.key === "F2" && caps.rename) {
                    e.preventDefault();
                    ops.onBeginRename(entry);
                  }
                }}
                className="flex min-w-0 items-center gap-2.5 text-left disabled:cursor-default"
                title={entry.name}
              >
                <FileTypeIcon name={entry.name} isDirectory={entry.is_directory} size="sm" />
                <span className="truncate text-foreground">{entry.name}</span>
              </button>
            )}
            <span className="text-right text-xs tabular-nums text-muted-foreground">{formatBytes(entry.size)}</span>
            <span className="truncate text-xs text-muted-foreground">
              {Number.isFinite(entry.mtime) ? DATE_FORMAT.format(entry.mtime * 1000) : "—"}
            </span>
            <span className="flex justify-end gap-0.5">
              {caps.pin && (
              <button
                type="button"
                onClick={() => ops.onTogglePin(entry)}
                aria-label={pinned ? tf.unfavorite : tf.favorite}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md transition-all",
                  pinned ? "text-live" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground",
                )}
              >
                <Star className={cn("h-4 w-4", pinned && "fill-live")} />
              </button>
              )}
              {caps.rename && (
              <button
                type="button"
                onClick={() => ops.onBeginRename(entry)}
                aria-label={tf.rename}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
              >
                <Pencil className="h-4 w-4" />
              </button>
              )}
              {caps.download && !entry.is_directory && (
                <button
                  type="button"
                  onClick={() => ops.onDownload(entry)}
                  aria-label={tf.download}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
                >
                  <Download className="h-4 w-4" />
                </button>
              )}
              {caps.delete && (
              <button
                type="button"
                onClick={() => ops.onDelete(entry)}
                aria-label={t_delete(tf, entry.name)}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function t_delete(tf: ReturnType<typeof useI18n>["t"]["files"], name: string): string {
  return tf.confirmDeleteTitle.replace("{name}", name);
}

/* ------------------------------------------------------------------ */
/* Context menu (right click) — an item or empty area                  */
/* ------------------------------------------------------------------ */

function FileContextMenu({
  x,
  y,
  entry,
  pinned,
  onClose,
  onOpenEntry,
  onDownload,
  onRename,
  onTogglePin,
  onDelete,
  onUpload,
  onNewFolder,
  tf,
  caps,
}: {
  x: number;
  y: number;
  entry: ManagedFileEntry | null;
  pinned: boolean;
  onClose: () => void;
  onOpenEntry: () => void;
  onDownload: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onUpload: () => void;
  onNewFolder: () => void;
  tf: ReturnType<typeof useI18n>["t"]["files"];
  caps: FileCaps;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Clampa dentro da viewport (menu ~ 13rem × 17rem).
  const left = Math.min(x, window.innerWidth - 216);
  const top = Math.min(y, window.innerHeight - 288);
  const item =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted";
  const run = (fn: () => void) => (e: ReactMouseEvent) => {
    e.stopPropagation();
    onClose();
    fn();
  };

  return createPortal(
    <div
      className="fixed z-50 min-w-[13rem] rounded-xl border border-border bg-card p-1 shadow-pop"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {entry ? (
        <>
          {(caps.preview || caps.navigate) && (
            <button type="button" className={item} onClick={run(onOpenEntry)}>
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              {tf.open}
            </button>
          )}
          {caps.download && !entry.is_directory && (
            <button type="button" className={item} onClick={run(onDownload)}>
              <Download className="h-4 w-4 text-muted-foreground" />
              {tf.download}
            </button>
          )}
          {caps.rename && (
            <button type="button" className={item} onClick={run(onRename)}>
              <Pencil className="h-4 w-4 text-muted-foreground" />
              {tf.rename}
            </button>
          )}
          {caps.pin && (
            <button type="button" className={item} onClick={run(onTogglePin)}>
              <Star className={cn("h-4 w-4", pinned ? "fill-live text-live" : "text-muted-foreground")} />
              {pinned ? tf.unfavorite : tf.favorite}
            </button>
          )}
          {caps.delete && (
            <>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className={cn(item, "text-destructive hover:bg-destructive/10")}
                onClick={run(onDelete)}
              >
                <Trash2 className="h-4 w-4" />
                {tf.delete}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          {caps.upload && (
            <button type="button" className={item} onClick={run(onUpload)}>
              <Upload className="h-4 w-4 text-muted-foreground" />
              {tf.upload}
            </button>
          )}
          {caps.mkdir && (
            <button type="button" className={item} onClick={run(onNewFolder)}>
              <FolderPlus className="h-4 w-4 text-muted-foreground" />
              {tf.newFolder}
            </button>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
