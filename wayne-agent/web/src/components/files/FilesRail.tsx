/**
 * FilesRail — the explorer's side rail (Onda 2): "Acesso rápido" ("Início"),
 * "Projetos" (folders under projects/) and "Favoritos" (pinned, live via
 * lib/pinned-files). The look of Windows Explorer's left pane, in our Editorial
 * language. Presentational: receives the projects + callbacks from the parent.
 */
import { useEffect, useState } from "react";
import { Home, Library, Star } from "lucide-react";

import type { ManagedFileEntry } from "@/lib/api";
import { FileTypeIcon } from "@/lib/file-icons";
import { getPinnedFiles, onPinnedFilesChange, type PinnedFile } from "@/lib/pinned-files";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export interface RailProject {
  name: string;
  path: string;
}

function toEntry(f: PinnedFile): ManagedFileEntry {
  return { name: f.name, path: f.path, is_directory: f.dir, size: null, mtime: 0, mime_type: null };
}

export interface RailAgent {
  slug: string;
  name: string;
}

export function FilesRail({
  root,
  activePath,
  projects,
  onNavigate,
  onPreview,
  agents,
  activeAgent,
  onSelectAgent,
}: {
  root: string | null;
  activePath: string;
  projects: RailProject[];
  onNavigate: (path: string) => void;
  onPreview: (entry: ManagedFileEntry) => void;
  /** Agents that own a knowledge base — the fourth block. */
  agents: RailAgent[];
  activeAgent: string | null;
  onSelectAgent: (slug: string) => void;
}) {
  const { t } = useI18n();
  const tf = t.files;
  const [favorites, setFavorites] = useState<PinnedFile[]>(getPinnedFiles);
  useEffect(() => onPinnedFilesChange(() => setFavorites([...getPinnedFiles()])), []);

  const rowCls = (active: boolean) =>
    cn(
      "flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
      active ? "bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-card/60",
    );
  const label = "px-2 pt-1 pb-1.5 type-micro uppercase tracking-wide text-muted-foreground";

  return (
    // Below lg the rail does not disappear (it carried the ONLY way into an
    // agent's knowledge): it lies down as a horizontal strip above the content.
    <aside className="flex w-full shrink-0 flex-row gap-3 overflow-x-auto border-b border-border pb-2 lg:w-[200px] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:border-b-0 lg:border-r lg:pb-0 lg:pr-2">
      <div className="shrink-0">
        <div className={label}>{tf.quickAccess}</div>
        <button type="button" onClick={() => root && onNavigate(root)} className={rowCls(Boolean(root) && activePath === root)}>
          <Home className="h-4 w-4 shrink-0" />
          <span className="truncate">{tf.home}</span>
        </button>
      </div>

      {projects.length > 0 && (
        <div className="shrink-0">
          <div className={label}>{t.chat.projects}</div>
          {projects.map((p) => (
            <button
              key={p.path}
              type="button"
              onClick={() => onNavigate(p.path)}
              className={rowCls(activePath === p.path)}
              title={p.name}
            >
              <FileTypeIcon name={p.name} isDirectory size="sm" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* The agents' knowledge — documents that used to exist ONLY inside each
          agent's drawer, invisible from the place people look for files. One
          line per agent; the panel on the right lists that agent's documents. */}
      {agents.length > 0 && (
        <div className="shrink-0">
          <div className={label}>{tf.knowledgeSection}</div>
          {agents.map((a) => (
            <button
              key={a.slug}
              type="button"
              onClick={() => onSelectAgent(a.slug)}
              className={rowCls(activeAgent === a.slug)}
              title={a.name}
            >
              <Library className="h-4 w-4 shrink-0" />
              <span className="truncate">{a.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="shrink-0">
        <div className={label}>{tf.favorites}</div>
        {favorites.length === 0 ? (
          <p className="px-2 py-1 type-micro text-text-tertiary">{tf.noFavorites}</p>
        ) : (
          favorites.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => (f.dir ? onNavigate(f.path) : onPreview(toEntry(f)))}
              className={rowCls(f.dir && activePath === f.path)}
              title={f.name}
            >
              {f.dir ? (
                <FileTypeIcon name={f.name} isDirectory size="sm" />
              ) : (
                <Star className="h-3.5 w-3.5 shrink-0 text-live" />
              )}
              <span className="truncate">{f.name}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
