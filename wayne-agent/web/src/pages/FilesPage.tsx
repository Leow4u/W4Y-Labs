/**
 * FilesPage — a gaveta de arquivos do tenant, com cara de desktop (Onda 1).
 *
 * A raiz de /api/files é o HOME persistente (/opt/data), então:
 *   - SEPARA conteúdo do usuário do ruído do sistema (lib/file-curation) — a
 *     infra vai pra uma seção "Sistema" recolhida; ?full=1 mostra tudo cru.
 *   - Cada item ganha ÍCONE DE TIPO estilo desktop (lib/file-icons): pasta
 *     âmbar, X verde do Excel, W azul do Word, P laranja do PPT, PDF vermelho…
 *   - Navegação por TRILHA clicável (breadcrumb) + botão voltar.
 *   - Alterna GRADE (blocos de ícones) ↔ LISTA (linhas detalhadas).
 * Zero backend novo: a API já devolve name/size/mtime/mime_type + path/root.
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
import { partitionEntries, sortEntries } from "@/lib/file-curation";
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

  const internal = isInternalView();
  const activePath = listing?.path ?? currentPath ?? "";
  const canUpload = Boolean(activePath) && !uploading;

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
    else void downloadFile(entry);
  };

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

  return (
    <div
      className="relative flex min-w-0 max-w-full flex-col gap-4"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Toast toast={toast} />
      <PluginSlot name="files:top" />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void uploadFiles(e.currentTarget.files)}
      />

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
            <FileGrid entries={user} onOpen={openEntry} onDelete={setPendingDelete} onDownload={downloadFile} tf={tf} />
          ) : (
            <FileList entries={user} onOpen={openEntry} onDelete={setPendingDelete} onDownload={downloadFile} tf={tf} />
          )}
        </>
      )}

      {/* Overlay de drop — aparece só arrastando. */}
      {draggingFiles && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-live bg-live/10">
          <span className="flex items-center gap-2 rounded-lg bg-card px-4 py-2 text-sm font-medium text-foreground shadow-card">
            <Upload className="h-4 w-4 text-live" />
            {tf.dropHint}
          </span>
        </div>
      )}

      <PluginSlot name="files:bottom" />

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
  tf: ReturnType<typeof useI18n>["t"]["files"];
  muted?: boolean;
}

function FileGrid({ entries, onOpen, onDelete, onDownload, tf, muted }: ViewProps) {
  return (
    <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2.5", muted && "opacity-70")}>
      {entries.map((entry) => (
        <div
          key={entry.path}
          className="group relative flex flex-col items-center gap-2.5 rounded-xl border border-transparent p-3 text-center transition-colors hover:border-border hover:bg-card"
        >
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
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista — linhas detalhadas                                           */
/* ------------------------------------------------------------------ */

function FileList({ entries, onOpen, onDelete, onDownload, tf, muted }: ViewProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border", muted && "opacity-70")}>
      <div className="grid grid-cols-[minmax(10rem,1fr)_6rem_11rem_4rem] items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 type-micro uppercase tracking-wide text-muted-foreground">
        <span>{tf.colName}</span>
        <span className="text-right">{tf.colSize}</span>
        <span>{tf.colModified}</span>
        <span className="text-right">{tf.colActions}</span>
      </div>
      {entries.map((entry) => (
        <div
          key={entry.path}
          className="grid grid-cols-[minmax(10rem,1fr)_6rem_11rem_4rem] items-center gap-3 border-b border-border/60 px-4 py-1.5 text-sm last:border-b-0 hover:bg-card"
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
            {!entry.is_directory && (
              <button
                type="button"
                onClick={() => onDownload(entry)}
                aria-label={tf.download}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(entry)}
              aria-label={t_delete(tf, entry.name)}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function t_delete(tf: ReturnType<typeof useI18n>["t"]["files"], name: string): string {
  return tf.confirmDeleteTitle.replace("{name}", name);
}
