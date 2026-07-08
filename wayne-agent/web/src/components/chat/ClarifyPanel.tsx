import { useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Input } from "@nous-research/ui/ui/components/input";

import { useI18n } from "@/i18n";
import type { PendingPrompt } from "@/hooks/useChatSession";
import { PromptShell } from "./PromptShell";

export function ClarifyPanel({
  prompt,
  onRespond,
}: {
  prompt: Extract<PendingPrompt, { kind: "clarify" }>;
  onRespond: (requestId: string, answer: string) => void;
}) {
  const { t } = useI18n();
  const hasChoices = !!prompt.choices && prompt.choices.length > 0;
  const [typing, setTyping] = useState(!hasChoices);
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onRespond(prompt.requestId, trimmed);
  };

  return (
    <PromptShell title={prompt.question}>
      {!typing && prompt.choices && (
        <div className="flex flex-col gap-1.5">
          {prompt.choices.map((choice) => (
            <Button
              key={choice}
              size="sm"
              outlined
              className="justify-start text-left normal-case tracking-normal"
              onClick={() => onRespond(prompt.requestId, choice)}
            >
              {choice}
            </Button>
          ))}
          <Button
            size="sm"
            ghost
            className="justify-start text-left normal-case tracking-normal"
            onClick={() => setTyping(true)}
          >
            {t.chat.clarifyOther}
          </Button>
        </div>
      )}
      {typing && (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={value}
            placeholder={t.chat.clarifyAnswerPlaceholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <Button size="sm" outlined onClick={submit}>
            {t.chat.clarifySend}
          </Button>
        </div>
      )}
    </PromptShell>
  );
}
