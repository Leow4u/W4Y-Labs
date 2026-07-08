import type { ApprovalChoice, PendingPrompt } from "@/hooks/useChatSession";
import { ApprovalPanel } from "./ApprovalPanel";
import { ClarifyPanel } from "./ClarifyPanel";
import { SecretPanel } from "./SecretPanel";
import { SudoPanel } from "./SudoPanel";

/** Picks the right panel for whatever the agent is blocked waiting on. */
export function PendingPromptPanel({
  prompt,
  onRespondApproval,
  onRespondClarify,
  onRespondSudo,
  onRespondSecret,
}: {
  prompt: PendingPrompt;
  onRespondApproval: (choice: ApprovalChoice) => void;
  onRespondClarify: (requestId: string, answer: string) => void;
  onRespondSudo: (requestId: string, password: string) => void;
  onRespondSecret: (requestId: string, value: string) => void;
}) {
  switch (prompt.kind) {
    case "approval":
      return <ApprovalPanel prompt={prompt} onRespond={onRespondApproval} />;
    case "clarify":
      return <ClarifyPanel prompt={prompt} onRespond={onRespondClarify} />;
    case "sudo":
      return <SudoPanel prompt={prompt} onRespond={onRespondSudo} />;
    case "secret":
      return <SecretPanel prompt={prompt} onRespond={onRespondSecret} />;
  }
}
