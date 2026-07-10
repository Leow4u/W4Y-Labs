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

import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import type { Translations } from "@/i18n/types";

export interface FileRef {
  name: string;
  /** Local file path readable via /api/files/read (absolute-under-root or relative). */
  path?: string;
  /** Remote media URL (MEDIA:https://…) — opened in a new tab instead of downloaded. */
  url?: string;
}

// Cara do cartão por tipo de arquivo — "favicon" de marca estilo Office
// (quadrado colorido + glifo branco: X verde do Excel, W azul do Word, P
// laranja do PowerPoint, PDF vermelho), tudo inline (sem asset externo).
interface FileKind {
  /** Glifo de marca (letra + cor). Null → ícone lucide genérico. */
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

/** "Página" com canto dobrado (estilo claude.ai) + acento do tipo no meio. */
function PageGlyph({ kind }: { kind: FileKind }) {
  return (
    <span
      aria-hidden
      className="relative grid h-[52px] w-[42px] shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background"
    >
      {/* dobra do canto */}
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
  const kind = fileKind(file.name);

  // O agente costuma ANUNCIAR o caminho antes de o arquivo existir (visto ao
  // vivo: subagente ainda gerando o .pptx). Um clique cedo demais dá 404 —
  // o erro é TRANSITÓRIO: volta ao ícone de download pra tentar de novo.
  const flagError = () => {
    setError(true);
    setTimeout(() => setError(false), 2500);
  };

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
      flagError();
    } finally {
      setLoading(false);
    }
  };

  // Estilo claude.ai (feedback 09/07): cartão HORIZONTAL de largura cheia,
  // nome sem extensão + extensão em CAPS, e um botão "Baixar" de verdade à
  // direita (não um iconezinho). Sempre sans — mesmo dentro da prosa serifada.
  const ext = (file.name.split(".").pop() ?? "").toUpperCase();
  const displayName = file.name.replace(/\.[A-Za-z0-9]{1,8}$/, "") || file.name;

  return (
    <div className="flex w-full items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3 font-sans shadow-card transition-shadow hover:shadow-pop">
      <PageGlyph kind={kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate type-body font-medium text-foreground">
          {displayName}
        </span>
        <span className="mt-0.5 block type-caption uppercase tracking-[0.06em] text-muted-foreground">
          {ext && ext.length <= 5 ? ext : (t.chat[kind.labelKey] as string)}
        </span>
      </span>
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

// Caminho ABSOLUTO "nu" citado na prosa (ex.: "salvo em `/opt/data/x.xlsx`").
// O agente nem sempre emite o token MEDIA: — sem isto o arquivo não vira
// cartão de download (visto ao vivo na curadoria). Regras anti-falso-positivo:
// começa com "/", ≥2 segmentos, extensão de documento/mídia conhecida, e não
// é sufixo de URL/palavra (lookbehind). O texto NÃO é alterado (a citação faz
// parte da frase) — só ganha o cartão, com dedupe.
const KNOWN_FILE_EXT =
  "xlsx|xls|csv|ods|pdf|docx|doc|pptx|ppt|odt|md|txt|json|zip|rar|7z|png|jpe?g|gif|webp|svg|mp3|mp4|wav|html?";
const BARE_PATH_RE = new RegExp(
  `(?<![\\w:./])((?:/[\\w.\\-]+){2,}\\.(?:${KNOWN_FILE_EXT}))\\b`,
  "gi",
);

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

  // Paths nus: adiciona o cartão sem mexer no texto.
  const seen = new Set(files.map((f) => f.path).filter(Boolean));
  for (const m of text.matchAll(BARE_PATH_RE)) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    files.push({ path, name: basename(path) });
  }

  return { text, files };
}
