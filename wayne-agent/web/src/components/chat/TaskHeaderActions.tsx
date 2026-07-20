/**
 * TaskHeaderActions — the actions of the open task, in the dashboard header
 * (benchmark Manus: usage icon + files + "…" menu). Mounted by the
 * NativeChatPage via usePageHeader().setAfterTitle. All on top of existing
 * endpoints:
 *
 *   Usage        cumulative usage from message.complete (_get_usage) + GET
 *                /api/sessions/{id} (tokens/messages/tools/duration —
 *                started_at/last_active in epoch s). Credits are left to the
 *                billing wave (no queryable credits endpoint exists today).
 *   Folder       /files?path=projects/<slug> (task workspace) — only with an
 *                active project.
 *   Menu "…"     Rename (PATCH title) · Export (GET /export) · Archive
 *                (PATCH archived) · Delete (DELETE) — the same APIs as the
 *                Tasks sidebar.
 */
import {
  Archive,
  BarChart3,
  Clock,
  Download,
  FolderClosed,
  GitBranch,
  Hammer,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Shrink,
  Trash2,
  Undo2,
  Zap,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useConfirmDelete } from "@nous-research/ui/hooks/use-confirm-delete";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import { api, type SessionInfo } from "@/lib/api";
import { PROJECTS_DIR } from "@/lib/projects";
import type { ChatUsage } from "@/hooks/useChatSession";

