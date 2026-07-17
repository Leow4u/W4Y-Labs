import { useState } from "react";
import {
  Download,
  ExternalLink,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  type LucideIcon,
} from "lucide-react";

import { api, type ManagedFileEntry } from "@/lib/api";
import { isLocalPath, readLocalFileDataUrl } from "@/lib/localFile";
import { FilePreview, isPreviewable } from "@/components/files/FilePreview";
import { useI18n } from "@/i18n";
import type { Translations } from "@/i18n/types";

export interface FileRef {
  name: string;
  /** Local file path readable via /api/files/read (absolute-under-root or relative). */
  path?: string;
  /** Remote media URL (MEDIA:https://…) — opened in a new tab instead of downloaded. */
  url?: string;
}

// Card look per file type — Office-style brand "favicon" (colored square +
// white glyph: Excel's green X, Word's blue W, PowerPoint's orange P, red
// PDF), all inline (no external asset).
interface FileKind {
  /** Brand glyph (letter + color). Null → generic lucide icon. */
  glyph: { text: string; bg: string } | null;
  Icon: LucideIcon;
  labelKey: keyof Translations["chat"];
}
function fileKind(name: string): FileKind {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (["xlsx", "xls", "csv", "ods"].includes(ext))
    return { glyph: { text: "X", bg: "#217346" }, Icon: FileSpreadsheet, labelKey: "fileSheet" };
  if (ext === "pdf")
    return { glyph: { text: "PDF", bg: "#DC2626" }, Icon: FileText, labelKey: "filePdf" };
  if (["doc", "docx", "odt"].includes(ext))
    return { glyph: { text: "W", bg: "#2B579A" }, Icon: FileText, labelKey: "fileDoc" };
  if (["pptx", "ppt"].includes(ext))
    return { glyph: { text: "P", bg: "#D24726" }, Icon: FileText, labelKey: "fileDoc" };
  if (["md", "txt", "json", "html", "htm"].includes(ext))
    return { glyph: null, Icon: FileText, labelKey: "fileDoc" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
    return { glyph: { text: "IMG", bg: "#7C3AED" }, Icon: FileImage, labelKey: "fileImage" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext))
    return { glyph: { text: "ZIP", bg: "#D97706" }, Icon: FileIcon, labelKey: "fileGeneric" };
  return { glyph: null, Icon: FileIcon, labelKey: "fileGeneric" };
}

