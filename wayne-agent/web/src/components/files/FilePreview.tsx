/**
 * FilePreview — opens image / PDF / text WITHOUT downloading (Onda 2 of Files).
 * Reuses `api.readFile` (already returns mime_type + base64 data_url). Overlay
 * via portal (ancestors with transform become the containing block — lesson
 * from ProjectEditModal). Non-previewable types fall back to a state with a
 * download button.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

import { api } from "@/lib/api";
import type { ManagedFileEntry } from "@/lib/api";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { FileTypeIcon } from "@/lib/file-icons";
import { useI18n } from "@/i18n";
import { cn, themedBody } from "@/lib/utils";

type Kind = "image" | "pdf" | "text" | "none";

function previewKind(name: string, mime: string | null): Kind {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext))
    return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (
    m.startsWith("text/") ||
    ["md", "txt", "log", "json", "csv", "yaml", "yml", "html", "htm", "js", "jsx", "ts", "tsx", "py", "css", "xml", "sh", "toml"].includes(ext)
  )
    return "text";
  return "none";
}

export function FilePreview({
  entry,
  onClose,
  onDownload,
}: {
  entry: ManagedFileEntry;
  onClose: () => void;
  onDownload: (e: ManagedFileEntry) => void;
}) {
  const { t } = useI18n();
  const tf = t.files;
  const kind = previewKind(entry.name, entry.mime_type);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(kind !== "none");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (kind === "none") return;
    let dead = false;
    setLoading(true);
    setFailed(false);
    api
      .readFile(entry.path)
      .then(async (file) => {
        if (dead) return;
        setDataUrl(file.data_url);
        if (kind === "text") {
          try {
            const res = await fetch(file.data_url);
            const body = await res.text();
            if (!dead) setText(body);
          } catch {
            if (!dead) setText("");
          }
        }
      })
      .catch(() => {
        if (!dead) setFailed(true);
      })
      .finally(() => {
        if (!dead) setLoading(false);
      });
    return () => {
      dead = true;
    };
  }, [entry.path, kind]);

  return createPortal(
    <div className={cn(themedBody, "fixed inset-0 z-50 flex items-center justify-center p-4")}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <FileTypeIcon name={entry.name} isDirectory={false} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{entry.name}</span>
          <button
            type="button"
            onClick={() => onDownload(entry)}
            aria-label={tf.download}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-background/40">
          {loading ? (
            <div className="grid h-full min-h-[240px] place-items-center">
              <Spinner />
            </div>
          ) : failed || kind === "none" ? (
            <div className="grid min-h-[240px] place-items-center px-6 py-10 text-center">
              <div>
                <p className="text-sm text-muted-foreground">{tf.previewUnavailable}</p>
                <button
                  type="button"
                  onClick={() => onDownload(entry)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <Download className="h-4 w-4" />
                  {tf.download}
                </button>
              </div>
            </div>
          ) : kind === "image" && dataUrl ? (
            <div className="grid min-h-[240px] place-items-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dataUrl} alt={entry.name} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
            </div>
          ) : kind === "pdf" && dataUrl ? (
            <iframe title={entry.name} src={dataUrl} className="h-[74vh] w-full border-0 bg-white" />
          ) : kind === "text" ? (
            <pre className="whitespace-pre-wrap break-words px-5 py-4 font-mono text-[13px] leading-relaxed text-foreground">
              {text}
            </pre>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Is a file previewable (opens in the overlay instead of downloading)? */
export function isPreviewable(name: string, mime: string | null): boolean {
  return previewKind(name, mime) !== "none";
}
