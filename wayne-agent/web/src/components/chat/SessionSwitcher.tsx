/**
 * SessionSwitcher — the quick session switcher (Onda 4, the role of Ctrl+Tab/
 * Ctrl+X on desktop/TUI; on the web the shortcut is Ctrl+K — Ctrl+Tab is
 * reserved by the browser). Overlay with search, "+ Nova tarefa" on top (born
 * on the composer's current tier — existing per-session contract) and the
 * recent tasks with the LIVE dot (working/waiting on you) via
 * wayne:session-activity. ↑/↓ navigate, Enter switches, Esc closes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, MessageSquare, Search, SquarePen } from "lucide-react";

import { useI18n } from "@/i18n";
import { api, type SessionInfo } from "@/lib/api";
import { timeAgoShort } from "@/lib/utils";

export function SessionSwitcher({
  open,
  onClose,
  currentId,
  modeBadge,
}: {
  open: boolean;
  onClose: () => void;
  currentId: string | null;
  /** Current tier (Flash/Auto/…): hint on the "+ Nova tarefa" row. */
  modeBadge?: string | null;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [live, setLive] = useState<Record<string, "working" | "attention">>({});

  useEffect(() => {
    const onActivity = (e: Event) => {
      const d = (e as CustomEvent).detail as { id?: string; state?: string };
      if (!d?.id) return;
      setLive((prev) => {
        if (d.state === "working" || d.state === "attention")
          return prev[d.id!] === d.state ? prev : { ...prev, [d.id!]: d.state as "working" };
        if (!(d.id! in prev)) return prev;
        const next = { ...prev };
        delete next[d.id!];
        return next;
      });
    };
    window.addEventListener("wayne:session-activity", onActivity);
    return () => window.removeEventListener("wayne:session-activity", onActivity);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSel(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    void api
      .getSessions(20, 0, undefined, "recent", { excludeSources: "cron", minMessages: 1 })
      .then((res) => setSessions(res.sessions ?? []))
      .catch(() => setSessions([]));
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? sessions.filter((s) =>
        `${s.title ?? ""} ${s.preview ?? ""}`.toLowerCase().includes(q),
      )
    : sessions;
  // Row 0 = "+ Nova tarefa"; 1..N = sessions.
  const total = filtered.length + 1;

  const pick = useCallback(
    (index: number) => {
      onClose();
      if (index === 0) {
        navigate("/chat?new=1");
        return;
      }
      const s = filtered[index - 1];
      if (s) navigate(`/chat?resume=${encodeURIComponent(s.id)}`);
    },
    [filtered, navigate, onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => (s + 1) % total);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => (s - 1 + total) % total);
      } else if (e.key === "Enter") {
        e.preventDefault();
        pick(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, total, sel, pick, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 pt-[12vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-[min(560px,92vw)] overflow-hidden rounded-2xl border border-border bg-card shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
            placeholder={t.sessions.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent type-body text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 type-micro font-semibold text-muted-foreground">
            Esc
          </kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          <button
            type="button"
            onMouseEnter={() => setSel(0)}
            onClick={() => pick(0)}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left type-body transition-colors ${
              sel === 0 ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/60"
            }`}
          >
            <SquarePen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 font-medium">{t.chat.newTask}</span>
            {modeBadge && (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-px type-micro font-medium text-muted-foreground">
                {modeBadge}
              </span>
            )}
          </button>
          {filtered.map((s, i) => {
            const idx = i + 1;
            const label = s.title?.trim() || s.preview?.trim() || t.sessions.untitledSession;
            const state = live[s.id];
            return (
              <button
                key={s.id}
                type="button"
                onMouseEnter={() => setSel(idx)}
                onClick={() => pick(idx)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left type-body transition-colors ${
                  sel === idx ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/60"
                }`}
              >
                {state === "working" ? (
                  <span className="relative grid h-4 w-4 shrink-0 place-items-center">
                    <span className="absolute h-2 w-2 animate-ping rounded-full bg-live/40" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
                  </span>
                ) : state === "attention" ? (
                  <span className="grid h-4 w-4 shrink-0 place-items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  </span>
                ) : s.source === "cron" ? (
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                ) : (
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                )}
                <span
                  className={`min-w-0 flex-1 truncate ${s.id === currentId ? "font-semibold" : ""}`}
                >
                  {label}
                </span>
                <span className="shrink-0 type-micro tabular-nums text-muted-foreground/60">
                  {timeAgoShort(s.last_active || s.started_at, {
                    ageNow: t.chat.ageNow,
                    ageMin: t.chat.ageMin,
                    ageHour: t.chat.ageHour,
                    ageDay: t.chat.ageDay,
                  })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
