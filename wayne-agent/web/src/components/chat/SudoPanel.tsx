import { useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Input } from "@nous-research/ui/ui/components/input";

import { useI18n } from "@/i18n";
import type { PendingPrompt } from "@/hooks/useChatSession";
import { PromptShell } from "./PromptShell";

export function SudoPanel({
  prompt,
  onRespond,
}: {
  prompt: Extract<PendingPrompt, { kind: "sudo" }>;
  onRespond: (requestId: string, password: string) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");

  const submit = () => onRespond(prompt.requestId, value);
  const cancel = () => onRespond(prompt.requestId, "");

  return (
    <PromptShell title={`🔐 ${t.chat.sudoTitle}`}>
      <div className="flex gap-2">
        <Input
          type="password"
          autoFocus
          value={value}
          placeholder={t.chat.sudoPlaceholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") cancel();
          }}
        />
        <Button size="sm" outlined onClick={submit}>
          {t.chat.promptSubmit}
        </Button>
        <Button size="sm" ghost onClick={cancel}>
          {t.chat.promptCancel}
        </Button>
      </div>
    </PromptShell>
  );
}
