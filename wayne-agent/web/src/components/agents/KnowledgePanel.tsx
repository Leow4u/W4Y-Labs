/**
 * KnowledgePanel — the agent's knowledge base (K1): upload documents, see
 * what is ingested, remove per document. Backed by /api/knowledge (chunks
 * land in the profile's holographic fact store with the source inline, so
 * the agent answers CITING the file). Used as the AgentDrawer "knowledge"
 * tab and reached from the Estúdio's knowledge node.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, FileText, Loader2, Plus, Trash2 } from "lucide-react";

import { api } from "@/lib/api";
import { uploadKnowledgeDocument } from "@/lib/knowledge-upload";
import type { KnowledgeDoc } from "@/lib/api";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

// PDF is accepted since the engine bundled pypdf (20/07) — the picker was
// still refusing the most common document people actually have.
const ACCEPT = ".txt,.md,.markdown,.csv,.json,.log,.docx,.xlsx,.ipynb,.pdf";

export function KnowledgePanel({
  profile,
  compact,
  onChanged,
}: {
  /** Agent slug (undefined = default/main installation). */
  profile?: string;
  /** Tighter paddings for embedding outside the drawer. */
  compact?: boolean;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const ag = t.agents;
  const [docs, setDocs] = useState<KnowledgeDoc[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(() => {
    api
      .getKnowledge(profile)
      .then((r) => setDocs(r.documents))
      .catch(() => setDocs([]));
  }, [profile]);

  useEffect(() => {
    setDocs(null);
    reload();
  }, [reload]);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        // Replace-on-same-name: plain upload would ingest the document TWICE
        // (see lib/knowledge-upload).
        await uploadKnowledgeDocument(file, profile, docs ?? []);
        reload();
        onChanged?.();
      } catch (e) {
        const msg = String(e);
        setError(
          msg.includes("unsupported_format")
            ? ag.studioKnowledgeUnsupported
            : msg,
        );
      } finally {
        setBusy(false);
      }
    },
    [profile, reload, onChanged, docs, ag.studioKnowledgeUnsupported],
  );

  const remove = useCallback(
    async (name: string) => {
      setRemoving(name);
      try {
        await api.deleteKnowledge(name, profile);
        reload();
        onChanged?.();
      } catch (e) {
        setError(String(e));
      } finally {
        setRemoving(null);
      }
    },
    [profile, reload, onChanged],
  );

  return (
    <div className={cn("flex flex-col gap-2", compact ? "" : "px-1")}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />

      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-live/10 text-live">
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {ag.studioKnowledgeLabel}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {ag.studioKnowledgeCites}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {ag.studioKnowledgeAdd}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {docs === null ? (
        <div className="py-6 text-center text-xs text-muted-foreground">…</div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          {ag.studioKnowledgeEmpty}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {docs.map((d) => (
            <div
              key={d.name}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">
                  {d.name}
                </div>
                {d.facts != null && (
                  <div className="text-xs text-muted-foreground">
                    {ag.studioKnowledgeDocs.replace("{count}", String(d.facts))}
                    {d.ingested_at ? ` · ${d.ingested_at.slice(0, 10)}` : ""}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label={ag.teamRemoveSub}
                disabled={removing === d.name}
                onClick={() => void remove(d.name)}
                className="shrink-0 rounded p-1 text-text-tertiary transition-colors hover:text-destructive disabled:opacity-50"
              >
                {removing === d.name ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
