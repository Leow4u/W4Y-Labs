import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, XCircle } from "lucide-react";
import { ListItem } from "@nous-research/ui/ui/components/list-item";

import { useI18n } from "@/i18n";
import type { ToolCallState } from "./types";

// Sober/monochrome by design (matches the curated dashboard — no
// "coloridinha"): the card is always neutral; only the small status icon
// carries a hint of semantic color.
const ICON_COLOR: Record<ToolCallState["status"], string> = {
  running: "text-muted-foreground",
  done: "text-success",
  error: "text-destructive",
};

function StatusIcon({ status }: { status: ToolCallState["status"] }) {
  if (status === "running") return <Loader2 className="h-3 w-3 animate-spin" />;
  if (status === "error") return <XCircle className="h-3 w-3" />;
  return <CheckCircle2 className="h-3 w-3" />;
}

/**
 * Evolution of the old `ToolCallBlock` (previously only in SessionsPage.tsx,
 * only showed the call itself). Renders a `ToolCallState` — args, and when
 * present (live turns), the result/error/duration too.
 */
export function ToolCallCard({ toolCall }: { toolCall: ToolCallState }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const hasBody = !!(toolCall.argsPreview || toolCall.result || toolCall.error || toolCall.inlineDiff);

  return (
    <div className="rounded-md border border-border bg-muted/30">
      <ListItem
        onClick={() => hasBody && setOpen(!open)}
        aria-label={`${open ? t.common.collapse : t.common.expand} tool call ${toolCall.name}`}
        aria-expanded={open}
        className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-foreground/5"
      >
        <span className={ICON_COLOR[toolCall.status]}>
          <StatusIcon status={toolCall.status} />
        </span>
        {hasBody &&
          (open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          ))}
        <span className="font-mono-ui font-medium text-foreground/80">{toolCall.name}</span>
        {typeof toolCall.durationS === "number" && (
          <span className="opacity-60">{toolCall.durationS.toFixed(1)}s</span>
        )}
      </ListItem>

      {open && (
        <div className="border-t border-border px-3 py-2 text-xs space-y-2">
          {toolCall.argsPreview && (
            <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap font-mono">
              {toolCall.argsPreview}
            </pre>
          )}
          {toolCall.inlineDiff && (
            <pre className="text-foreground/80 overflow-x-auto whitespace-pre-wrap font-mono border-t border-current/10 pt-2">
              {toolCall.inlineDiff}
            </pre>
          )}
          {toolCall.error && (
            <pre className="text-destructive overflow-x-auto whitespace-pre-wrap font-mono border-t border-current/10 pt-2">
              {toolCall.error}
            </pre>
          )}
          {toolCall.result && !toolCall.error && (
            <pre className="text-foreground/80 overflow-x-auto whitespace-pre-wrap font-mono border-t border-current/10 pt-2">
              {toolCall.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
