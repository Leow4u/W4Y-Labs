/**
 * WindowChrome — the frameless desktop's top bar (0.3.7, faithful to the
 * Codex Desktop reference print): left→right, [sidebar toggle] [back]
 * [forward] [File] [Edit] [View] [Help]. The bar itself is the window's drag
 * region (-webkit-app-region: drag); every control opts out (no-drag). The
 * native window controls ride Electron's titleBarOverlay on the right — the
 * `titlebar-area-*` CSS env vars keep the bar's content clear of them.
 *
 * DESKTOP ONLY: App renders this gated on `windowChromeBridge()` — the
 * preload group only exists in shells ≥0.3.7, so the plain web (and older
 * shells) keep today's layout and the bar never promises an IPC the shell
 * doesn't implement.
 *
 * Menus are in-page dropdowns (same dismiss pattern as the DS popovers —
 * useMenuDismiss). Every item maps 1:1 to a real action:
 *   File  → new window (IPC), new session (existing ?new=1 gesture), open
 *           folder (existing vault picker + project registration), close
 *           (hide-to-tray), quit (real quit, tray path).
 *   Edit  → webContents roles via IPC (undo/redo/cut/copy/paste/selectAll).
 *   View  → zoom in/out/reset + fullscreen + reload via IPC.
 *   Help  → About (shell + engine versions from w4y:app:info), check updates
 *           (same check/apply the AuthWidget chip uses), Work4You website.
 * The matching accelerators (Ctrl+Shift+N / Ctrl+N / Ctrl+O / Ctrl+W /
 * Ctrl+Q) are registered in the MAIN process (before-input-event) — the two
 * renderer-owned ones arrive through onMenuAction. Zoom/fullscreen/reload
 * accelerators come from the shell's hidden application menu (native roles).
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import {
  desktopFolderBridge,
  desktopOpenExternal,
  desktopUpdateBridge,
  shortcutModifier,
  windowChromeBridge,
} from "@/lib/desktopChrome";
import { registerFolderProject } from "@/lib/projects";
import { useTheme } from "@/themes/context";

/** -webkit-app-region needs a widened CSSProperties (not in React's types). */
type AppRegionStyle = CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" };
const NO_DRAG: AppRegionStyle = { WebkitAppRegion: "no-drag" };

const MENU_KEY = "w4y-window-chrome";

interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

interface WindowChromeProps {
  collapsed: boolean;
  onToggleSidebar: () => void;
}

type DialogState =
  | { kind: "about"; shellVersion: string | null; engineVersion: string | null }
  | { kind: "update-checking" }
  | { kind: "update-result"; message: string };

