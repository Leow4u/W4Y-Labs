import { Markdown } from "@/components/Markdown";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { useI18n } from "@/i18n";
import { timeAgo } from "@/lib/utils";

import { FileRefCard, extractFileRefs, type FileRef } from "./FileRefCard";
import { ToolCallCard } from "./ToolCallCard";
import { ToolCallGroup } from "./ToolCallGroup";
import type { ChatMessage } from "./types";

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

export function MessageBubble({
  msg,
  highlight,
  variant = "review",
}: {
  msg: ChatMessage;
  highlight?: string;
  /**
   * "review" (default) — the colored role blocks used to scan session
   * history in SessionsPage. "chat" — the sober live-chat look: user in a
   * discreet neutral bubble on the right, assistant as plain text on the
   * page (no colored block), matching the Manus/Claude benchmark and the
   * rest of the curated dashboard (no "coloridinha").
   */
  variant?: "chat" | "review";
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
        />
        <MessageBubble
          msg={{ ...msg, id: `${msg.id}-remainder`, content: compactionSplit.remainder }}
          highlight={highlight}
          variant={variant}
        />
      </>
    );
  }

  const isCompaction = compactionSplit !== null;

  // ── Sober live-chat look ──────────────────────────────────────────────
  if (variant === "chat") {
    if (msg.role === "user") {
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">
            {msg.content}
          </div>
        </div>
      );
    }

    const muted = msg.role === "system" || msg.role === "tool" || isCompaction;
    // Assistant messages can reference generated files with a
    // @session:<profile>/<path> token — pull those into cards and keep the
    // prose clean. Don't touch system/tool/compaction content.
    const { text, files }: { text: string; files: FileRef[] } = muted
      ? { text: msg.content ?? "", files: [] }
      : extractFileRefs(msg.content ?? "");

    return (
      <div className="min-w-0">
        {text &&
          (muted ? (
            <div className="whitespace-pre-wrap text-sm italic leading-relaxed text-muted-foreground">
              {isCompaction ? "Context handoff — " : ""}
              {text}
            </div>
          ) : (
            <Markdown content={text} streaming={msg.streaming} />
          ))}
        {files.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {files.map((f) => (
              <FileRefCard key={f.path} file={f} />
            ))}
          </div>
        )}
        {msg.toolCalls.length > 0 && (
          <div className="mt-2">
            <ToolCallGroup toolCalls={msg.toolCalls} />
          </div>
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
