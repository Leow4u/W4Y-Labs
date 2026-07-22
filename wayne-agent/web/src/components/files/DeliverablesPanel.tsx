/**
 * DeliverablesPanel — the "Entregas" layer on FilesPage (PR-6 C2).
 * Indexes agent outputs via a shallow filesystem scan; optional ?session=
 * filter scopes to the current task.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, ExternalLink, Link2, Loader2, Package, X } from "lucide-react";

import { FilePreview, isPreviewable } from "@/components/files/FilePreview";
import { FileTypeIcon } from "@/lib/file-icons";
import {
  groupDeliverablesByTime,
  matchesSessionDeliverable,
  scanDeliverables,
  type DeliverableTimeGroup,
} from "@/lib/file-curation";
import { api, type ManagedFileEntry, type SessionInfo } from "@/lib/api";
import { fetchPlan, openUpgrade, planUnlocksDeliverableShare } from "@/lib/plans";
import { buildStoreZip, dataUrlToBytes } from "@/lib/zip-store";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function downloadDataUrl(dataUrl: string, name: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = name || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const GROUP_ORDER: DeliverableTimeGroup[] = ["today", "thisWeek", "older"];

export function DeliverablesPanel({
  root,
  sessionId,
  highlightPath,
  onSwitchWorkspace,
}: {
  root: string | null;
  sessionId: string | null;
  highlightPath: string | null;
  onSwitchWorkspace: () => void;
}) {
  const { t } = useI18n();
  const tf = t.files;
  const navigate = useNavigate();
  const { toast, showToast } = useToast();
  const [items, setItems] = useState<ManagedFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [preview, setPreview] = useState<ManagedFileEntry | null>(null);
  const highlightRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    let dead = false;
    void fetchPlan().then((p) => {
      // Unknown plan (local shell without /planos) → fail-open so Entregas keep working.
      if (!dead) setCanShare(p == null || planUnlocksDeliverableShare(p));
    });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    let dead = false;
    void api
      .getSessionDetail(sessionId)
      .then((s) => {
        if (!dead) setSession(s);
      })
      .catch(() => {
        if (!dead) setSession(null);
      });
    return () => {
      dead = true;
    };
  }, [sessionId]);

  const reload = useCallback(async () => {
    if (!root) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const scanned = await scanDeliverables(root, (p) => api.listFiles(p));
      setItems(scanned);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [root]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    if (!sessionId || !session) return items;
    return items.filter((e) => matchesSessionDeliverable(e, session));
  }, [items, sessionId, session]);

  const grouped = useMemo(() => groupDeliverablesByTime(filtered), [filtered]);

  const groupLabel = (g: DeliverableTimeGroup) => {
    if (g === "today") return tf.groupToday;
    if (g === "thisWeek") return tf.groupThisWeek;
    return tf.groupOlder;
  };

  const downloadFile = async (entry: ManagedFileEntry) => {
    try {
      const file = await api.readFile(entry.path);
      downloadDataUrl(file.data_url, file.name);
    } catch {
      /* toast handled by parent pattern — silent here */
    }
  };

  // E7: zip of the current Entregas list (session-filtered when applicable).
  const exportPack = async () => {
    if (!canShare) {
      openUpgrade("business");
      return;
    }
    if (!filtered.length) return;
    setExporting(true);
    try {
      const files: Array<{ name: string; data: Uint8Array }> = [];
      const used = new Set<string>();
      for (const e of filtered) {
        const file = await api.readFile(e.path);
        let name = file.name || e.name || "file";
        if (used.has(name)) {
          const stem = name.replace(/(\.[^.]+)?$/, "");
          const ext = (name.match(/(\.[^.]+)$/) || ["", ""])[1];
          let n = 2;
          while (used.has(`${stem}-${n}${ext}`)) n += 1;
          name = `${stem}-${n}${ext}`;
        }
        used.add(name);
        files.push({ name, data: dataUrlToBytes(file.data_url) });
      }
      const blob = buildStoreZip(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `entregas-${sessionId?.slice(0, 8) || "pack"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(tf.exportPackDone, "success");
    } catch (err) {
      showToast(`${t.status.error}: ${err}`, "error");
    } finally {
      setExporting(false);
    }
  };

  // E7: in-product deep link (same tenant) — not a public CDN URL.
  const copyShareLink = async () => {
    if (!canShare) {
      openUpgrade("business");
      return;
    }
    if (!sessionId) return;
    const q = new URLSearchParams();
    q.set("layer", "deliverables");
    q.set("session", sessionId);
    const url = `${window.location.origin}/files?${q.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(tf.shareLinkCopied, "success");
    } catch {
      showToast(tf.shareLinkFailed, "error");
    }
  };

  const openEntry = (entry: ManagedFileEntry) => {
    if (isPreviewable(entry.name, entry.mime_type)) setPreview(entry);
    else void downloadFile(entry);
  };

  const clearSessionFilter = () => {
    const q = new URLSearchParams(window.location.search);
    q.delete("session");
    q.delete("highlight");
    q.set("layer", "deliverables");
    navigate(`/files?${q.toString()}`, { replace: true });
  };

  useEffect(() => {
    if (!highlightPath || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightPath, filtered.length, loading]);

  if (!root) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
        {tf.deliverablesEmpty}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <Toast toast={toast} />
      {sessionId && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{tf.filterThisTask}</span>
          <span className="font-medium text-foreground truncate max-w-[20rem]">
            {session?.title?.trim() || sessionId.slice(0, 8)}
          </span>
          <button
            type="button"
            onClick={clearSessionFilter}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            {tf.clearTaskFilter}
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void copyShareLink()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 type-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={canShare ? undefined : tf.shareRequiresPlan}
            >
              <Link2 className="h-3.5 w-3.5" />
              {tf.shareLink}
            </button>
            <button
              type="button"
              disabled={exporting || filtered.length === 0}
              onClick={() => void exportPack()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 type-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              title={canShare ? undefined : tf.shareRequiresPlan}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Package className="h-3.5 w-3.5" />
              )}
              {tf.exportPack}
            </button>
          </div>
        </div>
      )}

      {!sessionId && filtered.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={exporting}
            onClick={() => void exportPack()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 type-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            title={canShare ? undefined : tf.shareRequiresPlan}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Package className="h-3.5 w-3.5" />
            )}
            {tf.exportPack}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t.common.loading}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium text-foreground">{tf.deliverablesEmpty}</p>
          <p className="mt-2 text-sm text-muted-foreground">{tf.deliverablesEmptyHint}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {GROUP_ORDER.map((g) => {
            const rows = grouped[g];
            if (!rows.length) return null;
            return (
              <section key={g}>
                <h2 className="type-caption font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {groupLabel(g)}
                </h2>
                <ul className="mt-3 space-y-2">
                  {rows.map((e) => {
                    const highlighted =
                      highlightPath != null &&
                      (e.path === highlightPath ||
                        e.path.endsWith(highlightPath) ||
                        highlightPath.endsWith(e.path));
                    return (
                      <li
                        key={e.path}
                        ref={highlighted ? highlightRef : undefined}
                        className={cn(
                          "flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors",
                          highlighted && "ring-2 ring-primary/40",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openEntry(e)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <FileTypeIcon name={e.name} isDirectory={false} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate type-body font-medium text-foreground">
                              {e.name}
                            </span>
                            <span className="mt-0.5 block type-caption text-muted-foreground">
                              {Number.isFinite(e.mtime) ? DATE_FORMAT.format(e.mtime * 1000) : "—"}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadFile(e)}
                          aria-label={tf.download}
                          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        {sessionId && (
                          <button
                            type="button"
                            onClick={() => navigate(`/chat?resume=${encodeURIComponent(sessionId)}`)}
                            className="inline-flex items-center gap-1 type-ui text-primary underline-offset-2 hover:underline"
                          >
                            {tf.openTask}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onSwitchWorkspace}
        className="type-ui text-muted-foreground transition-colors hover:text-foreground"
      >
        {tf.switchToWorkspace}
      </button>

      {preview && (
        <FilePreview
          entry={preview}
          onClose={() => setPreview(null)}
          onDownload={(e) => void downloadFile(e)}
        />
      )}
    </div>
  );
}
