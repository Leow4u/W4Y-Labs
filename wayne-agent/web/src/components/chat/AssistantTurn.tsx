/**
 * AssistantTurn — ONE whole Wayne turn (Onda 1 of the Editorial redesign).
 *
 * The gateway emits a message.start/complete per ROUND of the agent loop,
 * which produced several bubbles with the "Wayne" header repeated within the
 * same turn (the biggest source of visual clutter). This component takes the
 * CONSECUTIVE assistant messages of a turn and presents them as ONE unit:
 *
 *   header (1×) → [Activity] → — Response — → serif prose
 *
 * The ACTIVITY (backstage: reasoning, tools with ├─/└─ rails, narration, live
 * todo, transient status) stays OPEN while the turn runs — "the client sees
 * everything happening" — and AUTO-COLLAPSES when it ends into a line
 * "✓ Trabalhou por 1m 32s · 12 ferramentas" (Claude pattern). The RESPONSE is
 * the text after the last tool, in Source Serif 4 (.prose-serif) — Wayne's
 * voice. Detail modes: hidden / collapsed / expanded (persisted by the page in
 * localStorage), with a per-turn override on click.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Circle,
  Copy,
  Eye,
  GitBranch,
  Loader2,
  RotateCw,
  Sparkles,
  XCircle,
} from "lucide-react";

import { Markdown } from "@/components/Markdown";
import { GlyphSpinner } from "./GlyphSpinner";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import { useI18n } from "@/i18n";

import { FileRefCard, extractFileRefs, extractConnectLinks } from "./FileRefCard";
import { ConnectLinkCard } from "./ConnectLinkCard";
import { ToolLine } from "./ToolLine";
import type { ChatMessage, TaskStep, ToolCallState } from "./types";

export type DetailMode = "hidden" | "collapsed" | "expanded";

/* ── internal turn model ─────────────────────────────────────────────── */

type TurnItem =
  | { kind: "text"; id: string; text: string; streaming: boolean }
  | { kind: "tool"; tool: ToolCallState }
  | { kind: "reasoning"; id: string; text: string; live: boolean };

interface TurnSplit {
  activity: TurnItem[];
  response: Array<Extract<TurnItem, { kind: "text" }>>;
  toolCount: number;
  hasError: "billing" | "generic" | null;
}

/** Flattens the turn's messages into ordered items and splits them into
 *  activity (up to the last tool, + reasonings) vs response (text after
 *  the last tool). During the stream the split is recomputed on every
 *  render — text after the most recent tool is born as response; if
 *  another tool starts, it "folds" back into activity (becomes narration). */
function splitTurn(messages: ChatMessage[]): TurnSplit {
  const items: TurnItem[] = [];
  let hasError: TurnSplit["hasError"] = null;

  for (const msg of messages) {
    if (msg.reasoning) {
      items.push({
        kind: "reasoning",
        id: `${msg.id}-r`,
        text: msg.reasoning,
        live: !!msg.streaming && !msg.content,
      });
    }
    if (msg.blocks && msg.blocks.length > 0) {
      for (const b of msg.blocks) {
        if (b.kind === "text") {
          if (b.text.trim())
            items.push({ kind: "text", id: b.id, text: b.text, streaming: !!msg.streaming });
        } else {
          items.push({ kind: "tool", tool: b.tool });
        }
      }
    } else {
      if (msg.content?.trim())
        items.push({
          kind: "text",
          id: `${msg.id}-t`,
          text: msg.content,
          streaming: !!msg.streaming,
        });
      for (const tc of msg.toolCalls) items.push({ kind: "tool", tool: tc });
    }
    if (msg.errorKind) hasError = msg.errorKind;
  }

  let lastTool = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === "tool") {
      lastTool = i;
      break;
    }
  }

  const activity: TurnItem[] = [];
  const response: Array<Extract<TurnItem, { kind: "text" }>> = [];
  items.forEach((it, i) => {
    if (it.kind === "reasoning") activity.push(it);
    else if (i <= lastTool) activity.push(it);
    else if (it.kind === "text") response.push(it);
    else activity.push(it);
  });
  // The last text of the stream marks streaming for the caret; earlier ones don't.
  const lastResp = response[response.length - 1];
  response.forEach((r) => {
    if (r !== lastResp) r.streaming = false;
  });

  return {
    activity,
    response,
    toolCount: items.filter((i) => i.kind === "tool").length,
    hasError,
  };
}

