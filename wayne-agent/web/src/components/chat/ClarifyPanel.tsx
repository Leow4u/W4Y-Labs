/**
 * ClarifyPanel — a pergunta do agente no padrão Claude/desktop (Onda 3):
 * opções com BADGE DE LETRA A/B/C… que dobram como atalho de teclado
 * (paridade com o ClarifyTool do desktop, letterFor + KeyBadge); a letra
 * seguinte é "Outro" (campo livre). Clique ou tecla respondem na hora.
 */
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { useI18n } from "@/i18n";
import type { PendingPrompt } from "@/hooks/useChatSession";
import { PromptShell } from "./PromptShell";

const letterFor = (i: number) => String.fromCharCode(65 + i); // A, B, C…

function KeyBadge({ label, active }: { label: string; active?: boolean }) {
  return (
    <kbd
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border type-micro font-semibold transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-muted/60 text-muted-foreground group-hover:border-foreground/30"
      }`}
    >
      {label}
    </kbd>
  );
}

export function ClarifyPanel({
  prompt,
  onRespond,
}: {
  prompt: Extract<PendingPrompt, { kind: "clarify" }>;
  onRespond: (requestId: string, answer: string) => void;
}) {
  const { t } = useI18n();
  const choices = prompt.choices ?? [];
  const hasChoices = choices.length > 0;
  const [typing, setTyping] = useState(!hasChoices);
  const [value, setValue] = useState("");
  const otherLetter = letterFor(choices.length);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onRespond(prompt.requestId, trimmed);
  };

  // Teclas A/B/C… respondem na hora; a letra seguinte abre "Outro".
  useEffect(() => {
    if (typing || !hasChoices) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      const idx = k.charCodeAt(0) - 65;
      if (k.length === 1 && idx >= 0 && idx < choices.length) {
        e.preventDefault();
        onRespond(prompt.requestId, choices[idx]);
      } else if (k === otherLetter) {
        e.preventDefault();
        setTyping(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [typing, hasChoices, choices, otherLetter, onRespond, prompt.requestId]);

  return (
    <PromptShell title={prompt.question} tone="neutral">
      {!typing && hasChoices && (
        <div className="flex flex-col gap-1.5">
          {choices.map((choice, i) => (
            <button
              key={choice}
              type="button"
              onClick={() => onRespond(prompt.requestId, choice)}
              className="group flex w-full items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-2.5 text-left type-body text-foreground transition-colors hover:border-foreground/25 hover:bg-muted/50"
            >
              <KeyBadge label={letterFor(i)} />
              <span className="min-w-0 flex-1">{choice}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTyping(true)}
            className="group flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-left type-body text-muted-foreground transition-colors hover:text-foreground"
          >
            <KeyBadge label={otherLetter} />
            {t.chat.clarifyOther}
          </button>
        </div>
      )}
      {typing && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={value}
            placeholder={t.chat.clarifyAnswerPlaceholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape" && hasChoices) {
                setTyping(false);
                setValue("");
              }
            }}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 type-body text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/30"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            className="shrink-0 rounded-xl bg-foreground px-4 py-2.5 type-ui font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t.chat.clarifySend}
          </button>
        </div>
      )}
    </PromptShell>
  );
}
