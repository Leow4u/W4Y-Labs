/**
 * AuthWidget — user chip at the sidebar footer (Work4You UX).
 *
 * Shows the user's initials + display name and, on click, opens a menu
 * (upwards, via portal — not clipped by the sidebar) with:
 *   - "Configurações"   → opens the Config screen as an overlay (onOpenSettings)
 *   - "Idioma"          → item with a side submenu on hover (Claude style);
 *                         reuses the i18n primitives (useI18n + LOCALE_META)
 *   - "Sair"            → POST /auth/logout + navigation to /login
 *
 * The theme moved out of here and into Config → Appearance.
 *
 * Reuses /api/auth/me (Phase 7 of the OAuth dashboard). On loopback/--insecure
 * /api/auth/me answers 401/403 and the widget renders nothing. The tenant's
 * "plan" does NOT show up here yet (it lives in the platform, not in the Wayne
 * instance — that is Onda 2 of this reorganization).
 *
 * LOCAL-ENGINE mode (desktop 0.3.x pivot): the local gateway authenticates via
 * the injected session token — there is no cloud identity and /api/auth/me
 * 401s by design, which used to hide the whole footer. S2 slice 1: the SHELL
 * holds the user's real login cookies, so the chip asks the CLOUD's
 * /api/auth/me through the bridge (lib/cloudSession) and renders the same
 * identity the web shows — name/initials/e-mail. Fail-open: no bridge /
 * signed out / timeout (5s) keeps the neutral "Account" label (no fetched
 * identity, no invented name). Settings, Language and "Upgrade plan" (child
 * window to work4you.ai) stay either way. "Log out" is a CLOUD-session
 * action and remains omitted locally.
 *
 * UPDATE PILL (0.3.4, ChatGPT Desktop pattern): local-engine only. The shell's
 * `work4youDesktop.update.check()` (fail-open null) is probed on mount and
 * every 30 min.
 *
 * 0.3.9 changed what "available" MEANS. It used to fire the moment the remote
 * manifest differed — so clicking walked into a blocking install behind a black
 * screen. Now the engine downloads in the background while the app is open, and
 * the pill only appears once the bytes are on disk: clicking restarts into a
 * version that is already there. `kind` carries the two states apart — "ready"
 * (accent, restart is instant) and "stalled" (warning, the install keeps
 * failing and the click retries it instead of restarting).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type AuthMeResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { LogOut, Settings, ChevronUp, ChevronRight, Globe, Check, Sparkles, Trophy, User } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { LOCALE_META } from "@/i18n";
import type { Locale } from "@/i18n";
import { isLocalEngine } from "@/lib/projects";
import { cloudGetJson } from "@/lib/cloudSession";
import { desktopUpdateBridge } from "@/lib/desktopChrome";
import {
  emptyChip,
  nextChipState,
  recoverFromStalePlan,
  type ChipState,
  type UpdateApplyResult,
} from "@/lib/update-surface";

interface AuthWidgetProps {
  className?: string;
  /** Opens the Config screen as an overlay (mounted in App). */
  onOpenSettings?: () => void;
}

// The update bridge comes from lib/desktopChrome — this file used to declare
// its OWN copy of the interface and its own accessor. That duplicate is what
// let the bridge grow `token` and `onEvent` in lib/ while this component still
// compiled against the older shape: same failure mode as the channel state
// map, one contract living in two places. Behaviourally identical (preload
// always sets isDesktop: true, so the shared accessor's extra gate never
// changes the answer).

function truncateUserId(id: string): string {
  return id.length <= 14 ? id : `${id.slice(0, 14)}…`;
}

/** Avatar initials: first letters of the label's first two "words"
 *  (split on non-alphanumerics), uppercased. */
function initialsOf(label: string): string {
  const parts = label.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "•";
}

