import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Circle,
  Copy,
  GitBranch,
  RotateCw,
  Sparkles,
} from "lucide-react";

import { Markdown } from "@/components/Markdown";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

import { FileRefCard, extractFileRefs, extractConnectLinks } from "./FileRefCard";
import { ConnectLinkCard } from "./ConnectLinkCard";
import { ToolCallCard } from "./ToolCallCard";
import { ToolLine } from "./ToolLine";
import type { ChatMessage, TaskStep, ToolCallState } from "./types";

// Tools whose own panel already shows everything — the tool line in the
// transcript is redundant noise (e.g. `clarify` opens the ClarifyPanel with the
// question + options; showing "Usando ferramenta / Asking … / 5m 0s" only clutters).
const NOISE_TOOL_RE = /\bclarify\b|ask[_-]?user|ask[_-]?question|request[_-]?clarif/i;
const isNoiseTool = (name: string | undefined) => !!name && NOISE_TOOL_RE.test(name);

// Context-compaction handoff blocks are persisted as role="user" or
// role="assistant" with content starting with one of these prefixes — they're
// metadata inserted by agent/context_compressor.py, NOT real turns the user
// typed or the model replied with. Rendering them with the same styling as
// regular messages confuses operators scrolling the session timeline
// (#29824), so we detect them here and downgrade them to a muted, clearly
// labelled "Context handoff" row. Keep these in sync with
// SUMMARY_PREFIX/LEGACY_SUMMARY_PREFIX and the merge-into-tail marker in
// agent/context_compressor.py.
const COMPACTION_PREFIXES = [
  "[CONTEXT COMPACTION — REFERENCE ONLY]",
  "[CONTEXT COMPACTION - REFERENCE ONLY]",
  "[CONTEXT SUMMARY]:",
] as const;

const COMPACTION_END_MARKER =
  "--- END OF CONTEXT SUMMARY — respond to the message below, not the summary above ---";

interface CompactionSplit {
  summary: string;
  remainder: string;
}

function splitCompactionContent(content: string): CompactionSplit | null {
  const head = content.trimStart();
  if (!COMPACTION_PREFIXES.some((p) => head.startsWith(p))) return null;
  const markerIdx = content.indexOf(COMPACTION_END_MARKER);
  if (markerIdx < 0) {
    return { summary: content, remainder: "" };
  }
  return {
    summary: content.slice(0, markerIdx),
    remainder: content
      .slice(markerIdx + COMPACTION_END_MARKER.length)
      .replace(/^\s+/, ""),
  };
}

// ── Chat variant building blocks (Manus look) ─────────────────────────

/** Thumbnail of a user-attached image — resolved via /api/files/read. */
function UserImageThumb({ rel }: { rel: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .readFile(rel)
      .then((r) => {
        if (!cancelled) setUrl(r.data_url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rel]);
  if (!url) {
    return <span className="h-24 w-32 animate-pulse rounded-lg bg-muted" aria-hidden />;
  }
  return (
    <img
      src={url}
      alt=""
      className="max-h-48 max-w-full rounded-lg border border-border object-contain"
    />
  );
}

/** Pulsing blue dot — the reference's "this step is live" indicator. */
function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-30" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-live" />
    </span>
  );
}

/** The model's reasoning — a disclosure with a LIVE PREVIEW (parity with the
 *  desktop, ThinkingDisclosure): auto-opens while the model thinks (you see the
 *  reasoning flow), auto-collapses when it ends. The user's click wins. */
function ReasoningBlock({ text, live }: { text: string; live?: boolean }) {
  const { t } = useI18n();
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const open = userToggled ?? !!live;
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setUserToggled(!open)}
        className={`flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground/80 transition-colors hover:text-foreground ${
          live && !open ? "chat-working" : ""
        }`}
      >
        <Sparkles className="h-3 w-3" />
        {t.chat.reasoning}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="ml-[5px] mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap border-l border-border/60 pl-3 text-[13px] leading-relaxed text-muted-foreground">
          {text}
        </div>
      )}
    </div>
  );
}

