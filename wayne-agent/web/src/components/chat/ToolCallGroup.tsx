import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, XCircle } from "lucide-react";
import { ListItem } from "@nous-research/ui/ui/components/list-item";

import { useI18n } from "@/i18n";
import { ToolCallCard } from "./ToolCallCard";
import type { ToolCallState } from "./types";

/**
 * Collapses a run's tool calls into one compact chip (last tool name + count +
 * aggregate status), expandable to the individual cards — instead of a tall
 * stack of one row per tool. A single tool renders directly (no wrapper).
 * While running it stays informative (spinner + current tool name) even
 * collapsed, so "seeing the work happen" is preserved.
 */
export function ToolCallGroup({ toolCalls }: { toolCalls: ToolCallState[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (toolCalls.length === 0) return null;
  if (toolCalls.length === 1) return <ToolCallCard toolCall={toolCalls[0]} />;

  const running = toolCalls.some((tc) => tc.status === "running");
  const errored = toolCalls.some((tc) => tc.status === "error");
  const last = toolCalls[toolCalls.length - 1];
  const iconColor = running ? "text-muted-foreground" : errored ? "text-destructive" : "text-success";

  return (
    <div className="rounded-md border border-border bg-muted/20">
      <ListItem
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${open ? t.common.collapse : t.common.expand} · ${toolCalls.length} ${t.chat.toolsLabel}`}
        className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-foreground/5"
      >
        <span className={iconColor}>
          {running ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : errored ? (
            <XCircle className="h-3 w-3" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
        </span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-mono-ui font-medium text-foreground/80">
          {last.name}
          {running ? "…" : ""}
        </span>
        <span className="ml-auto opacity-60">
          {toolCalls.length} {t.chat.toolsLabel}
        </span>
      </ListItem>

      {open && (
        <div className="space-y-1.5 border-t border-border p-1.5">
          {toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
}
