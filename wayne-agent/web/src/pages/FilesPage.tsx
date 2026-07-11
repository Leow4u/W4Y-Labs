/**
 * FilesPage — o explorador de arquivos do tenant, com cara de desktop.
 *
 * Onda 1: separa conteúdo do usuário do ruído do sistema (lib/file-curation;
 * sistema só no ?full=1), ícone de tipo estilo desktop (lib/file-icons),
 * trilha clicável, grade↔lista.
 * Onda 2: rail lateral (Acesso rápido/Projetos/Favoritos), faixa "Recentes"
 * no Início (scan raso por mtime), favoritar (estrela) e pré-visualização
 * inline (imagem/PDF/texto). Zero backend novo — a API já dá name/size/mtime/
 * mime_type + path/root, e o readFile dá o data_url pro preview.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderPlus,
  LayoutGrid,
  List as ListIcon,
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
import { api } from "@/lib/api";
import type { ManagedFileEntry, ManagedFilesResponse } from "@/lib/api";
import { FileTypeIcon } from "@/lib/file-icons";
import { partitionEntries, sortEntries, isSystemEntry } from "@/lib/file-curation";
import { prettifyProject } from "@/lib/projects";
import { isFilePinned, toggleFilePin, onPinnedFilesChange } from "@/lib/pinned-files";
import { FilesRail, type RailProject } from "@/components/files/FilesRail";
import { FilePreview, isPreviewable } from "@/components/files/FilePreview";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { PluginSlot } from "@/plugins";

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const VIEW_KEY = "w4y-files-view";

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

export default function FilesPage() {
  const { t } = useI18n();
  const tf = t.files;
  const { toast, showToast } = useToast();
  const { setAfterTitle, setEnd } = usePageHeader();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const [currentPath, setCurrentPath] = useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("path") ?? undefined,
  );
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
      /* melhor esforço */
    }
  };
  // Onda 2: preview, projetos do rail, recentes, e re-render ao (des)favoritar.
  const [preview, setPreview] = useState<ManagedFileEntry | null>(null);
  const [projects, setProjects] = useState<RailProject[]>([]);
  const [recents, setRecents] = useState<ManagedFileEntry[]>([]);
  const [, bumpPins] = useState(0);
  useEffect(() => onPinnedFilesChange(() => bumpPins((x) => x + 1)), []);

  const internal = isInternalView();
  const activePath = listing?.path ?? currentPath ?? "";
  const canUpload = Boolean(activePath) && !uploading;
  const root = listing?.locked_root ?? listing?.root ?? null;
  const isAtRoot = Boolean(root) && activePath === root;

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
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [currentPath],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(currentPath);
  }, [currentPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trilha de navegação (breadcrumb) a partir do path absoluto relativo à raiz.
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

  // Header: só o refresh (a trilha fica no corpo). Limpa o badge antigo.
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
      showToast(`${tf.createFailed}: ${e}`, "error");
    } finally {
      setCreating(false);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await api.uploadFile(joinPath(activePath, file.name), file, true);
      }
      showToast(tf.uploaded.replace("{n}", String(files.length)), "success");
      await load();
    } catch (e) {
      showToast(`${tf.uploadFailed}: ${e}`, "error");
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
      showToast(`${tf.downloadFailed}: ${e}`, "error");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteFile(pendingDelete.path, pendingDelete.is_directory);
      showToast(tf.deleted, "success");
      setPendingDelete(null);
      await load();
    } catch (e) {
      showToast(`${tf.deleteFailed}: ${e}`, "error");
    } finally {
      setDeleting(false);
    }
  };

  // Drag-drop na área toda.
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

  // Só o conteúdo do usuário. A visão interna (?full=1) mostra tudo cru; a
  // normal esconde as pastas de sistema (curadoria) — nem exibe, nem alcança.
  const user = useMemo(() => {
    const entries = listing?.entries ?? [];
    return sortEntries(internal ? entries : partitionEntries(entries).user);
  }, [listing?.entries, internal]);

  const isEmpty = !loading && listing && user.length === 0;

  // Rail: pastas de projects/ (nomes bonitos). Uma chamada quando a raiz é
  // conhecida — independente de onde a navegação está.
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

  // "Recentes" no Início: scan raso (root + até 8 pastas do usuário, 1 nível)
  // → arquivos mais recentes por mtime. Best-effort; falha = sem faixa.
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
        activePath={activePath}
        projects={projects}
        onNavigate={setCurrentPath}
        onPreview={setPreview}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
      <PluginSlot name="files:top" />

      {/* Barra: voltar + trilha (esq) · visão + ações (dir). */}
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
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex shrink-0 items-center">
                {i > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-muted-foreground" />}
                <button
                  type="button"
                  onClick={() => setCurrentPath(c.path)}
                  disabled={i === crumbs.length - 1}
                  className={cn(
                    "max-w-[14rem] truncate rounded px-1.5 py-0.5 transition-colors",
                    i === crumbs.length - 1
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
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
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Recentes — só no Início (scan raso por mtime). */}
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

      {loading && !listing ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner />
          {t.common.loading}
        </div>
      ) : isEmpty ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {tf.empty}
        </div>
      ) : (
        <>
          {/* Só o conteúdo do usuário. As pastas de sistema NÃO são exibidas nem
              alcançáveis pela UI normal (evita apagar o runtime sem querer) —
              a visão interna ?full=1 é a única que mostra tudo (partição acima
              coloca tudo em `user` quando internal). O backend ainda recusa
              apagar caminhos críticos como defesa extra. */}
          {view === "grid" ? (
            <FileGrid entries={user} onOpen={openEntry} onDelete={setPendingDelete} onDownload={downloadFile} onTogglePin={togglePin} tf={tf} />
          ) : (
            <FileList entries={user} onOpen={openEntry} onDelete={setPendingDelete} onDownload={downloadFile} onTogglePin={togglePin} tf={tf} />
          )}
        </>
      )}

        <PluginSlot name="files:bottom" />
      </div>

      {/* Overlay de drop — cobre rail+main; aparece só arrastando. */}
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
/* Grade — blocos de ícones (cara de desktop)                          */
/* ------------------------------------------------------------------ */

