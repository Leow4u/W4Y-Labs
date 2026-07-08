import { Button } from "@nous-research/ui/ui/components/button";

import { useI18n } from "@/i18n";
import type { ApprovalChoice, PendingPrompt } from "@/hooks/useChatSession";
import { PromptShell } from "./PromptShell";

export function ApprovalPanel({
  prompt,
  onRespond,
}: {
  prompt: Extract<PendingPrompt, { kind: "approval" }>;
  onRespond: (choice: ApprovalChoice) => void;
}) {
  const { t } = useI18n();

  return (
    <PromptShell title={`⚠ ${t.chat.approvalTitle}`}>
      <div className="text-sm text-foreground">{prompt.description}</div>
      <pre className="text-xs font-mono bg-background/60 border border-current/10 px-2 py-1.5 overflow-x-auto whitespace-pre-wrap">
        {prompt.command}
      </pre>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" outlined onClick={() => onRespond("once")}>
          {t.chat.approvalAllowOnce}
        </Button>
        <Button size="sm" outlined onClick={() => onRespond("session")}>
          {t.chat.approvalAllowSession}
        </Button>
        {prompt.allowPermanent && (
          <Button size="sm" outlined onClick={() => onRespond("always")}>
            {t.chat.approvalAllowAlways}
          </Button>
        )}
        <Button size="sm" destructive className="ml-auto" onClick={() => onRespond("deny")}>
          {t.chat.approvalDeny}
        </Button>
      </div>
    </PromptShell>
  );
}