export function WindowChrome({ collapsed, onToggleSidebar }: WindowChromeProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const bridge = windowChromeBridge();
  const { theme } = useTheme();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);

  const closeMenus = useCallback(() => {
    setOpenMenu(null);
    setMenuAnchor(null);
  }, []);
  useMenuDismiss(openMenu !== null, closeMenus, MENU_KEY);

  // File → "Abrir pasta…": the EXISTING add-local-folder flow (native vault
  // picker + authorization dialog in the shell, then the folder becomes a
  // project row — same as the ContextPicker's "Adicionar pasta local").
  // "wayne:session-titled" is the sidebar's public reload trigger.
  const openFolder = useCallback(async () => {
    const folders = desktopFolderBridge();
    if (!folders) return;
    try {
      const prev = await folders.listFolders();
      const list = await folders.pickFolder();
      const added = list.find((f) => !prev.includes(f));
      if (added) {
        await registerFolderProject(added);
        window.dispatchEvent(new CustomEvent("wayne:session-titled"));
      }
    } catch {
      /* cancelled / unavailable — nothing to do */
    }
  }, []);

  const newSession = useCallback(() => {
    navigate("/chat?new=1");
  }, [navigate]);

  // Accelerators owned by the main process but resolved here (Ctrl+N new
  // session, Ctrl+O open folder) arrive as menu actions.
  useEffect(() => {
    if (!bridge) return;
    return bridge.onMenuAction((action) => {
      if (action === "new-session") newSession();
      else if (action === "open-folder") void openFolder();
    });
  }, [bridge, newSession, openFolder]);

  // The native window buttons ride Electron's titleBarOverlay, painted by the
  // OS from construction-time colors — it cannot read CSS, and the shell has
  // no way to know the active theme either (ours is a NAMED preset kept in
  // the app's storage, not an OS light/dark preference). So this bar reports
  // its own colors and the shell repaints the overlay to match, including
  // when the theme changes at runtime. Renders nothing.
  useEffect(() => {
    bridge?.setTitleBarTheme?.(theme.palette.background.hex, theme.palette.midground.hex);
  }, [bridge, theme]);

  const showAbout = useCallback(async () => {
    if (!bridge) return;
    const info = await bridge.appInfo().catch(() => null);
    setDialog({
      kind: "about",
      shellVersion: info?.shellVersion ?? null,
      engineVersion: info?.engineVersion ?? null,
    });
  }, [bridge]);

  // Help → "Verificar atualizações": the SAME check/apply pair the AuthWidget
  // update chip uses. An available update applies on the spot (the shell
  // relaunches and the boot flow installs it); otherwise a small dialog says
  // you're current (or that the check failed).
  const checkUpdates = useCallback(async () => {
    const upd = desktopUpdateBridge();
    if (!upd) {
      setDialog({ kind: "update-result", message: t.desktop.updateCheckFailed });
      return;
    }
    setDialog({ kind: "update-checking" });
    const r = await upd.check().catch(() => null);
    if (r && r.available) {
      void upd.apply();
      return;
    }
    setDialog({
      kind: "update-result",
      message: r ? t.desktop.updateUpToDate : t.desktop.updateCheckFailed,
    });
  }, [t]);

  if (!bridge) return null;

  const mod = shortcutModifier();
  const hint = (k: string) => `${mod}${k}`;

  const menus: Array<{ id: string; label: string; items: MenuItem[] }> = [
    {
      id: "file",
      label: t.desktop.menuFile,
      items: [
        {
          id: "new-window",
          label: t.desktop.fileNewWindow,
          hint: hint("Shift+N"),
          onSelect: () => void bridge.newWindow(),
        },
        {
          id: "new-session",
          label: t.desktop.fileNewSession,
          hint: hint("N"),
          onSelect: newSession,
        },
        {
          id: "open-folder",
          label: t.desktop.fileOpenFolder,
          hint: hint("O"),
          disabled: !desktopFolderBridge(),
          onSelect: () => void openFolder(),
        },
        {
          id: "close",
          label: t.desktop.fileClose,
          hint: hint("W"),
          separatorBefore: true,
          onSelect: () => void bridge.closeWindow(),
        },
        {
          id: "quit",
          label: t.desktop.fileQuit,
          hint: hint("Q"),
          onSelect: () => void bridge.quit(),
        },
      ],
    },
    {
      id: "edit",
      label: t.desktop.menuEdit,
      items: [
        { id: "undo", label: t.desktop.editUndo, hint: hint("Z"), onSelect: () => void bridge.editRole("undo") },
        { id: "redo", label: t.desktop.editRedo, hint: hint("Y"), onSelect: () => void bridge.editRole("redo") },
        { id: "cut", label: t.desktop.editCut, hint: hint("X"), separatorBefore: true, onSelect: () => void bridge.editRole("cut") },
        { id: "copy", label: t.desktop.editCopy, hint: hint("C"), onSelect: () => void bridge.editRole("copy") },
        { id: "paste", label: t.desktop.editPaste, hint: hint("V"), onSelect: () => void bridge.editRole("paste") },
        {
          id: "select-all",
          label: t.desktop.editSelectAll,
          hint: hint("A"),
          separatorBefore: true,
          onSelect: () => void bridge.editRole("selectAll"),
        },
      ],
    },
    {
      id: "view",
      label: t.desktop.menuView,
      items: [
        { id: "zoom-in", label: t.desktop.viewZoomIn, hint: hint("+"), onSelect: () => void bridge.zoom("in") },
        { id: "zoom-out", label: t.desktop.viewZoomOut, hint: hint("-"), onSelect: () => void bridge.zoom("out") },
        { id: "zoom-reset", label: t.desktop.viewZoomReset, hint: hint("0"), onSelect: () => void bridge.zoom("reset") },
        {
          id: "fullscreen",
          label: t.desktop.viewFullscreen,
          hint: "F11",
          separatorBefore: true,
          onSelect: () => void bridge.toggleFullscreen(),
        },
        { id: "reload", label: t.desktop.viewReload, hint: hint("R"), onSelect: () => void bridge.reload() },
      ],
    },
    {
      id: "help",
      label: t.desktop.menuHelp,
      items: [
        { id: "about", label: t.desktop.helpAbout, onSelect: () => void showAbout() },
        { id: "updates", label: t.desktop.helpCheckUpdates, onSelect: () => void checkUpdates() },
        {
          id: "site",
          label: t.desktop.helpSite,
          separatorBefore: true,
          onSelect: () => desktopOpenExternal("https://work4you.ai"),
        },
      ],
    },
  ];

  const toggleMenu = (id: string, el: HTMLElement) => {
    if (openMenu === id) {
      closeMenus();
    } else {
      setOpenMenu(id);
      setMenuAnchor(el.getBoundingClientRect());
    }
  };
  // Menubar behavior: with a menu open, sliding to a sibling opens it.
  const hoverMenu = (id: string, el: HTMLElement) => {
    if (openMenu !== null && openMenu !== id) {
      setOpenMenu(id);
      setMenuAnchor(el.getBoundingClientRect());
    }
  };

  const iconBtn =
    "grid h-6 w-6 shrink-0 place-items-center rounded text-text-secondary transition-colors " +
    "hover:bg-current/10 hover:text-midground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground";
  const active = menus.find((m) => m.id === openMenu) ?? null;

  return (
    <div
      ref={barRef}
      className={cn(
        "relative z-40 flex h-9 shrink-0 items-center gap-0.5 px-1.5",
        "border-b border-current/20 bg-background-base select-none",
      )}
      style={{
        WebkitAppRegion: "drag",
        // Keep content clear of the native window-controls overlay (right on
        // Windows; the env vars resolve to the full width elsewhere).
        paddingRight:
          "max(0.375rem, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)))",
        paddingLeft: "max(0.375rem, env(titlebar-area-x, 0px))",
      } as AppRegionStyle}
    >
      <button
        type="button"
        style={NO_DRAG}
        onClick={onToggleSidebar}
        aria-label={collapsed ? t.common.expand : t.common.collapse}
        className={iconBtn}
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>

      <button
        type="button"
        style={NO_DRAG}
        onClick={() => navigate(-1)}
        aria-label={t.desktop.back}
        className={iconBtn}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        style={NO_DRAG}
        onClick={() => navigate(1)}
        aria-label={t.desktop.forward}
        className={iconBtn}
      >
        <ArrowRight className="h-4 w-4" />
      </button>

      <div className="ml-1 flex items-center" role="menubar">
        {menus.map((menu) => (
          <button
            key={menu.id}
            type="button"
            role="menuitem"
            style={NO_DRAG}
            data-menu-trigger={MENU_KEY}
            aria-haspopup="menu"
            aria-expanded={openMenu === menu.id}
            onClick={(e) => toggleMenu(menu.id, e.currentTarget)}
            onMouseEnter={(e) => hoverMenu(menu.id, e.currentTarget)}
            className={cn(
              "rounded px-2 py-1 font-sans text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground",
              openMenu === menu.id
                ? "bg-current/10 text-midground"
                : "text-text-secondary hover:bg-current/5 hover:text-midground",
            )}
          >
            {menu.label}
          </button>
        ))}
      </div>

      {active && menuAnchor &&
        createPortal(
          <div
            role="menu"
            data-menu-root={MENU_KEY}
            className={cn(
              "fixed z-[100] min-w-[240px] py-1",
              "border border-current/20 bg-background-base/95 shadow-pop",
            )}
            style={{ top: menuAnchor.bottom + 4, left: menuAnchor.left }}
          >
            {active.items.map((item) => (
              <div key={item.id} role="none">
                {item.separatorBefore && (
                  <div role="separator" className="my-1 border-t border-current/10" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={cn(
                    "flex w-full items-center justify-between gap-8 px-3 py-1.5 text-left text-xs",
                    "transition-colors focus-visible:outline-none",
                    item.disabled
                      ? "cursor-default text-text-disabled"
                      : "text-foreground/90 hover:bg-current/10 focus-visible:bg-current/10",
                  )}
                  onClick={() => {
                    closeMenus();
                    item.onSelect();
                  }}
                >
                  <span className="truncate">{item.label}</span>
                  {item.hint && (
                    <span className="shrink-0 font-mono text-[0.625rem] text-text-tertiary">
                      {item.hint}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}

      {dialog &&
        createPortal(
          <ChromeDialog dialog={dialog} onClose={() => setDialog(null)} />,
          document.body,
        )}
    </div>
  );
}

/** Small modal for About / update-check results (DS popover styling). */
function ChromeDialog({
  dialog,
  onClose,
}: {
  dialog: DialogState;
  onClose: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-black/50"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-[min(360px,calc(100vw-32px))] border border-current/20 bg-background-base p-5 shadow-pop"
      >
        {dialog.kind === "about" && (
          <>
            <div className="font-sans text-sm font-semibold text-foreground">
              {t.desktop.aboutTitle}
            </div>
            <dl className="mt-3 flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{t.desktop.aboutAppVersion}</dt>
                <dd className="font-mono text-foreground/90">
                  {dialog.shellVersion || "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{t.desktop.aboutEngineVersion}</dt>
                <dd className="font-mono text-foreground/90">
                  {dialog.engineVersion || "—"}
                </dd>
              </div>
            </dl>
          </>
        )}
        {dialog.kind === "update-checking" && (
          <div className="text-sm text-foreground/90">{t.desktop.updateChecking}</div>
        )}
        {dialog.kind === "update-result" && (
          <div className="text-sm text-foreground/90">{dialog.message}</div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "rounded border border-current/20 px-3 py-1 text-xs text-text-secondary",
              "transition-colors hover:text-midground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground",
            )}
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}
