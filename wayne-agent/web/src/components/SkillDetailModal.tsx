/**
 * SkillDetailModal — leitura de uma habilidade (SKILL.md + references/) num
 * modal centralizado, no mesmo padrão do SettingsOverlay (portal p/ body,
 * backdrop clicável, altura fixa, Escape fecha, `settings-modal` p/ Title Case).
 *
 * Aberto ao clicar no corpo de um card da grade de Habilidades. Carrega o
 * SKILL.md via api.getSkillContent; a árvore de arquivos à esquerda tenta
 * listar a pasta da skill (derivada de content.path) via api.listFiles e ler
 * cada arquivo via api.readFile. Se a Files API não alcançar a pasta (fora do
 * root gerenciado) faz FALLBACK gracioso: só "SKILL.md", sem quebrar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/** Decode a `data:` URL (base64 or plain) into UTF-8 text. Returns "" on any
 *  failure so a binary/undecodable reference never blows up the reader. */
function dataUrlToText(dataUrl: string): string {
  try {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return "";
    const meta = dataUrl.slice(5, comma); // strip "data:"
    const payload = dataUrl.slice(comma + 1);
    if (/;base64/i.test(meta)) {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return "";
  }
}

/** Trigger a client-side download of `text` as `<filename>`. */
function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface TreeNode {
  /** Display label in the tree. */
  label: string;
  /** Absolute managed-files path (undefined for the synthetic SKILL.md node). */
  path?: string;
  /** true = SKILL.md pseudo-node (served from getSkillContent, not readFile). */
  isSkillMd: boolean;
  /** Nesting depth for indentation. */
  depth: number;
}

export function SkillDetailModal({
  open,
  skillName,
  onClose,
}: {
  open: boolean;
  skillName: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();

  // SKILL.md content (the primary document).
  const [skillMd, setSkillMd] = useState("");
  const [skillPath, setSkillPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // File tree (SKILL.md always present; references/ discovered via Files API).
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<TreeNode | null>(null);

  // Body currently shown (SKILL.md or a reference file's decoded text).
  const [body, setBody] = useState("");
  const [bodyLoading, setBodyLoading] = useState(false);

  // Chrome state: "..." menu open + fullscreen toggle.
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /* ---- Escape closes + scroll lock while open ---- */
  useEffect(() => {
    if (!open) return;
    // Capture phase + stopPropagation: quando este modal é aberto POR CIMA do
    // SettingsOverlay (Habilidades dentro de Configuração), ambos escutam
    // Escape no document. Interceptando na captura e barrando a propagação,
    // um Escape fecha só o detalhe da skill — não derruba a Configuração junto.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  /* ---- Close the "..." menu on outside click ---- */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  /* ---- Reset chrome each time a new skill opens ---- */
  useEffect(() => {
    if (open) {
      setFullscreen(false);
      setMenuOpen(false);
    }
  }, [open, skillName]);

  /* ---- Load SKILL.md + attempt the references tree on open ---- */
  useEffect(() => {
    if (!open || !skillName) return;
    let cancelled = false;
    setLoading(true);
    setSkillMd("");
    setSkillPath(null);
    setBody("");

    const skillNode: TreeNode = {
      label: "SKILL.md",
      isSkillMd: true,
      depth: 0,
    };

    api
      .getSkillContent(skillName)
      .then(async (c) => {
        if (cancelled) return;
        setSkillMd(c.content);
        setSkillPath(c.path);
        setBody(c.content);
        setSelected(skillNode);

        // Best-effort references tree. The skill dir is content.path minus the
        // trailing SKILL.md. If Files API can't reach it (outside the managed
        // root) we swallow the error and keep the SKILL.md-only tree.
        const dir = c.path.replace(/[\\/]SKILL\.md$/i, "");
        let nodes: TreeNode[] = [skillNode];
        if (dir && dir !== c.path) {
          try {
            const listing = await api.listFiles(dir);
            const extra: TreeNode[] = [];
            for (const entry of listing.entries) {
              if (entry.name.toLowerCase() === "skill.md") continue;
              if (entry.is_directory) {
                extra.push({
                  label: `${entry.name}/`,
                  path: entry.path,
                  isSkillMd: false,
                  depth: 0,
                });
                // One level into references-style dirs is enough for a reader.
                try {
                  const sub = await api.listFiles(entry.path);
                  for (const f of sub.entries) {
                    if (f.is_directory) continue;
                    extra.push({
                      label: f.name,
                      path: f.path,
                      isSkillMd: false,
                      depth: 1,
                    });
                  }
                } catch {
                  /* nested listing failed — show the folder header alone */
                }
              } else {
                extra.push({
                  label: entry.name,
                  path: entry.path,
                  isSkillMd: false,
                  depth: 0,
                });
              }
            }
            extra.sort((a, b) => a.label.localeCompare(b.label));
            nodes = [skillNode, ...extra];
          } catch {
            /* listFiles unreachable — graceful fallback to SKILL.md only */
          }
        }
        if (!cancelled) setTree(nodes);
      })
      .catch(() => {
        if (cancelled) return;
        setSkillMd("");
        setBody("");
        setTree([skillNode]);
        setSelected(skillNode);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, skillName]);

  /* ---- Select a tree node → load its body ---- */
  const selectNode = useCallback(
    (node: TreeNode) => {
      setSelected(node);
      if (node.isSkillMd) {
        setBody(skillMd);
        return;
      }
      if (!node.path) return;
      setBodyLoading(true);
      api
        .readFile(node.path)
        .then((f) => setBody(dataUrlToText(f.data_url)))
        .catch(() => setBody(""))
        .finally(() => setBodyLoading(false));
    },
    [skillMd],
  );

  const downloadCurrent = useCallback(() => {
    setMenuOpen(false);
    if (!skillName) return;
    downloadText(`${skillName}.md`, skillMd);
  }, [skillName, skillMd]);

  const isMarkdownBody = useMemo(() => {
    if (selected?.isSkillMd) return true;
    const label = selected?.label.toLowerCase() ?? "";
    return label.endsWith(".md") || label.endsWith(".markdown");
  }, [selected]);

  if (!open || !skillName) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop — click closes. */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Card. `settings-modal` activates the Title Case softening. Fullscreen
          toggles between the fixed reading size and near-viewport. */}
      <div
        className={cn(
          "settings-modal relative flex w-full flex-col overflow-hidden rounded-xl",
          "border border-current/20 bg-background-base",
          "shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7)]",
          fullscreen
            ? "h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:h-[calc(100vh-3rem)] sm:max-w-[calc(100vw-3rem)]"
            : "h-[min(85vh,860px)] max-w-4xl",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={skillName}
      >
        {/* Top bar: name + "..." menu (Download), fullscreen, close. */}
        <div className="flex items-center gap-2 border-b border-current/10 px-4 py-2.5">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono-ui text-sm">
            {skillName}
          </span>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More"
              className={cn(
                "grid h-8 w-8 place-items-center rounded text-muted-foreground/80",
                "transition-colors hover:bg-current/10 hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40",
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                className={cn(
                  "absolute right-0 top-full z-10 mt-1 min-w-[10rem] overflow-hidden rounded-md",
                  "border border-current/20 bg-background-base shadow-lg",
                )}
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={downloadCurrent}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-current/10"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t.configUser.skDownload}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={t.configUser.skFullscreen}
            title={t.configUser.skFullscreen}
            className={cn(
              "grid h-8 w-8 place-items-center rounded text-muted-foreground/80",
              "transition-colors hover:bg-current/10 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40",
            )}
          >
            {fullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            title={t.common.close}
            className={cn(
              "grid h-8 w-8 place-items-center rounded text-muted-foreground/80",
              "transition-colors hover:bg-current/10 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40",
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: file tree (left) + document (right). */}
        <div className="flex min-h-0 flex-1">
          {/* File tree. Only shows when there are references beyond SKILL.md;
              a lone SKILL.md needs no sidebar chrome. */}
          {tree.length > 1 && (
            <aside className="hidden w-52 shrink-0 overflow-y-auto border-r border-current/10 p-2 sm:block">
              {tree.map((node, i) => {
                const isActive =
                  selected != null &&
                  (node.isSkillMd
                    ? selected.isSkillMd
                    : selected.path === node.path);
                const isFolder = node.label.endsWith("/");
                return (
                  <button
                    key={`${node.label}-${i}`}
                    type="button"
                    disabled={isFolder}
                    onClick={() => !isFolder && selectNode(node)}
                    style={{ paddingLeft: `${0.5 + node.depth * 0.75}rem` }}
                    className={cn(
                      "flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-xs",
                      isFolder
                        ? "cursor-default font-medium text-text-tertiary"
                        : "hover:bg-current/10",
                      isActive && !isFolder && "bg-current/10 text-foreground",
                    )}
                  >
                    {!isFolder && (
                      <FileText className="h-3 w-3 shrink-0 opacity-60" />
                    )}
                    <span className="truncate">{node.label}</span>
                  </button>
                );
              })}
            </aside>
          )}

          {/* Document pane. */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : bodyLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : body.trim() === "" ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t.skills.noDescription}
              </p>
            ) : isMarkdownBody ? (
              <Markdown content={body} />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-secondary">
                {body}
              </pre>
            )}
            {skillPath && !loading && (
              <p className="mt-4 truncate font-mono text-[0.65rem] text-text-tertiary">
                {skillPath}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