interface ViewProps {
  entries: ManagedFileEntry[];
  onOpen: (e: ManagedFileEntry) => void;
  onDelete: (e: ManagedFileEntry) => void;
  onDownload: (e: ManagedFileEntry) => void;
  onTogglePin: (e: ManagedFileEntry) => void;
  tf: ReturnType<typeof useI18n>["t"]["files"];
  muted?: boolean;
}

function FileGrid({ entries, onOpen, onDelete, onDownload, onTogglePin, tf, muted }: ViewProps) {
  return (
    <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2.5", muted && "opacity-70")}>
      {entries.map((entry) => {
        const pinned = isFilePinned(entry.path);
        return (
          <div
            key={entry.path}
            className="group relative flex flex-col items-center gap-2.5 rounded-xl border border-transparent p-3 text-center transition-colors hover:border-border hover:bg-card"
          >
            {/* Estrela (favoritar) — sempre visível quando fixado; senão no hover. */}
            <button
              type="button"
              onClick={() => onTogglePin(entry)}
              aria-label={pinned ? tf.unfavorite : tf.favorite}
              className={cn(
                "absolute left-1 top-1 grid h-6 w-6 place-items-center rounded-md transition-opacity",
                pinned ? "opacity-100 text-live" : "opacity-0 text-muted-foreground group-hover:opacity-100 hover:text-foreground",
              )}
            >
              <Star className={cn("h-3.5 w-3.5", pinned && "fill-live")} />
            </button>
            <button
              type="button"
              onClick={() => onOpen(entry)}
              className="flex w-full flex-col items-center gap-2.5"
              title={entry.name}
            >
              <FileTypeIcon name={entry.name} isDirectory={entry.is_directory} size="lg" />
              <span className="line-clamp-2 w-full break-words text-xs leading-snug text-foreground">{entry.name}</span>
            </button>
            {/* Ações no hover (canto). */}
            <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              {!entry.is_directory && (
                <button
                  type="button"
                  onClick={() => onDownload(entry)}
                  aria-label={tf.download}
                  className="grid h-6 w-6 place-items-center rounded-md bg-card/90 text-muted-foreground shadow-sm hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(entry)}
                aria-label={t_delete(tf, entry.name)}
                className="grid h-6 w-6 place-items-center rounded-md bg-card/90 text-muted-foreground shadow-sm hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista — linhas detalhadas                                           */
/* ------------------------------------------------------------------ */

function FileList({ entries, onOpen, onDelete, onDownload, onTogglePin, tf, muted }: ViewProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border", muted && "opacity-70")}>
      <div className="grid grid-cols-[minmax(10rem,1fr)_6rem_11rem_5.5rem] items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 type-micro uppercase tracking-wide text-muted-foreground">
        <span>{tf.colName}</span>
        <span className="text-right">{tf.colSize}</span>
        <span>{tf.colModified}</span>
        <span className="text-right">{tf.colActions}</span>
      </div>
      {entries.map((entry) => {
        const pinned = isFilePinned(entry.path);
        return (
          <div
            key={entry.path}
            className="group grid grid-cols-[minmax(10rem,1fr)_6rem_11rem_5.5rem] items-center gap-3 border-b border-border/60 px-4 py-1.5 text-sm last:border-b-0 hover:bg-card"
          >
            <button type="button" onClick={() => onOpen(entry)} className="flex min-w-0 items-center gap-2.5 text-left" title={entry.name}>
              <FileTypeIcon name={entry.name} isDirectory={entry.is_directory} size="sm" />
              <span className="truncate text-foreground">{entry.name}</span>
            </button>
            <span className="text-right text-xs tabular-nums text-muted-foreground">{formatBytes(entry.size)}</span>
            <span className="truncate text-xs text-muted-foreground">
              {Number.isFinite(entry.mtime) ? DATE_FORMAT.format(entry.mtime * 1000) : "—"}
            </span>
            <span className="flex justify-end gap-0.5">
              <button
                type="button"
                onClick={() => onTogglePin(entry)}
                aria-label={pinned ? tf.unfavorite : tf.favorite}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md transition-all",
                  pinned ? "text-live" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground",
                )}
              >
                <Star className={cn("h-4 w-4", pinned && "fill-live")} />
              </button>
              {!entry.is_directory && (
                <button
                  type="button"
                  onClick={() => onDownload(entry)}
                  aria-label={tf.download}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
                >
                  <Download className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(entry)}
                aria-label={t_delete(tf, entry.name)}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
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
