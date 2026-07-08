import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, XCircle } from "lucide-react";
import { ListItem } from "@nous-research/ui/ui/components/list-item";

import { useI18n } from "@/i18n";
import type { ToolCallState } from "./types";

const STATUS_STYLES: Record<
  ToolCallState["status"],
  { border: string; bg: string; text: string }
> = {
  running: { border: "border-warning/20", bg: "bg-warning/5", text: "text-warning" },
  done: { border: "border-success/20", bg: "bg-success/5", text: "text-success" },
  error: { border: "border-destructive/20", bg: "bg-destructive/5", text: "text-destructive" },
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
  const style = STATUS_STYLES[toolCall.status];
  const hasBody = !!(toolCall.argsPreview || toolCall.result || toolCall.error || toolCall.inlineDiff);

  return (
    <div className={`mt-2 border ${style.border} ${style.bg}`}>
      <ListItem
        onClick={() => hasBody && setOpen(!open)}
        aria-label={`${open ? t.common.collapse : t.common.expand} tool call ${toolCall.name}`}
        aria-expanded={open}
        className={`px-3 py-2 text-xs ${style.text} hover:bg-current/10`}
      >
        <span className={style.text}>
          <StatusIcon status={toolCall.status} />
        </span>
        {hasBody &&
          (open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          ))}
        <span className="font-mono-ui font-medium">{toolCall.name}</span>
        {typeof toolCall.durationS === "number" && (
          <span className="opacity-60">{toolCall.durationS.toFixed(1)}s</span>
        )}
        <span className="opacity-50 ml-auto">{toolCall.id}</span>
      </ListItem>

      {open && (
        <div className={`border-t ${style.border} px-3 py-2 text-xs space-y-2`}>
          {toolCall.argsPreview && (
            <pre className={`${style.text} opacity-80 overflow-x-auto whitespace-pre-wrap font-mono`}>
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
