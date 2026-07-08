import { useState } from "react";
import { Download, ExternalLink, File as FileIcon, Loader2 } from "lucide-react";

import { api } from "@/lib/api";

export interface FileRef {
  name: string;
  /** Local file path readable via /api/files/read (absolute-under-root or relative). */
  path?: string;
  /** Remote media URL (MEDIA:https://…) — opened in a new tab instead of downloaded. */
  url?: string;
}

/**
 * A file/media referenced by the assistant. The agent emits these as tokens in
 * its prose that the desktop/TUI turns into chips; the two conventions we see:
 *   - MEDIA:<abs-path> | MEDIA:https://…   (the WebUI convention — prompt_builder
 *     PLATFORM_HINTS["webui"]); local paths are absolute under /opt/data.
 *   - @session:<profile>/<path>            (a desktop convention seen in history;
 *     path is already relative to the managed-files root).
 * Local files download via api.readFile → data URL → <a download> (same as the
 * Files page). Remote URLs just open.
 */
export function FileRefCard({ file }: { file: FileRef }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const activate = async () => {
    if (file.url) {
      window.open(file.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!file.path) return;
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
      onClick={activate}
      className="group flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
    >
      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{file.name}</span>
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : error ? (
        <span className="shrink-0 text-xs text-destructive">✕</span>
      ) : file.url ? (
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
      ) : (
        <Download className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
      )}
    </button>
  );
}

// ── Token extraction ──────────────────────────────────────────────────
//
// MEDIA:<path> — the canonical WebUI convention. Path is a quoted string, an
// https URL, or an absolute local path ending in a known-ish extension. Mirrors
// (loosely) gateway MEDIA_TAG_CLEANUP_RE / ui-tui MEDIA_LINE_RE.
const MEDIA_RE =
  /[`"']?MEDIA:\s*(https?:\/\/[^\s`"')\]]+|(?:\/|~\/|[A-Za-z]:[/\\])[^\s`"')\]]+?\.[A-Za-z0-9]{1,8})[`"']?/gi;

// @session:<profile>/<path> — only treat as a FILE when the path carries an
// extension or a nested slash (a bare `@session:<profile>/<id>` is a session
// LINK, not a file — see tools/session_search_tool.py).
const SESSION_FILE_RE = /@session:[^/\s]+\/((?:\S+\/)?\S+\.[A-Za-z0-9]{1,8})/g;

// Sibling directives the agent may emit next to MEDIA:; strip from visible text.
const DIRECTIVE_RE = /\[\[(?:audio_as_voice|as_document)\]\]/g;

const unquote = (s: string) => s.replace(/^[`"']+|[`"']+$/g, "").trim();
const basename = (p: string) => p.split(/[/\\]/).pop() || p;

export function extractFileRefs(content: string): { text: string; files: FileRef[] } {
  const files: FileRef[] = [];

  let text = content.replace(MEDIA_RE, (_m, raw: string) => {
    const token = unquote(raw);
    if (/^https?:\/\//i.test(token)) {
      files.push({ url: token, name: basename(token.split("?")[0]) || token });
    } else {
      files.push({ path: token, name: basename(token) });
    }
    return "";
  });

  text = text.replace(SESSION_FILE_RE, (_m, path: string) => {
    files.push({ path, name: basename(path) });
    return "";
  });

  text = text.replace(DIRECTIVE_RE, "").replace(/^\s+/, "");
  return { text, files };
}