/** Plain text of a message (text blocks or content) — for copying. */
function messagePlainText(msg: ChatMessage): string {
  if (msg.blocks && msg.blocks.length) {
    return msg.blocks
      .filter((b): b is Extract<typeof b, { kind: "text" }> => b.kind === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }
  return (msg.content ?? "").trim();
}

/** Reply action bar (hover): copy · regenerate · branch (parity: the desktop's
 *  AssistantActionBar). Regenerate/branch only on the last reply. */
function MessageActions({
  msg,
  isLast,
  onRegenerate,
  onBranch,
}: {
  msg: ChatMessage;
  isLast?: boolean;
  onRegenerate?: () => void;
  onBranch?: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = messagePlainText(msg);
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const btn =
    "flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-tertiary transition-colors hover:bg-muted hover:text-foreground";
  return (
    <div className="mt-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
      <button type="button" onClick={copy} className={btn} title={t.chat.copy}>
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {isLast && onRegenerate && (
        <button type="button" onClick={onRegenerate} className={btn} title={t.chat.regenerate}>
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      )}
      {isLast && onBranch && (
        <button type="button" onClick={onBranch} className={btn} title={t.chat.branchChat}>
          <GitBranch className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ThinkingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span>{label}</span>
      <span className="flex items-end gap-0.5 pb-[3px]">
        <span className="chat-dot h-1 w-1 rounded-full bg-muted-foreground" />
        <span className="chat-dot h-1 w-1 rounded-full bg-muted-foreground" />
        <span className="chat-dot h-1 w-1 rounded-full bg-muted-foreground" />
      </span>
    </div>
  );
}

/**
 * A run of consecutive tool calls, optionally nested under its plan step
 * (Manus-style): step header line (live dot / muted check + title + chevron),
 * tools indented beneath. Steps auto-collapse once completed unless the user
 * toggled them open.
 */
function StepRun({
  tools,
  step,
}: {
  tools: ToolCallState[];
  step?: TaskStep;
}) {
  const { t } = useI18n();
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const anyRunning = tools.some((tc) => tc.status === "running");

  // Internal rollout (parity with the desktop): the tool list NEVER becomes a
  // wall — capped height with its own scroll.
  const listCls =
    "ml-[5px] max-h-56 space-y-0.5 overflow-y-auto border-l border-border/60 pl-[18px]";

  if (!step) {
    // Few tools → plain lines. Many → collapsible rollout: open while running,
    // AUTO-COLLAPSES into an "N ferramentas" chip when done (the user can
    // reopen it) — the way the desktop does with the activity block.
    if (tools.length <= 3) {
      return (
        <div className="space-y-0.5">
          {tools.map((tc) => (
            <ToolLine key={tc.id} tool={tc} />
          ))}
        </div>
      );
    }
    const open = userToggled ?? anyRunning;
    return (
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => setUserToggled(!open)}
          className="group flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/50"
        >
          {anyRunning ? (
            <LiveDot />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              anyRunning ? "font-medium text-foreground" : "text-muted-foreground"
            }`}
          >
            {tools.length} {t.chat.toolsLabel}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform ${
              open ? "" : "-rotate-90"
            }`}
          />
        </button>
        {open && (
          <div className={listCls}>
            {tools.map((tc) => (
              <ToolLine key={tc.id} tool={tc} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const live = step.status === "in_progress" || anyRunning;
  const open = userToggled ?? live;

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setUserToggled(!open)}
        className="group flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/50"
      >
        {live ? (
          <LiveDot />
        ) : step.status === "completed" ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Circle className="h-2.5 w-2.5 shrink-0 text-text-tertiary" />
        )}
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            live ? "font-medium text-foreground" : "text-muted-foreground"
          }`}
        >
          {step.content}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open && (
        <div className={listCls}>
          {tools.map((tc) => (
            <ToolLine key={tc.id} tool={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Markdown text block + any referenced-file cards it carries.
 *  `seen` dedupes the cards AT THE MESSAGE LEVEL: the agent tends to cite the
 *  same file more than once (announcement + the subagent's conclusion) and each
 *  citation turned into a repeated card (seen live during curation). */
function TextBlock({
  text,
  streaming,
  seen,
}: {
  text: string;
  streaming?: boolean;
  seen?: Set<string>;
}) {
  const { text: cleanedFiles, files } = extractFileRefs(text);
  const { text: cleaned, links } = extractConnectLinks(cleanedFiles);
  const unique = seen
    ? files.filter((f) => {
        const key = f.path ?? f.url ?? f.name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    : files;
  const uniqueLinks = seen
    ? links.filter((u) => {
        const key = `connect:${u}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    : links;
  return (
    <div>
      {cleaned && <Markdown content={cleaned} streaming={streaming} />}
      {(unique.length > 0 || uniqueLinks.length > 0) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {unique.map((f) => (
            <FileRefCard key={f.path ?? f.url} file={f} />
          ))}
          {uniqueLinks.map((u) => (
            <ConnectLinkCard key={u} url={u} context={cleaned} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({
  msg,
  highlight,
  variant = "review",
  steps,
  badge,
  isLast,
  onRegenerate,
  onBranch,
}: {
  msg: ChatMessage;
  highlight?: string;
  /** Last message in the list — enables regenerate/branch (chat). */
  isLast?: boolean;
  onRegenerate?: () => void;
  onBranch?: () => void;
  /**
   * "review" (default) — the colored role blocks used to scan session
   * history in SessionsPage. "chat" — the native chat look, faithful to the
   * Manus reference: user in a bordered white bubble on the right, assistant
   * as an agent-headed rich block with plan steps + tool lines inline.
   */
  variant?: "chat" | "review";
  /** Live plan steps (chat variant) — lets tool runs nest under their step. */
  steps?: TaskStep[];
  /** Mode badge shown next to the agent name (chat variant), e.g. "Crew". */
  badge?: string;
}) {
  const { t } = useI18n();

  const ROLE_STYLES: Record<
    string,
    { bg: string; text: string; label: string }
  > = {
    user: { bg: "bg-primary/10", text: "text-primary", label: t.sessions.roles.user },
    assistant: {
      bg: "bg-success/10",
      text: "text-success",
      label: t.sessions.roles.assistant,
    },
    system: {
      bg: "bg-muted",
      text: "text-muted-foreground",
      label: t.sessions.roles.system,
    },
    tool: { bg: "bg-warning/10", text: "text-warning", label: t.sessions.roles.tool },
    // Compaction handoffs render as faded system-style metadata with a
    // distinctive label so they can't be mistaken for real assistant
    // replies during a scroll-back review (#29824).
    compaction: {
      bg: "bg-muted/50",
      text: "text-muted-foreground italic",
      label: "Context handoff",
    },
  };

  // When a compaction handoff is merged into the front of the first tail
  // message (the compressor's double-collision path —
  // _merge_summary_into_tail in agent/context_compressor.py), split it back
  // into two visual rows so the operator's actual answer survives as a
  // readable bubble next to the (clearly-labelled) handoff metadata.
  const compactionSplit =
    typeof msg.content === "string" ? splitCompactionContent(msg.content) : null;

  if (compactionSplit && compactionSplit.remainder) {
    return (
      <>
        <MessageBubble
          msg={{ ...msg, id: `${msg.id}-summary`, content: compactionSplit.summary }}
          highlight={highlight}
          variant={variant}
          steps={steps}
          badge={badge}
        />
        <MessageBubble
          msg={{ ...msg, id: `${msg.id}-remainder`, content: compactionSplit.remainder }}
          highlight={highlight}
          variant={variant}
          steps={steps}
          badge={badge}
        />
      </>
    );
  }

  const isCompaction = compactionSplit !== null;

  // ── Native chat look (Manus reference) ────────────────────────────────
  if (variant === "chat") {
    if (msg.role === "user") {
      return (
        <div className="chat-msg-in flex justify-end">
          <div className="max-w-[78%] rounded-2xl border border-border bg-card px-4 py-2.5 shadow-card">
            {msg.images && msg.images.length > 0 && (
              <div className="mb-2 flex flex-wrap justify-end gap-2 pt-1">
                {msg.images.map((rel) => (
                  <UserImageThumb key={rel} rel={rel} />
                ))}
              </div>
            )}
            <div className="whitespace-pre-wrap break-words text-[16px] leading-relaxed text-foreground">
              {msg.content}
            </div>
          </div>
        </div>
      );
    }

    // Orphan tool result (no pair in the history stitching) — becomes a
    // discreet, expandable ToolLine, NEVER loose text in the conversation
    // (tool payloads are giant JSON/tracebacks).
    if (msg.role === "tool" && !isCompaction) {
      return (
        <ToolLine
          tool={{
            id: msg.id,
            name: msg.toolName ?? "tool",
            status: "done",
            result: msg.content ?? undefined,
          }}
        />
      );
    }

    const muted = msg.role === "system" || isCompaction;

    // Muted rows (system / compaction): plain, no file parsing.
    if (muted) {
      return (
        <div className="min-w-0">
          {msg.content && (
            <div className="whitespace-pre-wrap text-[13px] italic leading-relaxed text-muted-foreground/80">
              {isCompaction ? "Context handoff — " : ""}
              {msg.content}
            </div>
          )}
          {msg.toolCalls.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {msg.toolCalls.map((tc) => (
                <ToolLine key={tc.id} tool={tc} />
              ))}
            </div>
          )}
        </div>
      );
    }

    // Assistant. Live turns carry ordered blocks (text/tool interleaved) —
    // render in arrival order; consecutive tools sharing a plan step nest
    // under that step's header line, exactly like the reference.
    const stepById = new Map<string, TaskStep>((steps ?? []).map((s) => [s.id, s]));
    // Dedupe of the file cards across the WHOLE message (rebuilt on each render).
    const seenFiles = new Set<string>();
    const body: ReactNode[] = [];

    const blocks = msg.blocks;
    if (blocks && blocks.length > 0) {
      const lastTextIdx = blocks.reduce((acc, b, i) => (b.kind === "text" ? i : acc), -1);
      let run: ToolCallState[] = [];
      let runStep: string | undefined;
      const flush = (key: string) => {
        if (!run.length) return;
        body.push(
          <StepRun
            key={`run-${key}`}
            tools={run}
            step={runStep ? stepById.get(runStep) : undefined}
          />,
        );
        run = [];
        runStep = undefined;
      };
      blocks.forEach((b, i) => {
        if (b.kind === "tool") {
          if (isNoiseTool(b.tool.name)) return; // clarify → the panel already shows it
          if (run.length && b.tool.stepId !== runStep) flush(`s-${i}`);
          runStep = b.tool.stepId;
          run.push(b.tool);
          return;
        }
        flush(String(i));
        if (b.text.trim()) {
          body.push(
            <TextBlock
              key={b.id}
              text={b.text}
              streaming={msg.streaming && i === lastTextIdx}
              seen={seenFiles}
            />,
          );
        }
      });
      flush("end");
    } else if (msg.content) {
      // History assistant (no blocks).
      body.push(
        <TextBlock
          key="hist"
          text={msg.content}
          streaming={msg.streaming}
          seen={seenFiles}
        />,
      );
      {
        const histTools = msg.toolCalls.filter((tc) => !isNoiseTool(tc.name));
        if (histTools.length > 0) {
          body.push(
            <div key="hist-tools" className="space-y-0.5">
              {histTools.map((tc) => (
                <ToolLine key={tc.id} tool={tc} />
              ))}
            </div>,
          );
        }
      }
    }

    if (body.length === 0 && msg.streaming) {
      body.push(<ThinkingRow key="thinking" label={t.chat.thinking} />);
    } else if (body.length === 0 && !msg.reasoning && !msg.errorKind) {
      // The turn ended 100% empty with no error signalled — NEVER leave the
      // bubble EMPTY (it looked "frozen"): generic notice + regenerate button.
      body.push(
        <span key="empty" className="text-sm italic text-muted-foreground">
          {t.chat.noResponse}
        </span>,
      );
    }

    // Turn error (e.g. the provider's 402) signalled by the gateway with no
    // final reply text — shows the localized and SAFE reason (NEVER the raw
    // text, which carries the key's URL/hash). Appended even if tools ran.
    if (msg.errorKind && !msg.streaming) {
      body.push(
        msg.errorKind === "billing" ? (
          <div
            key="err-billing"
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
          >
            {t.chat.errorBilling}
          </div>
        ) : (
          <div
            key="err-generic"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {t.chat.errorGeneric}
          </div>
        ),
      );
    }

    return (
      <div className="group/msg chat-msg-in min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <img src="/brand/work4you-favicon.svg" alt="" className="h-4 w-4" />
          <span className="text-sm font-semibold tracking-tight text-foreground">Work4You</span>
          {badge && (
            <span className="rounded-md bg-live/10 px-1.5 py-px text-xs font-medium text-live">
              {badge}
            </span>
          )}
          {msg.timestamp && (
            <span className="ml-auto text-xs text-text-tertiary">
              {timeAgo(msg.timestamp)}
            </span>
          )}
        </div>
        {msg.reasoning && (
          <div className="mb-2">
            <ReasoningBlock text={msg.reasoning} live={msg.streaming} />
          </div>
        )}
        <div className="min-w-0 space-y-2.5 text-[15px] leading-relaxed">{body}</div>
        {!msg.streaming && body.length > 0 && (
          <MessageActions
            msg={msg}
            isLast={isLast}
            onRegenerate={onRegenerate}
            onBranch={onBranch}
          />
        )}
      </div>
    );
  }

  // ── Review look (session history) ─────────────────────────────────────
  const style = isCompaction ? ROLE_STYLES.compaction : ROLE_STYLES[msg.role] ?? ROLE_STYLES.system;
  const label = isCompaction
    ? ROLE_STYLES.compaction.label
    : msg.toolName
      ? `${t.sessions.roles.tool}: ${msg.toolName}`
      : style.label;

  const isHit = (() => {
    if (!highlight || !msg.content) return false;
    const content = msg.content.toLowerCase();
    const terms = highlight.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.some((term) => content.includes(term));
  })();

  const highlightTerms = isHit && highlight ? highlight.split(/\s+/).filter(Boolean) : undefined;

  return (
    <div
      className={`${style.bg} p-3 ${isHit ? "ring-1 ring-warning/40" : ""}`}
      data-search-hit={isHit || undefined}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-semibold ${style.text}`}>{label}</span>
        {isHit && (
          <Badge tone="warning" className="text-xs py-0 px-1.5">
            {t.common.match}
          </Badge>
        )}
        {msg.timestamp && (
          <span className="text-xs text-text-tertiary">{timeAgo(msg.timestamp)}</span>
        )}
      </div>
      {msg.content &&
        (msg.role === "system" ? (
          <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {msg.content}
          </div>
        ) : (
          <Markdown
            content={msg.content}
            highlightTerms={highlightTerms}
            streaming={msg.streaming}
          />
        ))}
      {msg.toolCalls.length > 0 && (
        <div className="mt-1">
          {msg.toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
}
