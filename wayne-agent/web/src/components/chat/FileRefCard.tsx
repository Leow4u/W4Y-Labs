import { useState } from "react";
import { Download, File as FileIcon, Loader2 } from "lucide-react";

import { api } from "@/lib/api";

export interface FileRef {
  /** Path relative to the managed-files root (the `@session:<profile>/` prefix stripped). */
  path: string;
  name: string;
}

/**
 * A generated file referenced by the assistant (via a `@session:<profile>/<path>`
 * token). Downloads on click, reusing the same mechanism as the Files page
 * (api.readFile → data URL → <a download>). Replaces the raw token, which
 * otherwise renders as ugly plain text glued to the message.
 */
export function FileRefCard({ file }: { file: FileRef }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const download = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.readFile(file.path);
      const a = document.createElement("a");
      a.href = res.data_url;
      a.download = res.name || file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      className="group flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
    >
      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{file.name}</span>
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : error ? (
        <span className="shrink-0 text-xs text-destructive">✕</span>
      ) : (
        <Download className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
      )}
    </button>
  );
}

// Assistant messages reference generated files with a `@session:<profile>/<path>`
// token (a desktop/TUI convention rendered as a file chip there). Pull those
// tokens out so we can render cards and keep the prose clean.
const FILE_REF_RE = /@session:[^/\s]+\/(\S+)/g;

export function extractFileRefs(content: string): { text: string; files: FileRef[] } {
  const files: FileRef[] = [];
  const text = content
    .replace(FILE_REF_RE, (_m, path: string) => {
      files.push({ path, name: path.split("/").pop() || path });
      return "";
    })
    .replace(/^\s+/, "");
  return { text, files };
}
