/**
 * ApprovalPanel — permission request in the Claude Code format (Onda 3):
 * the description, the command ALWAYS visible in a mono block, and the options
 * as a LIST with numeric shortcuts:
 *
 *   [1] Sim, executar                (Enter / Ctrl+Enter)
 *   [2] Sim, permitir nesta sessão
 *   [3] Sempre permitir              (2 taps — writes permanently)
 *   [Esc] Não
 *
 * Global keyboard while the panel is mounted (the composer is disabled during
 * blocking prompts). "Sempre permitir" requires double confirmation because it
 * persists in the agent's config.
 */
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { useI18n } from "@/i18n";
import type { ApprovalChoice, PendingPrompt } from "@/hooks/useChatSession";

function Key({ label }: { label: string }) {
  return (
    <kbd className="grid h-5 min-w-5 shrink-0 place-items-center rounded-md border border-border bg-muted/60 px-1 type-micro font-semibold text-muted-foreground">
      {label}
    </kbd>
  );
}

function OptionRow({
  keyLabel,
  label,
  hint,
  danger,
  onPick,
}: {
  keyLabel: string;
  label: string;
  hint?: string;
  danger?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`group flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left type-body transition-colors ${
        danger
          ? "border-border text-muted-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
          : "border-border bg-background text-foreground hover:border-foreground/25 hover:bg-muted/50"
      }`}
    >
      <Key label={keyLabel} />
      <span className="min-w-0 flex-1">{label}</span>
      {hint && (
        <span className="shrink-0 type-micro text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
          {hint}
        </span>
      )}
    </button>
  );
}

export function ApprovalPanel({
  prompt,
  onRespond,
}: {
  prompt: Extract<PendingPrompt, { kind: "approval" }>;
  onRespond: (choice: ApprovalChoice) => void;
}) {
  const { t } = useI18n();
  // "Sempre permitir" writes to the config — requires the 2nd tap.
  const [armAlways, setArmAlways] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      )
        return;
      if (e.key === "1" || e.key === "Enter") {
        e.preventDefault();
        onRespond("once");
      } else if (e.key === "2") {
        e.preventDefault();
        onRespond("session");
      } else if (e.key === "3" && prompt.allowPermanent) {
        e.preventDefault();
        setArmAlways((armed) => {
          if (armed) onRespond("always");
          return true;
        });
      } else if (e.key === "Escape") {
        e.preventDefault();
        onRespond("deny");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRespond, prompt.allowPermanent]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
        <span className="type-ui font-semibold text-foreground">{t.chat.approvalTitle}</span>
      </div>
      {prompt.description && (
        <p className="mb-2 type-body text-foreground">{prompt.description}</p>
      )}
      <pre className="mb-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono type-caption text-foreground/90">
        {prompt.command}
      </pre>
      <div className="flex flex-col gap-1.5">
        <OptionRow
          keyLabel="1"
          label={t.chat.approvalAllowOnce}
          hint="Enter"
          onPick={() => onRespond("once")}
        />
        <OptionRow
          keyLabel="2"
          label={t.chat.approvalAllowSession}
          onPick={() => onRespond("session")}
        />
        {prompt.allowPermanent && (
          <OptionRow
            keyLabel="3"
            label={armAlways ? t.chat.approvalConfirmAlways : t.chat.approvalAllowAlways}
            onPick={() => {
              if (armAlways) onRespond("always");
              else setArmAlways(true);
            }}
          />
        )}
        <OptionRow
          keyLabel="Esc"
          label={t.chat.approvalDeny}
          danger
          onPick={() => onRespond("deny")}
        />
      </div>
    </div>
  );
}