function fmtTokens(n: number | undefined): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function StatRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <Icon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{label}</span>
      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function TaskHeaderActions({
  storedId,
  project,
  usage,
  busy = false,
  onRenamed,
  onUndo,
  onCompress,
  onBranch,
  onContext,
}: {
  /** Durable id of the open session (resume or stored_session_id from create). */
  storedId: string | null;
  /** Active project (workspace) — enables the folder shortcut. */
  project: string | null;
  /** Cumulative usage from the last message.complete (live). */
  usage: ChatUsage | null;
  /** Turn running — disables undo/compress (the server rejects them). */
  busy?: boolean;
  /** Notifies the page to refresh the local title after renaming. */
  onRenamed?: (title: string) => void;
  /** session.undo / session.compress / session.branch (they return success). */
  onUndo?: () => Promise<boolean>;
  onCompress?: () => Promise<boolean>;
  onBranch?: () => Promise<boolean>;
  /** session.context_breakdown — context window occupancy. */
  onContext?: () => Promise<{
    context_percent?: number;
    context_used?: number;
    context_max?: number;
  } | null>;
}) {
  const { t } = useI18n();
  const { toast, showToast } = useToast();
  const navigate = useNavigate();

  const [usageOpen, setUsageOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useMenuDismiss(usageOpen, () => setUsageOpen(false), "hdr-usage");
  useMenuDismiss(menuOpen, () => setMenuOpen(false), "hdr-menu");
  // Popover anchor (position:fixed — the header clips absolute content, so
  // the panels open DOWNWARD from the rect of the clicked button).
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [detail, setDetail] = useState<SessionInfo | null>(null);
  const [ctx, setCtx] = useState<{
    context_percent?: number;
    context_used?: number;
    context_max?: number;
  } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const openUsage = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setAnchor({ x: r.right, y: r.bottom + 8 });
      setMenuOpen(false);
      setUsageOpen((o) => !o);
      if (storedId) {
        api
          .getSessionDetail(storedId)
          .then(setDetail)
          .catch(() => setDetail(null));
      }
      if (onContext) void onContext().then(setCtx);
    },
    [storedId, onContext],
  );

  const submitRename = useCallback(async () => {
    if (!storedId) return;
    const title = renameValue.trim();
    setRenaming(false);
    if (!title) return;
    try {
      await api.renameSession(storedId, title);
      onRenamed?.(title);
      showToast(t.chat.renamed, "success");
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    }
  }, [storedId, renameValue, onRenamed, showToast, t.chat.renamed, t.status.error]);

  const exportSession = useCallback(async () => {
    if (!storedId) return;
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
  }, [storedId, showToast, t.status.error]);

  const archiveTask = useCallback(async () => {
    if (!storedId) return;
    try {
      await api.setSessionArchived(storedId, true);
      showToast(t.chat.archived, "success");
      navigate("/chat");
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    }
  }, [storedId, navigate, showToast, t.chat.archived, t.status.error]);

  const taskDelete = useConfirmDelete<string>({
    onDelete: useCallback(
      async (id: string) => {
        try {
          await api.deleteSession(id);
          navigate("/chat");
        } catch (e) {
          showToast(`${t.status.error}: ${e}`, "error");
          throw e;
        }
      },
      [navigate, showToast, t.status.error],
    ),
  });

  const durationS =
    detail && detail.last_active && detail.started_at
      ? detail.last_active - detail.started_at
      : null;
  const inTok = detail?.input_tokens ?? usage?.input;
  const outTok = detail?.output_tokens ?? usage?.output;

  const itemCls =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted";

  return (
    <span className="relative flex items-center gap-0.5">
      {/* Usage */}
      <button
        type="button"
        onClick={openUsage}
        aria-label={t.chat.usageTitle}
        title={t.chat.usageTitle}
        className="rounded-md p-1.5 text-text-secondary transition-colors hover:text-foreground"
      >
        <BarChart3 className="h-4 w-4" />
      </button>

      {/* Project folder (task workspace) */}
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

      {/* Task "…" menu */}
      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ x: r.right, y: r.bottom + 8 });
          setUsageOpen(false);
          setMenuOpen((o) => !o);
          /* trigger marked below via data-menu-trigger */
        }}
        aria-label="…"
        className="rounded-md p-1.5 text-text-secondary transition-colors hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {(usageOpen || menuOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setUsageOpen(false);
            setMenuOpen(false);
            setRenaming(false);
          }}
          aria-hidden
        />
      )}

      {usageOpen && anchor && (
        <div
          data-menu-root="hdr-usage"
          className="fixed z-50 w-72 rounded-xl border border-border bg-card p-4 shadow-xl"
          style={{
            left: Math.max(8, Math.min(anchor.x - 288, window.innerWidth - 296)),
            top: Math.min(anchor.y, window.innerHeight - 280),
          }}
        >
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            {t.chat.usageTitle}
          </h3>
          {storedId && !detail ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div>
              <StatRow
                icon={Zap}
                label={`${t.chat.tokensIn} / ${t.chat.tokensOut}`}
                value={`${fmtTokens(inTok)} / ${fmtTokens(outTok)}`}
              />
              {durationS != null && (
                <StatRow
                  icon={Clock}
                  label={t.chat.workedTime}
                  value={fmtDuration(durationS)}
                />
              )}
              {detail && (
                <StatRow
                  icon={MessageSquare}
                  label={t.common.msgs}
                  value={String(detail.message_count)}
                />
              )}
              {detail && (
                <StatRow
                  icon={Hammer}
                  label={t.chat.toolsLabel}
                  value={String(detail.tool_call_count)}
                />
              )}
              {usage?.calls != null && usage.calls > 0 && (
                <StatRow
                  icon={BarChart3}
                  label={t.analytics.apiCalls}
                  value={String(usage.calls)}
                />
              )}
              {/* Context window meter (session.context_breakdown). */}
              {ctx?.context_percent != null && ctx.context_percent > 0 && (
                <div className="mt-2 border-t border-border/60 pt-2">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t.chat.contextUsage}</span>
                    <span className="tabular-nums">
                      {Math.round(ctx.context_percent)}%
                      {ctx.context_max
                        ? ` · ${fmtTokens(ctx.context_used)} / ${fmtTokens(ctx.context_max)}`
                        : ""}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        ctx.context_percent > 85 ? "bg-warning" : "bg-live"
                      }`}
                      style={{ width: `${Math.min(100, ctx.context_percent)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
          {/* Conversation actions (gateway): undo/compress require a stopped
              turn; branch creates a new session from this one. */}
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
          <div className="mx-2 my-1 h-px bg-border" />
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
          <button
            type="button"
            role="menuitem"
            disabled={!storedId}
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
            disabled={!storedId}
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
