/**
 * TaskHeaderActions — task actions in the dashboard header (folder + "…" menu).
 * Usage moved to UsageFooter below the composer (BUG-NT-01).
 */
import {
  Archive,
  CalendarClock,
  Download,
  FolderClosed,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Shrink,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useConfirmDelete } from "@nous-research/ui/hooks/use-confirm-delete";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import { api } from "@/lib/api";
import { inventory } from "@/lib/inventoryApi";
import { PROJECTS_DIR } from "@/lib/projects";
import {
  cloudMutateAvailable,
  cloudMutateJson,
} from "@/lib/cloudSession";

export function TaskHeaderActions({
  storedId,
  project,
  busy = false,
  cloud = false,
  schedulePrompt = null,
  scheduleProfile = null,
  onRenamed,
  onUndo,
  onCompress,
  onBranch,
}: {
  storedId: string | null;
  project: string | null;
  busy?: boolean;
  /** Session runs on the cloud brain (desktop bridge) — REST must not hit local. */
  cloud?: boolean;
  /** Last user prompt — enables "Agendar rotina" → /cron prefilled (E9). */
  schedulePrompt?: string | null;
  scheduleProfile?: string | null;
  onRenamed?: (title: string) => void;
  onUndo?: () => Promise<boolean>;
  onCompress?: () => Promise<boolean>;
  onBranch?: () => Promise<boolean>;
}) {
  const { t } = useI18n();
  const { toast, showToast } = useToast();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  useMenuDismiss(menuOpen, () => setMenuOpen(false), "hdr-menu");
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const submitRename = useCallback(async () => {
    if (!storedId) return;
    const title = renameValue.trim();
    setRenaming(false);
    if (!title) return;
    try {
      if (cloud) {
        if (!cloudMutateAvailable()) {
          showToast(t.cron.cloudUnavailable, "error");
          return;
        }
        const r = await cloudMutateJson<{ ok?: boolean }>(
          `/api/sessions/${encodeURIComponent(storedId)}`,
          "PATCH",
          { title },
          8000,
        );
        if (!r) {
          showToast(t.cron.cloudUnavailable, "error");
          return;
        }
      } else {
        await api.renameSession(storedId, title);
      }
      onRenamed?.(title);
      showToast(t.chat.renamed, "success");
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    }
  }, [
    storedId,
    renameValue,
    cloud,
    onRenamed,
    showToast,
    t.chat.renamed,
    t.cron.cloudUnavailable,
    t.status.error,
  ]);

  const exportSession = useCallback(async () => {
    if (!storedId || cloud) return; // export = same-origin blob; cloud needs a later bridge
    try {
      const res = await fetch(api.exportSessionUrl(storedId), {
        credentials: "include",
        headers: {
          "X-Wayne-Session-Token":
            (window as unknown as { __WAYNE_SESSION_TOKEN__?: string })
              .__WAYNE_SESSION_TOKEN__ ?? "",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session-${storedId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    }
  }, [storedId, cloud, showToast, t.status.error]);

  const archiveTask = useCallback(async () => {
    if (!storedId) return;
    try {
      if (cloud) {
        if (!cloudMutateAvailable()) {
          showToast(t.cron.cloudUnavailable, "error");
          return;
        }
        const r = await cloudMutateJson<{ ok?: boolean }>(
          `/api/sessions/${encodeURIComponent(storedId)}`,
          "PATCH",
          { archived: true },
          8000,
        );
        if (!r) {
          showToast(t.cron.cloudUnavailable, "error");
          return;
        }
      } else {
        await api.setSessionArchived(storedId, true);
      }
      showToast(t.chat.archived, "success");
      navigate(cloud ? "/chat?run=cloud" : "/chat");
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    }
  }, [
    storedId,
    cloud,
    navigate,
    showToast,
    t.chat.archived,
    t.cron.cloudUnavailable,
    t.status.error,
  ]);

  const taskDelete = useConfirmDelete<string>({
    onDelete: useCallback(
      async (id: string) => {
        try {
          if (cloud) {
            if (!cloudMutateAvailable()) {
              showToast(t.cron.cloudUnavailable, "error");
              throw new Error("cloud-unavailable");
            }
            const r = await cloudMutateJson<{ ok?: boolean }>(
              `/api/sessions/${encodeURIComponent(id)}`,
              "DELETE",
              undefined,
              8000,
            );
            if (!r) {
              showToast(t.cron.cloudUnavailable, "error");
              throw new Error("cloud-unavailable");
            }
          } else {
            await inventory.deleteSession(id);
          }
          navigate(cloud ? "/chat?run=cloud" : "/chat");
        } catch (e) {
          if (!(e instanceof Error && e.message === "cloud-unavailable")) {
            showToast(`${t.status.error}: ${e}`, "error");
          }
          throw e;
        }
      },
      [cloud, navigate, showToast, t.cron.cloudUnavailable, t.status.error],
    ),
  });

  const itemCls =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted";

  return (
    <span className="relative flex items-center gap-0.5">
      {project && (
        <button
          type="button"
          onClick={() =>
            navigate(`/files?path=${encodeURIComponent(`${PROJECTS_DIR}/${project}`)}`)
          }
          aria-label={t.chat.taskFiles}
          title={t.chat.taskFiles}
          className="rounded-md p-1.5 text-text-secondary transition-colors hover:text-foreground"
        >
          <FolderClosed className="h-4 w-4" />
        </button>
      )}

      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ x: r.right, y: r.bottom + 8 });
          setMenuOpen((o) => !o);
        }}
        aria-label="…"
        className="rounded-md p-1.5 text-text-secondary transition-colors hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setMenuOpen(false);
            setRenaming(false);
          }}
          aria-hidden
        />
      )}

      {menuOpen && anchor && (
        <div
          role="menu"
          data-menu-root="hdr-menu"
          className="fixed z-50 w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl"
          style={{
            left: Math.max(8, Math.min(anchor.x - 224, window.innerWidth - 232)),
            top: Math.min(anchor.y, window.innerHeight - 280),
          }}
        >
          {renaming ? (
            <input
              autoFocus
              value={renameValue}
              placeholder={t.chat.rename}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setMenuOpen(false);
                  void submitRename();
                }
                if (e.key === "Escape") setRenaming(false);
              }}
              className="m-1 w-[calc(100%-8px)] rounded-lg border border-live/50 bg-background px-2.5 py-1.5 text-sm text-foreground outline-none"
            />
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled={!storedId}
              onClick={() => setRenaming(true)}
              className={`${itemCls} disabled:opacity-40`}
            >
              <Pencil className="h-4 w-4 shrink-0 opacity-80" />
              {t.chat.rename}
            </button>
          )}
          {onUndo && (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setMenuOpen(false);
                void onUndo().then((ok) =>
                  showToast(ok ? t.chat.undone : t.status.error, ok ? "success" : "error"),
                );
              }}
              className={`${itemCls} disabled:opacity-40`}
            >
              <Undo2 className="h-4 w-4 shrink-0 opacity-80" />
              {t.chat.undoTurn}
            </button>
          )}
          {onCompress && (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setMenuOpen(false);
                void onCompress().then((ok) =>
                  showToast(
                    ok ? t.chat.compressed : t.status.error,
                    ok ? "success" : "error",
                  ),
                );
              }}
              className={`${itemCls} disabled:opacity-40`}
            >
              <Shrink className="h-4 w-4 shrink-0 opacity-80" />
              {t.chat.compressChat}
            </button>
          )}
          {onBranch && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void onBranch().then((ok) =>
                  showToast(ok ? t.chat.branched : t.status.error, ok ? "success" : "error"),
                );
              }}
              className={itemCls}
            >
              <GitBranch className="h-4 w-4 shrink-0 opacity-80" />
              {t.chat.branchChat}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={!schedulePrompt?.trim()}
            onClick={() => {
              setMenuOpen(false);
              const text = schedulePrompt?.trim();
              if (!text) return;
              const q = new URLSearchParams();
              q.set("prompt", text.slice(0, 4000));
              if (scheduleProfile) q.set("profile", scheduleProfile);
              navigate(`/cron?${q.toString()}`);
            }}
            className={`${itemCls} disabled:opacity-40`}
          >
            <CalendarClock className="h-4 w-4 shrink-0 opacity-80" />
            {t.chat.scheduleRoutine}
          </button>
          <div className="mx-2 my-1 h-px bg-border" />
          {!cloud && (
            <button
              type="button"
              role="menuitem"
              disabled={!storedId}
              onClick={() => {
                setMenuOpen(false);
                void exportSession();
              }}
              className={`${itemCls} disabled:opacity-40`}
            >
              <Download className="h-4 w-4 shrink-0 opacity-80" />
              {t.chat.export}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={!storedId || (cloud && !cloudMutateAvailable())}
            onClick={() => {
              setMenuOpen(false);
              void archiveTask();
            }}
            className={`${itemCls} disabled:opacity-40`}
          >
            <Archive className="h-4 w-4 shrink-0 opacity-80" />
            {t.chat.archive}
          </button>
          <div className="mx-2 my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            disabled={!storedId || (cloud && !cloudMutateAvailable())}
            onClick={() => {
              setMenuOpen(false);
              if (storedId) taskDelete.requestDelete(storedId);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4 shrink-0 opacity-80" />
            {t.common.delete}
          </button>
        </div>
      )}

      <DeleteConfirmDialog
        open={taskDelete.isOpen}
        onCancel={taskDelete.cancel}
        onConfirm={taskDelete.confirm}
        title={t.sessions.confirmDeleteTitle}
        description={t.sessions.confirmDeleteMessage}
        loading={taskDelete.isDeleting}
      />

      <Toast toast={toast} />
    </span>
  );
}
