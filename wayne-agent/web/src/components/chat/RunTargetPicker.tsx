/**
 * RunTargetPicker — the composer's "where does this chat run" control (S1
 * mini-computer; benchmark: the ChatGPT Work Desktop selector). Local-engine
 * desktop only: a discreet monitor chip on the NEW-session composer with two
 * choices — "On this computer" (default) and "In the cloud" (the user's cloud
 * computer, same screen, same conversation UI).
 *
 * The choice belongs to the session about to be BORN and settles on the first
 * message — the same contract as the folder (cwd ships on session.create and
 * is ignored afterwards), so the locked chip mirrors the ContextPicker's
 * ctxLockedHint precedent: a label, not a control.
 *
 * Signed-out state: picking the cloud needs the shell's login cookies to mint
 * WS tickets. The popover probes once per open (probeCloudLogin) and, when the
 * user is signed out, the cloud row shows the localized "sign in" caption and
 * refuses the switch — a state, never a raw error.
 */
import { useEffect, useState } from "react";
import { Check, ChevronDown, Cloud, Monitor } from "lucide-react";

import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import { probeCloudLogin, type RunTarget } from "@/lib/cloudSession";

export function RunTargetPicker({
  value,
  locked,
  onChange,
}: {
  /** Where the session (about to be created) will run. */
  value: RunTarget;
  /** The conversation already started — the choice is settled (label mode). */
  locked?: boolean;
  onChange: (target: RunTarget) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Login probe result for THIS popover open: null = probing/unknown.
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  useMenuDismiss(open, () => setOpen(false), "run-target");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoggedIn(null);
    void probeCloudLogin().then((r) => {
      // Network/bridge trouble (null) reads as signed-out here: the row keeps
      // the sign-in caption instead of letting a doomed connect through.
      if (alive) setLoggedIn(r === true);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const pick = (target: RunTarget) => {
    if (target === "cloud" && loggedIn !== true) return; // caption explains
    onChange(target);
    setOpen(false);
  };

  const label = value === "cloud" ? t.chat.runCloudOption : t.chat.runLocalOption;
  const Icon = value === "cloud" ? Cloud : Monitor;

  return (
    <div className="relative">
      <button
        type="button"
        data-menu-trigger="run-target"
        onClick={() => !locked && setOpen((v) => !v)}
        disabled={locked}
        title={locked ? t.chat.runLockedHint : t.chat.runWhereTooltip}
        className={`flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 type-caption font-medium text-foreground shadow-card transition-colors ${
          // Settled: reads as a label (ContextPicker precedent) — still live
          // information about WHERE this chat runs, just not a choice any more.
          locked ? "cursor-default" : "hover:border-foreground/25"
        }`}
      >
        <Icon className="h-3.5 w-3.5 text-live" />
        <span className="max-w-[10rem] truncate">{label}</span>
        {!locked && <ChevronDown className="h-3 w-3 text-muted-foreground/60" />}
      </button>

      {open && !locked && (
        <div
          data-menu-root="run-target"
          className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-2xl border border-border bg-card p-1.5 shadow-pop"
        >
          <div className="px-2.5 pb-1 pt-1.5 type-micro font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
            {t.chat.runWhereTooltip}
          </div>
          <button
            type="button"
            onClick={() => pick("local")}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
          >
            <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 type-ui font-medium text-foreground">
              {t.chat.runLocalOption}
            </span>
            {value === "local" && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />}
          </button>
          <button
            type="button"
            onClick={() => pick("cloud")}
            className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/60 ${
              loggedIn === false ? "opacity-70" : ""
            }`}
          >
            <Cloud className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block type-ui font-medium text-foreground">
                {t.chat.runCloudOption}
              </span>
              {/* Signed out (or unreachable): the row explains itself instead
                  of failing later — the screen never promises a cloud it
                  cannot dial. */}
              {loggedIn === false && (
                <span className="block type-micro text-muted-foreground">
                  {t.chat.runCloudSignIn}
                </span>
              )}
            </span>
            {value === "cloud" && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />}
          </button>
        </div>
      )}
    </div>
  );
}