function fmtDuration(s: number): string {
  if (s < 60) return `${Math.max(1, Math.round(s))}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

/* ── visual blocks ───────────────────────────────────────────────────── */

/** A chunk of the turn's text: markdown + deduped file cards (the extract
 *  also STRIPS the MEDIA:/@session: tokens from the text). */
function TextWithFiles({
  id,
  text,
  streaming,
  seen,
}: {
  id: string;
  text: string;
  streaming?: boolean;
  seen: Set<string>;
}) {
  const { text: cleanFiles, files } = extractFileRefs(text);
  const { text: clean, links } = extractConnectLinks(cleanFiles);
  const fresh = files.filter((f) => {
    const key = f.path ?? f.url ?? f.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const freshLinks = links.filter((u) => {
    const key = `connect:${u}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <div key={id} className="space-y-2.5">
      <Markdown content={clean} streaming={streaming} />
      {(fresh.length > 0 || freshLinks.length > 0) && (
        <div className="flex flex-wrap gap-2 py-1">
          {fresh.map((f) => (
            <FileRefCard key={f.path ?? f.url ?? f.name} file={f} />
          ))}
          {freshLinks.map((u) => (
            <ConnectLinkCard key={u} url={u} context={clean} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The response's serif prose. */
function ResponseProse({
  parts,
  seen,
}: {
  parts: Array<{ id: string; text: string; streaming: boolean }>;
  seen: Set<string>;
}) {
  return (
    <div className="prose-serif min-w-0 space-y-2.5 text-foreground">
      {parts.map((p) => (
        <TextWithFiles key={p.id} id={p.id} text={p.text} streaming={p.streaming} seen={seen} />
      ))}
    </div>
  );
}

/** Reasoning: "Pensando…" shimmer while live; collapsed afterwards. */
function ReasoningItem({ text, live }: { text: string; live: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<boolean | null>(null);
  const show = open ?? live;
  const preview = text.trim().split("\n").filter(Boolean).slice(-3).join("\n");

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => (o == null ? !live : !o))}
        className="group flex w-full items-center gap-2 rounded-md px-1 py-[3px] text-left transition-colors hover:bg-muted/50"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
        {live ? (
          <span className="text-shimmer type-ui font-medium">{t.chat.thinking}…</span>
        ) : (
          <span className="type-ui text-muted-foreground">{t.chat.reasoning}</span>
        )}
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-text-tertiary transition-transform ${show ? "rotate-180" : ""}`}
        />
      </button>
      {show && (
        <div className="mb-1 ml-[7px] max-h-56 overflow-y-auto whitespace-pre-wrap border-l border-border/70 py-1 pl-3.5 type-ui text-muted-foreground/90">
          {live ? preview : text}
        </div>
      )}
    </div>
  );
}

/** The turn's LIVE task checklist (the old composer panel, now inside the
 *  activity — where the work happens). */
function TodoChecklist({ steps }: { steps: TaskStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="space-y-0.5 py-0.5">
      {steps.map((s) => (
        <div key={s.id} className="flex items-start gap-2 px-1 type-ui">
          {s.status === "completed" ? (
            <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-success" />
          ) : s.status === "in_progress" ? (
            <Loader2 className="mt-[3px] h-3.5 w-3.5 shrink-0 animate-spin text-live" />
          ) : s.status === "cancelled" ? (
            <XCircle className="mt-[3px] h-3.5 w-3.5 shrink-0 text-text-tertiary" />
          ) : (
            <Circle className="mt-[4px] h-3 w-3 shrink-0 text-text-tertiary" />
          )}
          <span
            className={
              s.status === "completed"
                ? "text-muted-foreground line-through decoration-border"
                : s.status === "in_progress"
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
            }
          >
            {s.content}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── the component ───────────────────────────────────────────────────── */

export function AssistantTurn({
  messages,
  isLast = false,
  busy = false,
  detailMode,
  onDetailModeChange,
  steps = [],
  statusText = null,
  onCopy,
  onRegenerate,
  onBranch,
}: {
  /** CONSECUTIVE assistant messages of this turn, in order. */
  messages: ChatMessage[];
  isLast?: boolean;
  busy?: boolean;
  detailMode: DetailMode;
  onDetailModeChange?: (m: DetailMode) => void;
  /** LIVE todo (only the active turn receives it). */
  steps?: TaskStep[];
  /** Transient status line ("analisando o resultado…"). */
  statusText?: string | null;
  onCopy?: (text: string) => void;
  onRegenerate?: () => void;
  onBranch?: () => void;
}) {
  const { t } = useI18n();
  const streaming = messages.some((m) => m.streaming);
  const { activity, response, toolCount, hasError } = splitTurn(messages);
  const hasActivity = activity.length > 0 || (streaming && steps.length > 0);
  const hasResponse = response.length > 0;

  // Turn clock (client-side): starts on the first streaming render, freezes
  // when the turn ends. Historical turns end up with no duration.
  const startedRef = useRef<number | null>(null);
  const [durationS, setDurationS] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  if (streaming && startedRef.current == null) startedRef.current = Date.now();
  useEffect(() => {
    if (!streaming && startedRef.current != null && durationS == null) {
      setDurationS((Date.now() - startedRef.current) / 1000);
    }
  }, [streaming, durationS]);
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [streaming]);

  // Detail mode: the per-turn override (click) beats the global default.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [modeMenu, setModeMenu] = useState(false);
  useMenuDismiss(modeMenu, () => setModeMenu(false), "turn-eye");
  const activityOpen =
    streaming || (userOpen ?? (detailMode === "expanded" ? true : false));
  const showActivity = hasActivity && (detailMode !== "hidden" || userOpen === true);

  // Copy = the response (or everything, if there is no separated response).
  const copyText =
    response.map((r) => r.text).join("\n\n") ||
    messages.map((m) => m.content ?? "").filter(Boolean).join("\n\n");
  const [copied, setCopied] = useState(false);

  const seenFiles = new Set<string>();
  const elapsed =
    durationS ??
    (startedRef.current != null ? (Date.now() - startedRef.current) / 1000 : null);

  // ├─/└─ rails: index of the last tool so we can close the tree.
  const toolIdxs = activity
    .map((it, i) => (it.kind === "tool" ? i : -1))
    .filter((i) => i >= 0);
  const lastToolIdx = toolIdxs[toolIdxs.length - 1];

  const summaryLabel = (
    <>
      {streaming ? (
        <GlyphSpinner className="shrink-0 type-ui" />
      ) : hasError ? (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
      ) : (
        <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-success/15">
          <Check className="h-2.5 w-2.5 text-success" />
        </span>
      )}
      <span className="type-ui font-medium">
        {streaming
          ? statusText || `${t.chat.thinking}…`
          : elapsed != null
            ? t.chat.workedFor.replace("{t}", fmtDuration(elapsed))
            : t.chat.progressTitle}
      </span>
      {toolCount > 0 && (
        <span className="type-ui text-text-tertiary">
          · {toolCount} {toolCount === 1 ? t.chat.toolsOne : t.chat.toolsLabel}
        </span>
      )}
    </>
  );

  let body: ReactNode = null;
  if (showActivity) {
    body = (
      <div className="mb-1 mt-1.5">
        {/* Summary line: toggles collapsed/expanded; on the right, the mode
            selector (hidden/collapsed/expanded) shows on hover. */}
        <div className="group/summary relative -mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
          <button
            type="button"
            onClick={() => setUserOpen((o) => (o == null ? !activityOpen : !o))}
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-muted-foreground"
          >
            {summaryLabel}
            {!streaming && (
              <ChevronDown
                className={`h-3 w-3 shrink-0 text-text-tertiary transition-transform ${activityOpen ? "rotate-180" : ""}`}
              />
            )}
          </button>
          {onDetailModeChange && !streaming && (
            <button
              type="button"
              onClick={() => setModeMenu((v) => !v)}
              title={t.chat.detailsLabel}
              aria-label={t.chat.detailsLabel}
              className="shrink-0 rounded p-1 text-muted-foreground/0 transition-colors hover:bg-muted hover:text-foreground group-hover/summary:text-text-tertiary"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}
          {modeMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setModeMenu(false)} aria-hidden />
              <div data-menu-root="turn-eye" className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-border bg-card p-1 shadow-pop">
                {(
                  [
                    ["hidden", t.chat.detailHidden],
                    ["collapsed", t.chat.detailCollapsed],
                    ["expanded", t.chat.detailExpanded],
                  ] as Array<[DetailMode, string]>
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onDetailModeChange?.(m);
                      setUserOpen(null);
                      setModeMenu(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left type-ui text-foreground transition-colors hover:bg-muted"
                  >
                    {label}
                    {detailMode === m && <Check className="h-3.5 w-3.5 text-success" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {activityOpen && (
          <div className="relative mt-0.5 border-l border-dashed border-border pl-3.5">
            <div className="space-y-1">
              {activity.map((it, i) => {
                if (it.kind === "reasoning")
                  return <ReasoningItem key={it.id} text={it.text} live={it.live} />;
                if (it.kind === "text")
                  return (
                    <div
                      key={it.id}
                      className="px-1 py-0.5 type-body text-muted-foreground"
                    >
                      <TextWithFiles id={it.id} text={it.text} seen={seenFiles} />
                    </div>
                  );
                return (
                  <ToolLine
                    key={it.tool.id}
                    tool={it.tool}
                    rail={i === lastToolIdx ? "└─" : "├─"}
                  />
                );
              })}
              {streaming && <TodoChecklist steps={steps} />}
              {streaming && statusText && (
                <div className="flex items-center gap-2 px-1 py-0.5">
                  <span className="text-shimmer type-ui">{statusText}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="group/turn chat-msg-in min-w-0">
      {/* NO header (09/07 feedback): as in claude.ai, the assistant's response
          simply starts — the client already knows the model (they picked the
          tier in the composer). The actions live in the FOOTER, on hover. */}
      {body}

      {/* The backstage ↔ response separation is SPATIAL (Claude/desktop
          pattern), with no labeled line. */}
      {hasResponse && (
        <div className={showActivity ? "mt-3" : undefined}>
          <ResponseProse parts={response} seen={seenFiles} />
        </div>
      )}

      {/* Empty/error states of the turn. */}
      {!hasResponse && streaming && !hasActivity && (
        <span className="text-shimmer type-ui font-medium">{t.chat.thinking}…</span>
      )}
      {!hasResponse && !streaming && hasError === "billing" && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 type-ui text-warning">
          {t.chat.errorBilling}
        </div>
      )}
      {!hasResponse && !streaming && hasError === "generic" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 type-ui text-destructive">
          {t.chat.errorGeneric}
        </div>
      )}
      {!hasResponse && !streaming && !hasError && !hasActivity && (
        <span className="type-ui italic text-muted-foreground">{t.chat.noResponse}</span>
      )}

      {/* Actions footer — claude.ai style: small icons under the response,
          revealed on turn hover. */}
      {!streaming && (hasResponse || hasActivity) && (
        <div className="mt-2 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/turn:opacity-100">
          <button
            type="button"
            onClick={() => {
              onCopy?.(copyText);
              void navigator.clipboard.writeText(copyText).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            title={t.chat.copy}
            aria-label={t.chat.copy}
            className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </button>
          {isLast && !busy && onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              title={t.chat.regenerate}
              aria-label={t.chat.regenerate}
              className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          )}
          {isLast && !busy && onBranch && (
            <button
              type="button"
              onClick={onBranch}
              title={t.chat.branchChat}
              aria-label={t.chat.branchChat}
              className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-muted hover:text-foreground"
            >
              <GitBranch className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
