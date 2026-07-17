/**
 * ProjectEditModal — the project's display editor: friendly name + emoji +
 * color, saved to the project ROW via PATCH /api/projects (lib/project-meta's
 * saveProjectMeta updates the cache and notifies subscribers). Does NOT
 * rename the folder/slug — appearance only.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

import { useI18n } from "@/i18n";
import { prettifyProject } from "@/lib/projects";
import {
  PROJECT_COLORS,
  PROJECT_ICONS,
  getProjectMetaCached,
  loadProjectMeta,
  saveProjectMeta,
} from "@/lib/project-meta";
import { cn } from "@/lib/utils";

export function ProjectEditModal({
  slug,
  onClose,
  onSaved,
}: {
  slug: string;
  onClose: () => void;
  /** Toast/refresh are up to the caller. */
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [color, setColor] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Prefill from the current sidecar (cache or fetch).
  useEffect(() => {
    let cancelled = false;
    const apply = (m: { name?: string; icon?: string; color?: string }) => {
      if (cancelled) return;
      setName(m.name ?? "");
      setIcon(m.icon);
      setColor(m.color);
      setLoaded(true);
    };
    const cached = getProjectMetaCached(slug);
    if (cached.name || cached.icon || cached.color) apply(cached);
    else void loadProjectMeta(slug).then(apply);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveProjectMeta(slug, {
        name: name.trim() || undefined,
        icon,
        color,
      });
      onSaved?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // Portal to <body>: the sidebar has a transform (responsive drawer), which
  // becomes the containing block for position:fixed — without the portal the
  // modal shrinks into the ~190px column instead of centering on the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.chat.editProjectTitle}
        className="flex w-[min(30rem,94vw)] flex-col rounded-2xl border border-border bg-card p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">{t.chat.editProjectTitle}</h2>
          <button
            type="button"
            aria-label={t.common.close}
            onClick={onClose}
            className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!loaded ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
          </div>
        ) : (
          <>
            {/* Preview + name */}
            <div className="mb-4 flex items-center gap-3">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-background text-xl"
                style={color ? { borderColor: PROJECT_COLORS[color]?.hex } : undefined}
              >
                {icon ?? "📁"}
              </span>
              <input
                autoFocus
                value={name}
                placeholder={prettifyProject(slug)}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                  if (e.key === "Escape") onClose();
                }}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-live/50"
              />
            </div>

            {/* Color */}
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
              {t.chat.projectColor}
            </span>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-label={t.chat.projectColorNone}
                title={t.chat.projectColorNone}
                onClick={() => setColor(undefined)}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full border text-muted-foreground/70 transition-transform hover:scale-110",
                  color === undefined ? "border-foreground" : "border-border",
                )}
              >
                <X className="h-3.5 w-3.5" />
              </button>
              {Object.entries(PROJECT_COLORS).map(([key, { hex }]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  title={key}
                  onClick={() => setColor(key)}
                  style={{ backgroundColor: hex }}
                  className={cn(
                    "h-7 w-7 rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110",
                    color === key ? "ring-2 ring-foreground" : "ring-0",
                  )}
                />
              ))}
            </div>

            {/* Emoji */}
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
              {t.chat.projectIcon}
            </span>
            <div className="mb-5 grid grid-cols-8 gap-1 rounded-xl border border-border bg-background p-2">
              <button
                type="button"
                aria-label={t.chat.projectIconNone}
                title={t.chat.projectIconNone}
                onClick={() => setIcon(undefined)}
                className={cn(
                  "grid h-8 place-items-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-muted",
                  icon === undefined && "bg-muted ring-1 ring-inset ring-foreground/30",
                )}
              >
                <X className="h-4 w-4" />
              </button>
              {PROJECT_ICONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  className={cn(
                    "grid h-8 place-items-center rounded-lg text-lg transition-colors hover:bg-muted",
                    icon === e && "bg-muted ring-1 ring-inset ring-foreground/30",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-muted"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="rounded-lg bg-foreground px-3.5 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? t.common.saving : t.common.save}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
