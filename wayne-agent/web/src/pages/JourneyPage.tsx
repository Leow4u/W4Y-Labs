/**
 * JourneyPage — Wayne's learning journey (Onda 6; the role of the TUI's
 * /journey and the desktop's starmap, in the Editorial language). A timeline of
 * what the agent has learned — acquired skills and memories — grouped by day,
 * with detail, editing and removal over the SAME REST endpoints the desktop
 * uses (/api/learning/graph|node).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Package, Pencil, StickyNote, Trash2, X } from "lucide-react";

import { useI18n } from "@/i18n";
import { api } from "@/lib/api";

interface JNode {
  id: string;
  kind: "skill" | "memory";
  label: string;
  ts: number | null;
}

function coerceNode(raw: Record<string, unknown>): JNode | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;
  const kindRaw = String(raw.kind ?? raw.type ?? "");
  const kind: JNode["kind"] = /skill/i.test(kindRaw) ? "skill" : "memory";
  const label = String(raw.label ?? raw.title ?? raw.name ?? id);
  const tsRaw = raw.ts ?? raw.created_at ?? raw.mtime ?? raw.time ?? null;
  let ts: number | null = null;
  if (typeof tsRaw === "number") ts = tsRaw > 1e12 ? tsRaw / 1000 : tsRaw;
  else if (typeof tsRaw === "string") {
    const p = Date.parse(tsRaw);
    if (!Number.isNaN(p)) ts = p / 1000;
  }
  return { id, kind, label, ts };
}

export default function JourneyPage() {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<JNode[] | null>(null);
  const [sel, setSel] = useState<JNode | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    void api
      .getLearningGraph()
      .then((g) =>
        setNodes(
          (g.nodes ?? [])
            .map(coerceNode)
            .filter((n): n is JNode => !!n)
            .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)),
        ),
      )
      .catch(() => setNodes([]));
  }, []);
  useEffect(() => reload(), [reload]);

  useEffect(() => {
    if (!sel) return;
    setDetail(null);
    setEditing(false);
    void api
      .getLearningNode(sel.id)
      .then((r) => setDetail(r.content ?? ""))
      .catch(() => setDetail(""));
  }, [sel]);

  const groups = useMemo(() => {
    const out = new Map<string, JNode[]>();
    for (const n of nodes ?? []) {
      const day = n.ts
        ? new Date(n.ts * 1000).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : "—";
      out.set(day, [...(out.get(day) ?? []), n]);
    }
    return [...out.entries()];
  }, [nodes]);

  const remove = useCallback(
    async (n: JNode) => {
      if (!window.confirm(`${t.common.delete}: ${n.label}?`)) return;
      setBusy(true);
      try {
        await api.deleteLearningNode(n.id);
        setSel(null);
        reload();
      } finally {
        setBusy(false);
      }
    },
    [reload, t.common.delete],
  );

  const save = useCallback(async () => {
    if (!sel) return;
    setBusy(true);
    try {
      await api.editLearningNode(sel.id, draft);
      setDetail(draft);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }, [sel, draft]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1080px] gap-5 px-5 py-6">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <h1
          className="mb-1 text-[1.6rem] font-medium tracking-tight text-foreground"
          style={{ fontFamily: "var(--theme-font-serif)" }}
        >
          {t.chat.journeyTitle}
        </h1>
        {nodes === null && (
          <div className="flex items-center gap-2 py-8 type-ui text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t.common.loading}
          </div>
        )}
        {nodes?.length === 0 && (
          <p className="py-8 type-body text-muted-foreground">{t.chat.journeyEmpty}</p>
        )}
        {groups.map(([day, items]) => (
          <section key={day} className="mt-5">
            <div className="mb-1.5 flex items-center gap-2.5">
              <span className="type-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
                {day}
              </span>
              <span className="h-px flex-1 bg-border/70" />
            </div>
            <div className="space-y-1">
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setSel(n)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left type-body transition-colors ${
                    sel?.id === n.id
                      ? "border-foreground/25 bg-muted/60 text-foreground"
                      : "border-border bg-card text-foreground hover:border-foreground/20 hover:bg-muted/40"
                  }`}
                >
                  {n.kind === "skill" ? (
                    <Package className="h-4 w-4 shrink-0 text-live" />
                  ) : (
                    <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-px type-micro font-medium text-muted-foreground">
                    {n.kind === "skill" ? t.chat.journeySkill : t.chat.journeyMemory}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {sel && (
        <aside className="flex h-full w-[380px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card max-lg:hidden">
          <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
            {sel.kind === "skill" ? (
              <Package className="h-4 w-4 shrink-0 text-live" />
            ) : (
              <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate type-ui font-semibold text-foreground">
              {sel.label}
            </span>
            {!editing && detail !== null && (
              <button
                type="button"
                title={t.chat.rename}
                onClick={() => {
                  setDraft(detail);
                  setEditing(true);
                }}
                className="shrink-0 rounded p-1 text-text-tertiary transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              title={t.common.delete}
              onClick={() => void remove(sel)}
              disabled={busy}
              className="shrink-0 rounded p-1 text-text-tertiary transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={t.common.close}
              onClick={() => setSel(null)}
              className="shrink-0 rounded p-1 text-text-tertiary transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
            {detail === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : editing ? (
              <div className="flex h-full flex-col gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-h-0 flex-1 resize-none rounded-lg border border-border bg-background p-2.5 font-mono type-caption text-foreground outline-none focus:border-foreground/30"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-lg px-3 py-1.5 type-ui text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={busy}
                    className="rounded-lg bg-foreground px-3.5 py-1.5 type-ui font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {busy ? t.common.saving : t.common.save}
                  </button>
                </div>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono type-caption text-foreground/90">
                {detail}
              </pre>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
