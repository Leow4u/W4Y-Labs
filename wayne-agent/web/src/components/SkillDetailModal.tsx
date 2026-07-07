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
  ChevronRight,
  Copy,
  FileText,
  FolderClosed,
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
  /** true = a folder header (references/ etc.) — collapsible, not selectable. */
  isFolder?: boolean;
  /** Label of the folder this file lives under (for collapse filtering). */
  parent?: string;
}

/** Split a SKILL.md into its leading YAML frontmatter and the markdown body.
 *  Manus-style: the frontmatter renders as a labelled YAML code block instead
 *  of leaking in as loose paragraph text. Returns null frontmatter when the
 *  document has no `---` fenced header. */
function splitFrontmatter(text: string): { frontmatter: string | null; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatter: null, body: text };
  return { frontmatter: m[1], body: text.slice(m[0].length) };
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

  // Collapsed folder labels (references/ etc.). Folders start collapsed —
  // Manus-style "> references" dropdown you click to expand.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

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
      setCollapsedFolders(new Set());
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
        // root) we swallow the error and keep the SKILL.md-only tree. Each
        // folder's children stay grouped RIGHT AFTER their header (so collapse
        // filtering works) — top-level files and folders are sorted among
        // themselves, never interleaved with a folder's children.
        const dir = c.path.replace(/[\\/]SKILL\.md$/i, "");
        let nodes: TreeNode[] = [skillNode];
        const folderLabels: string[] = [];
        if (dir && dir !== c.path) {
          try {
            const listing = await api.listFiles(dir);
            const topFiles: TreeNode[] = [];
            const folders: { header: TreeNode; children: TreeNode[] }[] = [];
            for (const entry of listing.entries) {
              if (entry.name.toLowerCase() === "skill.md") continue;
              if (entry.is_directory) {
                const label = `${entry.name}/`;
                const header: TreeNode = {
                  label,
                  path: entry.path,
                  isSkillMd: false,
                  depth: 0,
                  isFolder: true,
                };
                const children: TreeNode[] = [];
                // One level into references-style dirs is enough for a reader.
                try {
                  const sub = await api.listFiles(entry.path);
                  for (const f of sub.entries) {
                    if (f.is_directory) continue;
                    children.push({
                      label: f.name,
                      path: f.path,
                      isSkillMd: false,
                      depth: 1,
                      parent: label,
                    });
                  }
                } catch {
                  /* nested listing failed — show the folder header alone */
                }
                children.sort((a, b) => a.label.localeCompare(b.label));
                folders.push({ header, children });
                folderLabels.push(label);
              } else {
                topFiles.push({
                  label: entry.name,
                  path: entry.path,
                  isSkillMd: false,
                  depth: 0,
                });
              }
            }
            topFiles.sort((a, b) => a.label.localeCompare(b.label));
            folders.sort((a, b) => a.header.label.localeCompare(b.header.label));
            nodes = [skillNode, ...topFiles];
            for (const f of folders) nodes.push(f.header, ...f.children);
          } catch {
            /* listFiles unreachable — graceful fallback to SKILL.md only */
          }
        }
        if (!cancelled) {
          setTree(nodes);
          setCollapsedFolders(new Set(folderLabels)); // start collapsed
        }
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

  const toggleFolder = useCallback((label: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  // Hide a folder's children while collapsed. Folder headers + top-level
  // entries (SKILL.md, loose files) always show — so the sidebar never
  // disappears and the layout never shifts when a skill has no references.
  const visibleTree = useMemo(
    () => tree.filter((n) => !(n.parent && collapsedFolders.has(n.parent))),
    [tree, collapsedFolders],
  );

  // For SKILL.md, peel the YAML frontmatter out to render it as a labelled
  // code block (Manus-style). Reference files render verbatim.
  const doc = useMemo(
    () =>
      selected?.isSkillMd
        ? splitFrontmatter(body)
        : { frontmatter: null as string | null, body },
    [selected, body],
  );

  const copyYaml = useCallback(() => {
    if (doc.frontmatter) navigator.clipboard?.writeText(doc.frontmatter).catch(() => {});
  }, [doc.frontmatter]);

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
            : "h-[min(90vh,940px)] max-w-[min(1400px,94vw)]",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={skillName}
      >
        {/* Top bar: name + "..." menu (Download), fullscreen, close. */}
        <div className="flex items-center gap-2 border-b border-current/10 px-4 py-2.5">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          {/* Título amigável quando houver rótulo; senão o nome técnico (mono).
              O download e a busca continuam usando skillName real. */}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              t.skillLabels[skillName]?.name ? "font-medium" : "font-mono-ui",
            )}
          >
            {t.skillLabels[skillName]?.name || skillName}
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

        {/* Body: file tree (left) + document (right). The sidebar is ALWAYS
            present (SKILL.md at minimum) and the modal size is fixed, so the
            layout NEVER resizes/reflows between a skill with references and one
            without — a reference-less skill simply shows no reference entries. */}
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-current/10 p-2 sm:block">
            {visibleTree.map((node, i) => {
              if (node.isFolder) {
                const collapsed = collapsedFolders.has(node.label);
                return (
                  <button
                    key={`${node.label}-${i}`}
                    type="button"
                    onClick={() => toggleFolder(node.label)}
                    style={{ paddingLeft: `${0.5 + node.depth * 0.75}rem` }}
                    className="flex w-full items-center gap-1 truncate rounded px-2 py-1 text-left text-xs font-medium text-text-tertiary hover:bg-current/10"
                  >
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 shrink-0 transition-transform",
                        !collapsed && "rotate-90",
                      )}
                    />
                    <FolderClosed className="h-3 w-3 shrink-0 opacity-60" />
                    <span className="truncate">{node.label.replace(/\/$/, "")}</span>
                  </button>
                );
              }
              const isActive =
                selected != null &&
                (node.isSkillMd ? selected.isSkillMd : selected.path === node.path);
              return (
                <button
                  key={`${node.label}-${i}`}
                  type="button"
                  onClick={() => selectNode(node)}
                  style={{ paddingLeft: `${0.5 + node.depth * 0.75}rem` }}
                  className={cn(
                    "flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-xs hover:bg-current/10",
                    isActive && "bg-current/10 text-foreground",
                  )}
                >
                  <FileText className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="truncate">{node.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Document pane — content sits in a centred reading column so long
              lines never stretch across the wide modal. */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto w-full max-w-[820px]">
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
                <>
                  {doc.frontmatter && (
                    <div className="mb-5 overflow-hidden rounded-lg border border-current/15">
                      <div className="flex items-center justify-between border-b border-current/10 bg-current/[0.03] px-3 py-1.5">
                        <span className="font-mono-ui text-[0.7rem] uppercase tracking-wide text-text-tertiary">
                          YAML
                        </span>
                        <button
                          type="button"
                          onClick={copyYaml}
                          aria-label={t.configUser.skCopy}
                          title={t.configUser.skCopy}
                          className="grid h-6 w-6 place-items-center rounded text-muted-foreground/70 transition-colors hover:bg-current/10 hover:text-foreground"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed text-text-secondary">
                        {doc.frontmatter}
                      </pre>
                    </div>
                  )}
                  <Markdown content={doc.body} />
                </>
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
      </div>
    </div>,
    document.body,
  );
}