export function AuthWidget({ className, onOpenSettings }: AuthWidgetProps) {
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const { locale, setLocale, t } = useI18n();
  const navigate = useNavigate();
  // Stable per page load (origin + shell bridge never change mid-session).
  const localEngine = isLocalEngine();
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const langListRef = useRef<HTMLDivElement>(null);
  // Engine update pill (local-engine only): null = no update / not applicable.
  // `kind` (shell 0.3.9): "ready" = the engine is already downloaded and a
  // restart is instant; "stalled" = the background install keeps failing and
  // the click means "try again", not "restart".
  // The WHOLE chip state, not just a plan. Reconstructing a previous plan as
  // `{status:"available", available:true}` (what this used to do) threw away
  // whether it was actionable at all, so an old engine `ready` token survived a
  // `preparing` check that had just concluded no staged build exists.
  const [chip, setChip] = useState<ChipState>(emptyChip);
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const update = chip.plan;

  // Update state: pushed by the shell, with polling kept only as a fallback.
  //
  // The main process has always emitted "w4y:update:event", but the bridge
  // exposed no way to listen, so this chip learned about the world from its
  // own check() on mount and a 30-minute interval. A failure could therefore
  // stay invisible for half an hour. Now an event repaints it at once, and
  // the interval only covers shells too old to have onEvent.
  useEffect(() => {
    if (!localEngine) return;
    const bridge = desktopUpdateBridge();
    if (!bridge) return; // pre-0.3.4 shell — no update surface
    let cancelled = false;

    const probe = () => {
      bridge
        .check()
        .then((r) => {
          if (cancelled) return;
          // One rule for every status, in a pure function a test can drive.
          setChip((prev) => nextChipState(prev, r));
        })
        .catch(() => {});
    };
    probe();

    // An event tells us something moved; we re-check to get the authoritative
    // shape (including the fresh token) instead of reconstructing it here.
    const unsubscribe = bridge.onEvent?.((payload) => {
      if (cancelled) return;
      // A run that is still going should not clear the pill mid-flight.
      if (payload && payload.running === true) return;
      probe();
    });

    const id = window.setInterval(probe, unsubscribe ? 30 * 60 * 1000 : 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      unsubscribe?.();
    };
  }, [localEngine]);

  // Clique = reiniciar-e-atualizar. A trava existe só contra clique duplo na
  // janela em que a casca está se desmontando.
  //
  // Ela PRECISA ser liberada quando a promessa termina. A versão anterior a
  // marcava e nunca a soltava, apostando que o app sempre sairia logo depois —
  // e o chip "Atualização pendente" é, por definição, o caso em que NÃO sai:
  // ele só aparece depois da atualização falhar três vezes. Resultado: o
  // tooltip prometia "clique para tentar de novo", o primeiro clique matava o
  // botão em silêncio, e o dono ficava sem caminho nenhum para atualizar.
  //
  // Se a atualização der certo, o processo morre antes do finally — a trava
  // solta só nos casos em que o app continua vivo, que são os que importam.
  const applyUpdate = useCallback(() => {
    if (applyingRef.current) return; // no concurrent click
    const bridge = desktopUpdateBridge();
    if (!bridge) return; // web, or a shell with no update surface
    const plan = chip.plan;
    if (!plan) return; // nothing actionable — the button is disabled anyway
    applyingRef.current = true;
    setApplying(true);

    const finish = () => {
      applyingRef.current = false;
      setApplying(false);
    };

    // ONE controlled recovery, never a loop: if the plan expired we re-check
    // once, re-apply only when the fresh plan is the same intention, and
    // otherwise show what changed. The old code just re-checked in silence and
    // left the user to guess that a second click was now required.
    const settle = (res: UpdateApplyResult | null, recovered: boolean) => {
      const outcome = res?.outcome ?? (res?.ok === false ? "failed" : "applied");
      if (outcome === "stale-plan" && !recovered) {
        void bridge
          .check()
          .then((fresh) => {
            const decision = recoverFromStalePlan(plan, fresh, chip);
            if (decision.action === "reapply") {
              setChip((prev) => nextChipState(prev, fresh));
              return bridge.apply(decision.plan.token).then((r2) => settle(r2, true));
            }
            setChip(decision.chip);
            finish();
            return undefined;
          })
          .catch(() => {
            // Could not even re-check. Keep the plan and let them try again.
            finish();
          });
        return;
      }
      if (outcome === "staged") {
        // Bytes are ready; the update lands on the next restart. Show that
        // immediately instead of leaving a stale "update available" pill.
        setChip({ plan: null, notice: "preparing", error: null });
      } else if (outcome === "applied" || outcome === "no-update") {
        setChip(emptyChip);
      } else {
        // failed / recovered / anything unrecognised: keep a real retry path.
        setChip((prev) => ({ ...prev, error: res?.error ?? "update failed" }));
      }
      finish();
    };

    void bridge
      .apply(plan.token)
      .then((res) => settle(res, false))
      .catch((e) => {
        // A rejected IPC is still an answer the user must see.
        setChip((prev) => ({ ...prev, error: String(e) }));
        finish();
      });
    // Depends on the plan: with an empty array the callback would close over
    // the FIRST plan it ever saw and keep applying that stale one.
  }, [chip]);

  // Opens the language submenu with the current language in view. Runs ONLY on
  // open (not on every render): an inline callback ref would re-run on
  // re-renders and undo the user's manual scrolling mid-gesture.
  useEffect(() => {
    if (!langOpen) return;
    langListRef.current
      ?.querySelector('[aria-checked="true"]')
      ?.scrollIntoView({ block: "center" });
  }, [langOpen]);

  // Local-engine identity (S2): the same login the cloud shows, read through
  // the shell bridge (cookies never reach this renderer). Any failure — no
  // bridge (≤0.3.2 shell), signed out, 5s deadline — resolves null and the
  // neutral chip stands; the footer never promises a cloud it can't reach.
  useEffect(() => {
    if (!localEngine) return;
    let cancelled = false;
    void cloudGetJson<AuthMeResponse>("/api/auth/me", 5000).then((data) => {
      if (!cancelled && data && typeof data.user_id === "string" && data.user_id) {
        setMe(data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [localEngine]);

  useEffect(() => {
    // Local-engine gateway has no cloud identity: /api/auth/me 401s by design,
    // which would flip `hidden` and remove the footer. Skip the probe entirely
    // and render the neutral chip instead (the bridge effect above may still
    // fill the REAL identity in).
    if (localEngine) return;
    let cancelled = false;
    api
      .getAuthMe()
      .then((data) => { if (!cancelled) setMe(data); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("401:") || msg.startsWith("403:")) { setHidden(true); return; }
        setError("auth status unavailable");
      });
    return () => { cancelled = true; };
  }, [localEngine]);

  const close = useCallback(() => {
    setOpen(false);
    setLangOpen(false);
  }, []);

  // Closes on Escape and on outside click (same pattern as ThemeSwitcher).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (chipRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  // Cloud-mode gates only: local-engine never probes, so it renders straight
  // through with the neutral label below.
  if (!localEngine) {
    if (hidden) return null;

    if (error) {
      return (
        <div className={cn("px-5 py-2 text-xs tracking-[0.05em] text-text-tertiary", className)}>
          {error}
        </div>
      );
    }

    if (!me) {
      return (
        <div className={cn("h-11 px-5 py-2 text-xs text-text-tertiary", className)} aria-busy="true">
          …
        </div>
      );
    }
  }

  // Local-engine without a confirmed cloud identity: neutral "Account" label
  // (existing i18n key, ×16) + generic icon instead of fabricated initials.
  // When the bridge confirmed the login, `me` is set and the chip renders the
  // SAME identity the cloud web shows.
  const label = me
    ? me.display_name || me.email || truncateUserId(me.user_id)
    : t.configUser.account;
  const initials = initialsOf(label);

  const menuRow =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground/90 " +
    "transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:bg-current/10";

  return (
    <div className={cn("relative border-t border-current/10", className)}>
      <button
        ref={chipRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-2.5 text-left",
          "transition-colors hover:bg-current/5",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40 focus-visible:ring-inset",
        )}
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-midground/15 font-mono text-xs font-semibold text-foreground/90"
        >
          {me ? initials : <User className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90" title={me?.user_id}>
          {label}
        </span>
        {/* Engine update pill (ChatGPT Desktop pattern: accent pill next to the
            account name). Nested interactive: a span[role=button] with
            stopPropagation so the chip's menu toggle doesn't fire. */}
        {update && (
          <span
            role="button"
            tabIndex={0}
            title={
              update.kind === "stalled"
                ? t.configUser.updateChipStalledTooltip
                : update.version
                  ? t.configUser.updateChipTooltip.replace("{version}", update.version)
                  : t.configUser.updateChip
            }
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold leading-4",
              "transition-colors focus-visible:outline-none focus-visible:ring-1",
              // Two meanings, two looks: the engine is ready to switch to
              // (accent) vs. the update keeps failing and needs a nudge
              // (warning). Same pill, never the same promise.
              update.kind === "stalled"
                ? "bg-warning/15 text-warning ring-warning/40 hover:bg-warning/25 focus-visible:ring-warning/60"
                : "bg-live text-background hover:bg-live/85 focus-visible:ring-live/60",
            )}
            // Busy is stated, not just guarded: a concurrent click was already
            // dropped by applyingRef, but the user had no way to know why.
            aria-busy={applying || undefined}
            aria-disabled={applying || undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (applying) return;
              applyUpdate();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                if (applying) return;
                applyUpdate();
              }
            }}
          >
            {update.kind === "stalled"
              ? t.configUser.updateChipStalled
              : t.configUser.updateChip}
          </span>
        )}
        <ChevronUp className={cn("h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform", !open && "rotate-180")} />
      </button>

      {open && (() => {
        const rect = chipRef.current?.getBoundingClientRect();
        const menu = (
          <div
            ref={menuRef}
            role="menu"
            className={cn(
              "fixed z-[100] min-w-[220px]",
              "border border-current/20 bg-background-base/95",
              "shadow-pop",
            )}
            style={rect ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width } : undefined}
          >
            <button
              type="button"
              role="menuitem"
              className={menuRow}
              onClick={() => { close(); onOpenSettings?.(); }}
            >
              <Settings className="h-4 w-4 shrink-0 text-muted-foreground/80" />
              Configurações
            </button>

            {/* "Idioma" — item with a side submenu on hover (Claude style).
                The flyout is a child of the wrapper and sticks to it via padding
                (pl-1.5), no real gap: the mouse never "leaves" the wrapper on
                the way across. Click toggles too (touch screens, no hover). */}
            <div
              role="none"
              className="relative border-t border-current/10"
              onMouseEnter={() => setLangOpen(true)}
              onMouseLeave={() => setLangOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={langOpen}
                className={menuRow}
                onClick={() => setLangOpen((v) => !v)}
              >
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground/80" />
                Idioma
                <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              </button>

              {langOpen && (
                <div
                  role="none"
                  className={cn(
                    "absolute bottom-0 left-full pl-1.5",
                    // On narrow screens (sidebar nearly full-width) there is no
                    // room on the right: opens ABOVE the menu, right-aligned.
                    "max-sm:bottom-full max-sm:left-auto max-sm:right-0 max-sm:pb-1 max-sm:pl-0",
                  )}
                >
                  <div
                    ref={langListRef}
                    role="menu"
                    aria-label="Idioma"
                    className={cn(
                      "max-h-[min(24rem,70vh)] min-w-[11rem] overflow-y-auto py-1",
                      "border border-current/20 bg-background-base/95",
                      "shadow-pop",
                    )}
                  >
                    {(Object.entries(LOCALE_META) as Array<[Locale, (typeof LOCALE_META)[Locale]]>).map(
                      ([code, meta]) => (
                        <button
                          key={code}
                          type="button"
                          role="menuitemradio"
                          aria-checked={code === locale}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                            "transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:bg-current/10",
                            code === locale ? "font-semibold text-foreground" : "text-muted-foreground",
                          )}
                          onClick={() => { setLocale(code); close(); }}
                        >
                          <span className="truncate">{meta.name}</span>
                          {code === locale && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-midground" />}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* "Atualizar plano" → deep-link to the subscription page. Cloud:
                same work4you.ai origin, the LB routes /planos to Next —
                full-page navigation (leaves the agent SPA), intentional.
                Local-engine: the SPA origin is the loopback gateway, so /planos
                does not exist here — open work4you.ai/planos as a child window
                (the shell allows work4you.ai children). */}
            {localEngine ? (
              <button
                type="button"
                role="menuitem"
                className={cn(menuRow, "border-t border-current/10")}
                onClick={() => { close(); window.open("https://work4you.ai/planos"); }}
              >
                <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground/80" />
                Atualizar plano
              </button>
            ) : (
              <a
                href="/planos"
                role="menuitem"
                className={cn(menuRow, "border-t border-current/10")}
                onClick={() => close()}
              >
                <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground/80" />
                Atualizar plano
              </a>
            )}

            {/* "Conquistas" — the collectible badges screen. It left the
                sidebar (a bundled plugin tab used to plant it there, in
                English) and lives here instead: personal, occasional, next to
                the other account-level entries. */}
            <button
              type="button"
              role="menuitem"
              className={cn(menuRow, "border-t border-current/10")}
              onClick={() => { close(); navigate("/achievements"); }}
            >
              <Trophy className="h-4 w-4 shrink-0 text-muted-foreground/80" />
              {t.achievementsPage.title}
            </button>

            {/* "Sair" ends the CLOUD session (POST /auth/logout + /login). The
                local-engine gateway has neither — omitted there. */}
            {!localEngine && (
              <button
                type="button"
                role="menuitem"
                className={cn(menuRow, "border-t border-current/10 text-destructive/90 hover:text-destructive")}
                onClick={() => { close(); void api.logout(); }}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Sair
              </button>
            )}
          </div>
        );
        return createPortal(menu, document.body);
      })()}
    </div>
  );
}
