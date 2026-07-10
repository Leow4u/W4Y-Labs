import type { ReactNode } from "react";
import { ShieldAlert, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react";

/** Shared card the blocking-prompt panels sit in — sober bordered card.
 *  - `warning`/`error` = genuine cautions (run command / password): tinted title.
 *  - `neutral` = the agent is just ASKING (clarify): calm, friendly, no alarm. */
export function PromptShell({
  title,
  tone = "warning",
  children,
}: {
  title: string;
  tone?: "warning" | "error" | "neutral";
  children: ReactNode;
}) {
  const TONES: Record<typeof tone, { color: string; Icon: LucideIcon }> = {
    warning: { color: "text-warning", Icon: TriangleAlert },
    error: { color: "text-destructive", Icon: ShieldAlert },
    neutral: { color: "text-foreground", Icon: Sparkles },
  };
  const { color, Icon } = TONES[tone];

  return (
    <div className="chat-msg-in space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className={`flex items-start gap-2 ${color}`}>
        <Icon
          className={`mt-[3px] h-4 w-4 shrink-0 ${tone === "neutral" ? "opacity-50" : ""}`}
        />
        <span className="text-[15px] font-medium leading-snug">{title}</span>
      </div>
      {children}
    </div>
  );
}
