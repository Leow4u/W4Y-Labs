/**
 * ModePicker — the composer's permissions MODE chip (benchmark Claude Code,
 * decision 09/07: only what is NATIVE):
 *
 *   Manual (1)              → approvals.mode = "manual"   (global config)
 *   Auto (2)                → approvals.mode = "smart"    (global config)
 *   Ignore permissions (3)  → PER-SESSION yolo (RPC config.set key=yolo
 *                             scope=session — the TUI's Shift+Tab; never
 *                             touches global/cron). Visible to the end
 *                             customer (decision: "pessoal quer trabalhar sem
 *                             interrupções"), with a 2-tap confirmation.
 *
 * State read from: liveInfo.yolo (session.info, EFFECTIVE) + approvals.mode
 * (GET /api/config). Claude's "Aceitar edições"/"Plano" were left OUT of v1
 * (no native equivalent — we don't invent backend).
 */
import { useEffect, useState } from "react";
import { Check, ChevronDown, ShieldCheck, Zap } from "lucide-react";

import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";

export type ApprovalsMode = "manual" | "smart";

export function ModePicker({
  approvalsMode,
  yoloLive,
  onSetApprovalsMode,
  onSetSessionYolo,
}: {
  /** Current global approvals.mode (manual|smart). */
  approvalsMode: ApprovalsMode;
  /** The session's EFFECTIVE bypass (liveInfo.yolo from session.info). */
  yoloLive: boolean;
  onSetApprovalsMode: (m: ApprovalsMode) => void;
  onSetSessionYolo: (on: boolean) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [armedYolo, setArmedYolo] = useState(false);
  useMenuDismiss(open, () => {
    setOpen(false);
    setArmedYolo(false);
  }, "mode");
  useEffect(() => {
    if (!armedYolo) return;
    const timer = setTimeout(() => setArmedYolo(false), 5000);
    return () => clearTimeout(timer);
  }, [armedYolo]);

  const current: "manual" | "smart" | "yolo" = yoloLive ? "yolo" : approvalsMode;
  const label =
    current === "yolo" ? t.chat.modeYolo : current === "smart" ? t.chat.modeAuto : t.chat.modeManual;

  const pick = (m: "manual" | "smart" | "yolo") => {
    if (m === "yolo") {
      if (!armedYolo) {
        setArmedYolo(true);
        return;
      }
      setArmedYolo(false);
      onSetSessionYolo(true);
    } else {
      // Leave the session's yolo when picking a mode that asks.
      if (yoloLive) onSetSessionYolo(false);
      onSetApprovalsMode(m);
    }
    setOpen(false);
  };

  // 1/2/3 shortcuts with the popover open (Claude pattern).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1") pick("manual");
      else if (e.key === "2") pick("smart");
      else if (e.key === "3") pick("yolo");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, armedYolo, yoloLive, approvalsMode]);

  const items: Array<{
    key: "manual" | "smart" | "yolo";
    label: string;
    hint: string;
    shortcut: string;
  }> = [
    { key: "manual", label: t.chat.modeManual, hint: t.chat.modeManualHint, shortcut: "1" },
    { key: "smart", label: t.chat.modeAuto, hint: t.chat.modeAutoHint, shortcut: "2" },
    { key: "yolo", label: t.chat.modeYolo, hint: t.chat.modeYoloHint, shortcut: "3" },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        data-menu-trigger="mode"
        onClick={() => setOpen((v) => !v)}
        title={t.chat.modeTitle}
        className={`flex items-center gap-1 rounded-lg px-2 py-1 type-caption font-medium transition-colors ${
          current === "yolo"
            ? "bg-warning/15 text-warning hover:bg-warning/25"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {current === "yolo" ? <Zap className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
        <span className="max-w-[10rem] truncate">{label}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div
          data-menu-root="mode"
          className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-2xl border border-border bg-card p-1.5 shadow-pop"
        >
          <div className="px-2.5 pb-1 pt-1.5 type-micro font-medium uppercase tracking-[0.06em] text-text-tertiary">
            {t.chat.modeTitle}
          </div>
          {items.map((it) => {
            const active = current === it.key;
            const armed = it.key === "yolo" && armedYolo;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => pick(it.key)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  armed
                    ? "bg-warning/15"
                    : active
                      ? "bg-muted"
                      : "hover:bg-muted/60"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block type-ui font-medium ${
                      it.key === "yolo" ? "text-warning" : "text-foreground"
                    }`}
                  >
                    {armed ? t.chat.gitConfirm : it.label}
                  </span>
                  <span className="block type-micro text-muted-foreground">{it.hint}</span>
                </span>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />}
                <kbd className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 type-micro font-semibold text-muted-foreground">
                  {it.shortcut}
                </kbd>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
