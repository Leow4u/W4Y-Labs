import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";

import { useI18n } from "@/i18n";

/**
 * Multi-line composer — Enter sends, Shift/Ctrl/Cmd+Enter inserts a newline.
 * Text only for v1 (no image attach — the backend already supports it via
 * `image.attach`, just not wired here yet).
 */
export function Composer({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (text: string) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = "auto";
    });
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-foreground/15 bg-background px-3 py-2 focus-within:border-foreground/30">
      <textarea
        ref={taRef}
        rows={1}
        value={value}
        placeholder={t.chat.composerPlaceholder}
        disabled={disabled}
        onChange={autoGrow}
        onKeyDown={handleKeyDown}
        className="max-h-[200px] flex-1 resize-none bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-text-tertiary disabled:opacity-50"
      />
      <Button
        size="icon"
        disabled={disabled || !value.trim()}
        onClick={submit}
        aria-label={t.chat.clarifySend}
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