/** "Page" with a folded corner (claude.ai style) + the type accent in the middle. */
function PageGlyph({ kind }: { kind: FileKind }) {
  return (
    <span
      aria-hidden
      className="relative grid h-[52px] w-[42px] shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background"
    >
      {/* corner fold */}
      <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-bl-lg border-b border-l border-border bg-muted" />
      {kind.glyph ? (
        <span
          className="font-bold"
          style={{
            color: kind.glyph.bg,
            fontSize: kind.glyph.text.length > 1 ? "11px" : "16px",
            letterSpacing: kind.glyph.text.length > 1 ? "0.02em" : undefined,
          }}
        >
          {kind.glyph.text}
        </span>
      ) : (
        <kind.Icon className="h-5 w-5 text-muted-foreground" />
      )}
    </span>
  );
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
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<ManagedFileEntry | null>(null);
  const kind = fileKind(file.name);

  // The agent often ANNOUNCES the path before the file exists (seen live:
  // subagent still generating the .pptx). Clicking too early yields a 404 —
  // the error is TRANSIENT: it goes back to the download icon to retry.
  const flagError = () => {
    setError(true);
    setTimeout(() => setError(false), 2500);
  };

  const download = async (entry?: ManagedFileEntry) => {
    const path = entry?.path ?? file.path;
    if (!path) return;
    setLoading(true);
    setError(false);
    try {
      // Local (desktop) mode: a user-machine path (C:\… / MSYS /c/…) does not
      // exist on the server — read it through the session's executor instead.
      // A null result (executor off, binary file, outside the vault) is the
      // same transient error the 404 path already shows.
      let dataUrl: string;
      let name: string | undefined;
      if (isLocalPath(path)) {
        const local = await readLocalFileDataUrl(path);
        if (!local) throw new Error("local read failed");
        dataUrl = local.data_url;
        name = local.name;
      } else {
        const res = await api.readFile(path);
        dataUrl = res.data_url;
        name = res.name;
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = name || entry?.name || file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      flagError();
    } finally {
      setLoading(false);
    }
  };

  // Same logic as Arquivos (Onda 2): previewable (image/pdf/text) opens in the
  // overlay WITHOUT downloading; the rest downloads; a remote URL opens in a new
  // tab. Local (user-machine) paths skip the overlay — FilePreview reads via the
  // server APIs, which cannot reach the user's disk — and download directly.
  const canPreview =
    !file.url &&
    Boolean(file.path) &&
    !isLocalPath(file.path as string) &&
    isPreviewable(file.name, null);
  const asEntry = (): ManagedFileEntry => ({
    name: file.name,
    path: file.path as string,
    is_directory: false,
    size: null,
    mtime: 0,
    mime_type: null,
  });

  // Click on the card BODY = primary action: preview / download / open.
  const openPrimary = () => {
    if (file.url) {
      window.open(file.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (canPreview) {
      setPreview(asEntry());
      return;
    }
    void download();
  };

  // Button on the right: keeps "Baixar" (local) / "Abrir link" (URL) — direct
  // download, without going through the preview (mirrors the download button in
  // Arquivos, and the 09/07 feedback asked for a real "Baixar" button).
  const activate = () => {
    if (file.url) {
      window.open(file.url, "_blank", "noopener,noreferrer");
      return;
    }
    void download();
  };

  // claude.ai style (09/07 feedback): full-width HORIZONTAL card, name without
  // the extension + extension in CAPS, and a real "Baixar" button on the right
  // (not a tiny icon). Always sans — even inside the serif prose.
  const ext = (file.name.split(".").pop() ?? "").toUpperCase();
  const displayName = file.name.replace(/\.[A-Za-z0-9]{1,8}$/, "") || file.name;

  return (
    <>
      <div className="flex w-full items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3 font-sans shadow-card transition-shadow hover:shadow-pop">
        <button
          type="button"
          onClick={openPrimary}
          title={file.name}
          className="flex min-w-0 flex-1 items-center gap-3.5 rounded-lg text-left"
        >
          <PageGlyph kind={kind} />
          <span className="min-w-0 flex-1">
            <span className="block truncate type-body font-medium text-foreground">
              {displayName}
            </span>
            <span className="mt-0.5 block type-caption uppercase tracking-[0.06em] text-muted-foreground">
              {ext && ext.length <= 5 ? ext : (t.chat[kind.labelKey] as string)}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={activate}
          disabled={loading}
          className={`shrink-0 rounded-lg border px-4 py-2 type-ui font-medium transition-colors ${
            error
              ? "border-destructive/40 text-destructive hover:bg-destructive/5"
              : "border-border bg-background text-foreground hover:bg-muted"
          }`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : error ? (
            t.common.retry
          ) : file.url ? (
            <span className="flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              {t.chat.openLink}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" />
              {t.chat.downloadFile}
            </span>
          )}
        </button>
      </div>
      {preview && (
        <FilePreview
          entry={preview}
          onClose={() => setPreview(null)}
          onDownload={(e) => void download(e)}
        />
      )}
    </>
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

// "Bare" ABSOLUTE path cited in the prose (e.g. "salvo em `/opt/data/x.xlsx`").
// The agent doesn't always emit the MEDIA: token — without this the file never
// becomes a download card (seen live during curation). Anti-false-positive
// rules: starts with "/", ≥2 segments, known document/media extension, and is
// not the suffix of a URL/word (lookbehind). The text is NOT altered (the
// citation is part of the sentence) — it just gains the card, with dedupe.
const KNOWN_FILE_EXT =
  "xlsx|xls|csv|ods|pdf|docx|doc|pptx|ppt|odt|md|txt|json|zip|rar|7z|png|jpe?g|gif|webp|svg|mp3|mp4|wav|html?";
const BARE_PATH_RE = new RegExp(
  `(?<![\\w:./])((?:/[\\w.\\-]+){2,}\\.(?:${KNOWN_FILE_EXT}))\\b`,
  "gi",
);

const unquote = (s: string) => s.replace(/^[`"']+|[`"']+$/g, "").trim();
const basename = (p: string) => p.split(/[/\\]/).pop() || p;

// ── Connect Links (Conectores / Composio) ─────────────────────────────
// The agent connects apps through the chat (COMPOSIO_MANAGE_CONNECTIONS) and
// returns a Connect Link. Here it leaves the prose (markdown or bare URL, with
// or without the 👉 the agent usually adds) and becomes an auth ConnectLinkCard.
const CONNECT_URL_SRC =
  "https?:\\/\\/(?:dashboard|connect|app)\\.composio\\.dev\\/link\\/[A-Za-z0-9_-]+";
const CONNECT_MD_RE = new RegExp(
  `(?:👉\\s*)?\\[[^\\]]*\\]\\(\\s*(${CONNECT_URL_SRC})[^)]*\\)`,
  "gi",
);
const CONNECT_BARE_RE = new RegExp(`(?:👉\\s*)?[\`<]?(${CONNECT_URL_SRC})[\`>]?`, "gi");

export function extractConnectLinks(content: string): { text: string; links: string[] } {
  const links: string[] = [];
  const push = (u: string) => {
    if (!links.includes(u)) links.push(u);
  };
  let text = content.replace(CONNECT_MD_RE, (_m, u: string) => {
    push(u);
    return "";
  });
  text = text.replace(CONNECT_BARE_RE, (_m, u: string) => {
    push(u);
    return "";
  });
  return { text, links };
}

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

  // Bare paths: add the card without touching the text.
  const seen = new Set(files.map((f) => f.path).filter(Boolean));
  for (const m of text.matchAll(BARE_PATH_RE)) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    files.push({ path, name: basename(path) });
  }

  return { text, files };
}
