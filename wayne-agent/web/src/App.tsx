import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronDown,
  Clock,
  Code,
  Cpu,
  Bot,
  Database,
  Download,
  Eye,
  FolderOpen,
  FileText,
  Globe,
  Heart,
  KeyRound,
  Menu,
  MessageSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Puzzle,
  Radio,
  RotateCw,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Terminal,
  Users,
  Webhook,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import { SelectionSwitcher } from "@nous-research/ui/ui/components/selection-switcher";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { ConfirmDialog } from "@nous-research/ui/ui/components/confirm-dialog";
import { cn } from "@/lib/utils";
import { SidebarTasks, NewTaskIcon } from "@/components/SidebarTasks";
import { SidebarStatusStrip, gatewayLine } from "@/components/SidebarStatusStrip";
import { WindowChrome } from "@/components/WindowChrome";
import { ProductSwitcher } from "@/components/ProductSwitcher";
import { isDesktopApp, windowChromeBridge } from "@/lib/desktopChrome";
import { useBelowBreakpoint } from "@nous-research/ui/hooks/use-below-breakpoint";
import { useSidebarStatus } from "@/hooks/useSidebarStatus";
import { AuthWidget } from "@/components/AuthWidget";
import { PageHeaderProvider } from "@/contexts/PageHeaderProvider";
import { ProfileProvider } from "@/contexts/ProfileProvider";
import { useProfileScope } from "@/contexts/useProfileScope";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";
import { ProfileScopeBanner } from "@/components/ProfileScopeBanner";
import { useSystemActions } from "@/contexts/useSystemActions";
import type { SystemAction } from "@/contexts/system-actions-context";
import ConfigPage from "@/pages/ConfigPage";
import DocsPage from "@/pages/DocsPage";
import EnvPage from "@/pages/EnvPage";
import FilesPage from "@/pages/FilesPage";
import SessionsPage from "@/pages/SessionsPage";
import LogsPage from "@/pages/LogsPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import ModelsPage from "@/pages/ModelsPage";
import CronPage from "@/pages/CronPage";
import ProfilesPage from "@/pages/ProfilesPage";
import ProfileBuilderPage from "@/pages/ProfileBuilderPage";
import AgentQuickstartPage from "@/pages/AgentQuickstartPage";
import AgentWorkflowPage from "@/pages/AgentWorkflowPage";
import AgentTeamPage from "@/pages/AgentTeamPage";
import OperationsPage from "@/pages/OperationsPage";
import GovernancePage from "@/pages/GovernancePage";
import AgentsPage from "@/pages/AgentsPage";
import AchievementsPage from "@/pages/AchievementsPage";
import JourneyPage from "@/pages/JourneyPage";
import SkillsPage from "@/pages/SkillsPage";
import PluginsPage from "@/pages/PluginsPage";
import PluginsHub from "@/pages/PluginsHub";
import McpPage from "@/pages/McpPage";
import ConnectorsPage from "@/pages/ConnectorsPage";
import PairingPage from "@/pages/PairingPage";
import ChannelsPage from "@/pages/ChannelsPage";
import WebhooksPage from "@/pages/WebhooksPage";
import SystemPage from "@/pages/SystemPage";
import ChatPage from "@/pages/ChatPage";
import ConfigUser from "@/components/ConfigUser";
import { SettingsOverlay, isFullConfigRequested } from "@/components/SettingsOverlay";
import { useI18n } from "@/i18n";

// /config route (deep-link): the user's lean screen by default; the full
// technical one lives behind the internal `?full=1` hatch (us/support).
function ConfigRoute() {
  return isFullConfigRequested() ? <ConfigPage /> : <ConfigUser />;
}

// /profiles route (product curation): the end user sees the Agents gallery;
// the profiles admin (5-step wizard, raw model, skills, MCP, gateway) lives
// behind the internal `?full=1` hatch — same pattern as Config.
function ProfilesRoute() {
  return isFullConfigRequested() ? <ProfilesPage /> : <AgentsPage />;
}

// /plugins route (product curation): the end user sees the unified HUB
// (Connectors + Skills, Manus style — PluginsHub); the technical plugins
// console (install repo, providers, remove) lives behind the `?full=1` hatch
// (PluginsPage). Same split as Config/Agents/Connectors — it solves the name
// collision with no new path (the user on /plugins sees the hub,
// /plugins?full=1 the admin).
function PluginsRoute() {
  return isFullConfigRequested() ? <PluginsPage /> : <PluginsHub />;
}
import type { Translations } from "@/i18n/types";
import { PluginPage, PluginSlot, usePlugins } from "@/plugins";
import type { PluginManifest } from "@/plugins";
import { useTheme } from "@/themes";
import { isDashboardEmbeddedChatEnabled } from "@/lib/dashboard-flags";
import { api } from "@/lib/api";
import type { StatusResponse, UpdateCheckResponse } from "@/lib/api";

function RootRedirect() {
  // Product entry point = the chat (Nova tarefa). Sessions became technical (?full=1).
  return <Navigate to="/chat" replace />;
}

function UnknownRouteFallback({ pluginsLoading }: { pluginsLoading: boolean }) {
  if (pluginsLoading) {
    // Render nothing during the plugin-load window — a spinner here would just flash.
    return null;
  }
  return <Navigate to="/chat" replace />;
}

// "Nova tarefa" (Manus-style curation): the chat's nav item IS the gesture of
// starting a new task — ALWAYS. The link carries the ?new=1 trigger: the
// NativeChatPage consumes it (clears resume/project and forces a fresh
// session), so clicking here opens a new chat even when coming back from
// another page or already inside a conversation. History lives in the sidebar's
// Tasks section.
const CHAT_NAV_ITEM: NavItem = {
  path: "/chat",
  to: "/chat?new=1",
  labelKey: "chat",
  label: "New task",
  icon: NewTaskIcon,
};

/**
 * Built-in routes except /chat.  Chat is rendered persistently (outside
 * <Routes>) when embedded — see the persistent chat host block rendered
 * inline near the bottom of this file — so the PTY child, WebSocket,
 * and xterm instance survive when the user visits another tab and comes
 * back.  A `display:none` toggle hides the terminal without unmounting.
 * Routing still owns the URL so /chat deep-links, browser back/forward,
 * and nav highlight keep working.
 */
const BUILTIN_ROUTES_CORE: Record<string, ComponentType> = {
  "/": RootRedirect,
  "/sessions": SessionsPage,
  "/files": FilesPage,
  "/analytics": AnalyticsPage,
  "/models": ModelsPage,
  "/logs": LogsPage,
  "/cron": CronPage,
  "/skills": SkillsPage,
  "/plugins": PluginsRoute,
  "/mcp": ConnectorsRoute,
  "/pairing": PairingPage,
  "/channels": ChannelsPage,
  "/webhooks": WebhooksPage,
  "/system": SystemPage,
  "/profiles": ProfilesRoute,
  "/journey": JourneyPage,
  "/profiles/new": ProfileBuilderPage,
  "/profiles/quickstart": AgentQuickstartPage,
  "/profiles/agent": AgentWorkflowPage,
  "/profiles/team": AgentTeamPage,
  "/profiles/operations": OperationsPage,
  "/profiles/governance": GovernancePage,
  "/config": ConfigRoute,
  "/env": EnvPage,
  "/docs": DocsPage,
  // Native "Conquistas" screen. The wayne-achievements plugin registers the
  // SAME path as an addon tab; `buildRoutes` skips any addon whose path already
  // exists in the built-in map, so this native page wins and the plugin's
  // English bundle never paints. The plugin's REST API (/api/plugins/
  // wayne-achievements/achievements) stays the data source.
  "/achievements": AchievementsPage,
};

// Route placeholder for /chat.  The persistent ChatPage host (rendered
// outside <Routes> when embedded chat is on) paints on top; this empty
// element just claims the path so the `*` catch-all redirect doesn't
// fire when the user navigates to /chat.
function ChatRouteSink() {
  return null;
}

const BUILTIN_NAV_REST: NavItem[] = [
  {
    path: "/sessions",
    labelKey: "sessions",
    label: "Sessions",
    icon: MessageSquare,
  },
  { path: "/files", labelKey: "files", label: "Files", icon: FolderOpen },
  {
    path: "/analytics",
    labelKey: "analytics",
    label: "Analytics",
    icon: BarChart3,
  },
  {
    path: "/models",
    labelKey: "models",
    label: "Models",
    icon: Cpu,
  },
  { path: "/logs", labelKey: "logs", label: "Logs", icon: FileText },
  { path: "/cron", labelKey: "cron", label: "Cron", icon: Clock },
  { path: "/skills", labelKey: "skills", label: "Skills", icon: Package },
  { path: "/plugins", labelKey: "plugins", label: "Plugins", icon: Puzzle },
  { path: "/mcp", labelKey: "connectors", label: "Connectors", icon: Plug },
  { path: "/channels", labelKey: "channels", label: "Channels", icon: Radio },
  { path: "/webhooks", label: "Webhooks", icon: Webhook },
  { path: "/pairing", label: "Pairing", icon: ShieldCheck },
  {
    path: "/profiles",
    labelKey: "profiles",
    label: "Agents",
    icon: Bot,
    // Submodules of the Agents module (Claude Console-style dropdown).
    children: [
      { path: "/profiles/quickstart", getLabel: (tt) => tt.agents.quickTab },
      { path: "/profiles", end: true, getLabel: (tt) => tt.agents.teamTab },
      { path: "/profiles/operations", getLabel: (tt) => tt.agents.opsTab },
      { path: "/profiles/governance", getLabel: (tt) => tt.agents.govTab },
    ],
  },
  // Config left the main navigation — it now opens from the user chip's menu,
  // as an overlay (the /config route still exists for deep-links).
  { path: "/env", labelKey: "keys", label: "Keys", icon: KeyRound },
  { path: "/system", label: "System", icon: Wrench },
  {
    path: "/docs",
    labelKey: "documentation",
    label: "Documentation",
    icon: BookOpen,
  },
];

// Curation (product frontend): the USER's navigation is short and focused —
// only the screens with a product heart. The full technical/admin view (every
// screen: Analytics, Models, Logs, Plugins, MCP, Webhooks, Pairing, Profiles,
// Keys, System, Docs) shows up behind the internal `?full=1` hatch — the same
// mechanism already used by Config (ConfigUser↔ConfigPage) and Skills
// (featured↔full). All routes stay mounted (admin deep-link); only the nav item
// disappears.
const USER_NAV_PATHS = new Set<string>([
  "/chat",
  // /sessions left the user nav: the "Tarefas" sidebar (SidebarTasks) is already
  // the user-facing point for conversations (same /api/sessions, curated).
  // Sessions becomes a technical/admin surface behind ?full=1 (platforms, models,
  // cron, empty ones). The route stays mounted for deep-link and admin actions.
  "/files",
  "/cron",
  // Manus-style merge: Skills (/skills) and Connectors (/mcp) LEFT the user nav
  // — they became ONE single hub, "Plugins" (/plugins → PluginsHub). The /skills
  // and /mcp routes stay mounted (deep-link + ?full=1 admin); only the nav item
  // disappears. The technical plugins console lives at /plugins?full=1 (PluginsPage).
  "/plugins",
  "/channels",
  "/profiles",
]);

// Connectors: the user sees the MARKETPLACE (Composio bridge); the technical MCP
// screen (manual servers + Nous catalog) stays behind ?full=1 — same
// Config/Skills pattern. Function declaration (hoisted) for the route map above.
function ConnectorsRoute() {
  return isFullConfigRequested() ? <McpPage /> : <ConnectorsPage />;
}

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  Activity,
  BarChart3,
  Clock,
  Cpu,
  FileText,
  FolderOpen,
  KeyRound,
  MessageSquare,
  Package,
  Settings,
  Puzzle,
  Sparkles,
  Terminal,
  Globe,
  Database,
  Shield,
  Users,
  Wrench,
  Zap,
  Heart,
  Star,
  Code,
  Eye,
};

function resolveIcon(name: string): ComponentType<{ className?: string }> {
  return ICON_MAP[name] ?? Puzzle;
}

function buildNavItems(
  builtIn: NavItem[],
  manifests: PluginManifest[],
): NavItem[] {
  const items = [...builtIn];

  for (const manifest of manifests) {
    if (manifest.tab.override) continue;
    if (manifest.tab.hidden) continue;

    const pluginItem: NavItem = {
      path: manifest.tab.path,
      label: manifest.label,
      icon: resolveIcon(manifest.icon),
    };

    const pos = manifest.tab.position ?? "end";
    if (pos === "end") {
      items.push(pluginItem);
    } else if (pos.startsWith("after:")) {
      const target = "/" + pos.slice(6);
      const idx = items.findIndex((i) => i.path === target);
      items.splice(idx >= 0 ? idx + 1 : items.length, 0, pluginItem);
    } else if (pos.startsWith("before:")) {
      const target = "/" + pos.slice(7);
      const idx = items.findIndex((i) => i.path === target);
      items.splice(idx >= 0 ? idx : items.length, 0, pluginItem);
    } else {
      items.push(pluginItem);
    }
  }

  return items;
}

/** Split merged nav into built-in sidebar entries vs plugin tabs, preserving plugin order hints. */
function partitionSidebarNav(
  builtIn: NavItem[],
  manifests: PluginManifest[],
): { coreItems: NavItem[]; pluginItems: NavItem[] } {
  const merged = buildNavItems(builtIn, manifests);
  const builtinPaths = new Set(builtIn.map((i) => i.path));
  const coreItems: NavItem[] = [];
  const pluginItems: NavItem[] = [];
  for (const item of merged) {
    if (builtinPaths.has(item.path)) coreItems.push(item);
    else pluginItems.push(item);
  }
  return { coreItems, pluginItems };
}

function buildRoutes(
  builtinRoutes: Record<string, ComponentType>,
  manifests: PluginManifest[],
): Array<{
  key: string;
  path: string;
  element: ReactNode;
}> {
  const byOverride = new Map<string, PluginManifest>();
  const addons: PluginManifest[] = [];

  for (const m of manifests) {
    if (m.tab.override) {
      byOverride.set(m.tab.override, m);
    } else {
      addons.push(m);
    }
  }

  const routes: Array<{
    key: string;
    path: string;
    element: ReactNode;
  }> = [];

  for (const [path, Component] of Object.entries(builtinRoutes)) {
    const om = byOverride.get(path);
    if (om) {
      routes.push({
        key: `override:${om.name}`,
        path,
        element: <PluginPage name={om.name} />,
      });
    } else {
      routes.push({ key: `builtin:${path}`, path, element: <Component /> });
    }
  }

  for (const m of addons) {
    if (m.tab.hidden) continue;
    if (m.tab.path === "/plugins") continue;
    if (builtinRoutes[m.tab.path]) continue;
    routes.push({
      key: `plugin:${m.name}`,
      path: m.tab.path,
      element: <PluginPage name={m.name} />,
    });
  }

  for (const m of manifests) {
    if (!m.tab.hidden) continue;
    if (m.tab.path === "/plugins") continue;
    if (builtinRoutes[m.tab.path] || m.tab.override) continue;
    routes.push({
      key: `plugin:hidden:${m.name}`,
      path: m.tab.path,
      element: <PluginPage name={m.name} />,
    });
  }

  return routes;
}

const SIDEBAR_COLLAPSED_KEY = "wayne-sidebar-collapsed";

export default function App() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { manifests, loading: pluginsLoading } = usePlugins();
  const { theme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  // Settings overlay (opened from the user chip's menu). It lives in the App so
  // the SettingsOverlay renders inside the PageHeaderProvider (ConfigPage uses
  // usePageHeader) and the trigger lives in the sidebar.
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch { /* localStorage may be unavailable in private browsing */ }
      return next;
    });
  }, []);
  const isMobile = useBelowBreakpoint(1024);
  const isDesktopCollapsed = collapsed && !isMobile;
  // Desktop shell gates (stable per page load — the preload bridge never
  // changes mid-session). `desktopApp` = any shell (product switcher);
  // `desktopChrome` = 0.3.7+ frameless shell (top bar + moved sidebar
  // toggle). The plain web in a browser has neither and keeps its layout.
  const desktopApp = isDesktopApp();
  const desktopChrome = desktopApp && windowChromeBridge() !== null;
  // The bar's sidebar toggle: drawer on narrow windows, collapse on wide.
  const chromeToggleSidebar = useCallback(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setMobileOpen(true);
    else toggleCollapsed();
  }, [toggleCollapsed]);
  const tooltipWarmRef = useRef(0);
  const sidebarStatus = useSidebarStatus();
  const isDocsRoute = pathname === "/docs" || pathname === "/docs/";
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const isChatRoute = normalizedPath === "/chat";
  const embeddedChat = isDashboardEmbeddedChatEnabled();

  // `dashboard.show_token_analytics` gates the Analytics nav item.  The
  // page itself remains reachable by URL (it renders an explanation when
  // the flag is off — see AnalyticsPage), but hiding the nav entry avoids
  // surfacing misleading token/cost numbers in the sidebar.  Default off.
  const [showTokenAnalytics, setShowTokenAnalytics] = useState(false);
  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        const dash = (cfg?.dashboard ?? {}) as {
          show_token_analytics?: unknown;
        };
        setShowTokenAnalytics(dash.show_token_analytics === true);
      })
      .catch(() => setShowTokenAnalytics(false));
  }, []);

  // A plugin can replace the built-in /chat page via `tab.override: "/chat"`
  // in its manifest.  When one does, `buildRoutes` already swaps the route
  // element for <PluginPage /> — but we also have to suppress the
  // persistent ChatPage host below, or the plugin's page and the built-in
  // terminal would paint on top of each other.  The override is niche
  // (nothing ships overriding /chat today) but it's an advertised
  // extension point, so preserve the pre-persistence contract: when a
  // plugin owns /chat, the built-in chat UI is entirely absent.
  //
  // Waiting on `pluginsLoading` is load-bearing: manifests arrive
  // asynchronously from /api/dashboard/plugins, so on initial render
  // `chatOverriddenByPlugin` is always false.  Without the loading
  // gate, the persistent host would mount, spawn a PTY, and THEN get
  // yanked out from under the user when the plugin's manifest resolves
  // — killing the session mid-paint.  Delaying host mount by the
  // plugin-load window (typically <50ms, worst case 2s safety timeout)
  // is the cheaper trade-off.
  const chatOverriddenByPlugin = useMemo(
    () => manifests.some((m) => m.tab.override === "/chat"),
    [manifests],
  );

  const builtinRoutes = useMemo(
    () => ({
      ...BUILTIN_ROUTES_CORE,
      ...(embeddedChat ? { "/chat": ChatRouteSink } : {}),
    }),
    [embeddedChat],
  );

  // The internal hatch (?full=1) reveals the full technical/admin navigation —
  // reuses the same Config/Skills gate. Without it, the sidebar shows only the
  // curated product nav (USER_NAV_PATHS).
  const internalView = isFullConfigRequested();

  const builtinNav = useMemo(() => {
    const base = embeddedChat
      ? [CHAT_NAV_ITEM, ...BUILTIN_NAV_REST]
      : BUILTIN_NAV_REST;
    const withAnalytics = showTokenAnalytics
      ? base
      : base.filter((n) => n.path !== "/analytics");
    if (internalView) return withAnalytics;
    return withAnalytics.filter((n) => USER_NAV_PATHS.has(n.path));
  }, [embeddedChat, showTokenAnalytics, internalView]);

  // Plugin tabs obey the SAME product curation as the built-in nav. Bundled
  // plugins (Kanban, Achievements) ship their own manifest tab and used to be
  // merged into the sidebar with no gate — so they sat permanently in the end
  // user's navigation, in English, under a section header also called
  // "Plugins" (colliding with the /plugins hub, a different thing entirely).
  // Feeding `partitionSidebarNav` an empty manifest list outside the internal
  // view drops both the plugin items and — since the section only renders when
  // `pluginItems.length > 0` — the duplicate "Plugins" header. Every plugin
  // route stays mounted (deep-link) and the tabs reappear under `?full=1`.
  const sidebarNav = useMemo(
    () => partitionSidebarNav(builtinNav, internalView ? manifests : []),
    [builtinNav, manifests, internalView],
  );
  const routes = useMemo(
    () => buildRoutes(builtinRoutes, manifests),
    [builtinRoutes, manifests],
  );
  const pluginTabMeta = useMemo(
    () =>
      manifests
        .filter((m) => !m.tab.hidden)
        .map((m) => ({
          path: m.tab.override ?? m.tab.path,
          label: m.label,
        })),
    [manifests],
  );

  const layoutVariant = theme.layoutVariant ?? "standard";

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileOpen(false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return (
    <ProfileProvider>
    <div
      data-layout-variant={layoutVariant}
      className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-background-base text-text-primary antialiased"
    >
      <SelectionSwitcher />

      {/* Frameless desktop (0.3.7): the web-rendered title bar. Gated on the
          shell's windowChrome bridge — never on the plain web. */}
      {desktopChrome && (
        <WindowChrome collapsed={isDesktopCollapsed} onToggleSidebar={chromeToggleSidebar} />
      )}

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
      >
        <PluginSlot name="backdrop" />
      </div>

      <header
        className={cn(
          "lg:hidden fixed left-0 right-0 z-40 min-h-14",
          desktopChrome ? "top-9" : "top-0",
          "flex items-center gap-2 px-4 py-2",
          "border-b border-current/20",
          "bg-background-base",
        )}
        style={{
          background: "var(--component-header-background)",
          borderImage: "var(--component-header-border-image)",
          clipPath: "var(--component-header-clip-path)",
        }}
      >
        <Button
          ghost
          size="icon"
          onClick={() => setMobileOpen(true)}
          aria-label={t.app.openNavigation}
          aria-expanded={mobileOpen}
          aria-controls="app-sidebar"
          className="text-text-secondary hover:text-midground"
        >
          <Menu />
        </Button>

        <img
          src="/brand/work4you-favicon.svg"
          alt={t.app.brand}
          className="h-[34px] w-auto select-none"
          draggable={false}
        />
      </header>

      {mobileOpen && (
        <Button
          ghost
          aria-label={t.app.closeNavigation}
          onClick={closeMobile}
          className={cn(
            "lg:hidden fixed inset-0 z-40 p-0 block",
            "bg-black/70",
          )}
        />
      )}

      <PluginSlot name="header-banner" />
      <ProfileScopeBanner />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-14 lg:pt-0">
        <div className="flex min-h-0 min-w-0 flex-1">
          <aside
            id="app-sidebar"
            aria-label={t.app.navigation}
            className={cn(
              "fixed left-0 z-50 flex w-[280px] min-h-0 flex-col font-sans",
              // Under the frameless chrome the bar owns the top 36px — the
              // fixed (mobile-drawer) sidebar starts below it.
              desktopChrome
                ? "top-9 h-[calc(100dvh-2.25rem)] max-h-[calc(100dvh-2.25rem)]"
                : "top-0 h-dvh max-h-dvh",
              "border-r border-current/20",
              "bg-background-base",
              "transition-[transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
              "lg:sticky lg:top-0 lg:translate-x-0 lg:shrink-0 lg:overflow-hidden",
              "lg:transition-[width] lg:duration-300 lg:ease-[cubic-bezier(0.23,1,0.32,1)]",
              collapsed && "lg:w-14",
            )}
            style={{
              background: "var(--component-sidebar-background)",
              clipPath: "var(--component-sidebar-clip-path)",
              borderImage: "var(--component-sidebar-border-image)",
            }}
          >
            <div
              className={cn(
                "flex h-14 shrink-0 items-center gap-2",
                "border-b border-current/20",
                collapsed ? "lg:justify-center lg:px-0" : "px-4 justify-between",
              )}
            >
              <div
                className={cn(
                  "flex items-center gap-2",
                  collapsed && "lg:hidden",
                )}
              >
                <PluginSlot name="header-left" />

                {/* Desktop (0.3.7, Codex ref): the logo slot becomes the
                    product switcher ("Work4You ⌄"). The plain web keeps the
                    official brand lockup it always had. */}
                {desktopApp ? (
                  <ProductSwitcher />
                ) : (
                  <img
                    src="/brand/work4you-favicon.svg"
                    alt={t.app.brand}
                    className="h-10 w-auto select-none"
                    draggable={false}
                  />
                )}
              </div>

              <Button
                ghost
                size="icon"
                onClick={closeMobile}
                aria-label={t.app.closeNavigation}
                className="lg:hidden text-text-secondary hover:text-midground"
              >
                <X />
              </Button>

              {/* Collapse toggle: under the frameless chrome it MOVED to the
                  top bar (Codex ref) — hidden here to avoid two toggles. */}
              {!desktopChrome && (
                <Button
                  ghost
                  size="icon"
                  onClick={toggleCollapsed}
                  aria-label={
                    collapsed ? t.common.expand : t.common.collapse
                  }
                  className="hidden lg:flex text-text-secondary hover:text-midground"
                >
                  {collapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>

            <ProfileSwitcher collapsed={isDesktopCollapsed} />

            <nav
              className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden border-t border-current/10 py-2"
              aria-label={t.app.navigation}
            >
              <ul className="flex flex-col">
                {sidebarNav.coreItems.map((item) =>
                  item.children ? (
                    <SidebarNavGroup
                      closeMobile={closeMobile}
                      collapsed={isDesktopCollapsed}
                      item={item}
                      key={item.path}
                      t={t}
                      tooltipWarmRef={tooltipWarmRef}
                    />
                  ) : (
                    <SidebarNavLink
                      closeMobile={closeMobile}
                      collapsed={isDesktopCollapsed}
                      item={item}
                      key={item.path}
                      t={t}
                      tooltipWarmRef={tooltipWarmRef}
                    />
                  ),
                )}
              </ul>

              {/* Tasks/Sessions history in the global sidebar (Manus style) —
                  the real /api/sessions list with filter + actions. It
                  disappears when the sidebar collapses to icons. */}
              {embeddedChat && (
                <SidebarTasks
                  collapsed={isDesktopCollapsed}
                  onNavigate={closeMobile}
                />
              )}

              {sidebarNav.pluginItems.length > 0 && (
                <div
                  aria-labelledby="wayne-sidebar-plugin-nav-heading"
                  className="flex flex-col border-t border-current/10 pb-2"
                  role="group"
                >
                  <span
                    className={cn(
                      "px-5 pt-2.5 pb-1",
                      "font-sans text-display text-xs tracking-[0.12em] text-text-tertiary",
                      isDesktopCollapsed && "lg:hidden",
                    )}
                    id="wayne-sidebar-plugin-nav-heading"
                  >
                    {t.app.pluginNavSection}
                  </span>

                  <ul className="flex flex-col">
                    {sidebarNav.pluginItems.map((item) => (
                      <SidebarNavLink
                        closeMobile={closeMobile}
                        collapsed={isDesktopCollapsed}
                        item={item}
                        key={item.path}
                        t={t}
                        tooltipWarmRef={tooltipWarmRef}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </nav>

            {/* "Sistema" block (gateway state / Restart gateway) HIDDEN from the
                end user — it is an OPERATIONS control (we operate the platform).
                Kept behind `false &&` for a future admin view (keeps the code
                referenced). */}
            {false && (
              <>
                <SidebarSystemActions
                  collapsed={isDesktopCollapsed}
                  onNavigate={closeMobile}
                  status={sidebarStatus}
                  tooltipWarmRef={tooltipWarmRef}
                />
                <SidebarIconWithTooltip collapsed={isDesktopCollapsed} label="" tooltipWarmRef={tooltipWarmRef}>
                  <span />
                </SidebarIconWithTooltip>
              </>
            )}

            {/* Footer plugin slot preserved. Theme and Language left here: Theme
                → Settings (Appearance); Language → the user chip's menu
                (AuthWidget). Container invisible when empty. */}
            <div
              className={cn(
                "flex shrink-0 items-center px-3 empty:hidden",
                isDesktopCollapsed && "lg:flex-col lg:items-start",
              )}
            >
              <PluginSlot name="header-right" />
            </div>

            <div
              className={cn(
                "flex shrink-0 flex-col",
                isDesktopCollapsed && "lg:hidden",
              )}
            >
              <AuthWidget onOpenSettings={() => setSettingsOpen(true)} />
            </div>
          </aside>

          <PageHeaderProvider pluginTabs={pluginTabMeta}>
            {/* Settings as a full-screen overlay (opened from the chip's menu).
                Inside the PageHeaderProvider so ConfigPage can use usePageHeader
                and the overlay can show the `end` slot (Save button). */}
            <SettingsOverlay open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            <div
              className={cn(
                "relative z-2 flex min-w-0 min-h-0 flex-1 flex-col",
                "px-3 sm:px-6",
                isChatRoute
                  ? "pb-0 pt-1 sm:pt-2 lg:pt-4"
                  : "pt-2 sm:pt-4 lg:pt-6",
                isDocsRoute && "min-h-0 flex-1",
              )}
            >
              <PluginSlot name="pre-main" />
              <div
                className={cn(
                  "w-full min-w-0",
                  !isChatRoute &&
                    "pb-[calc(2rem+env(safe-area-inset-bottom,0px))] lg:pb-8",
                  (isDocsRoute || isChatRoute) &&
                    "min-h-0 flex flex-1 flex-col",
                )}
              >
                <ProfileKeyedRoutes>
                  <Routes>
                    {routes.map(({ key, path, element }) => (
                      <Route key={key} path={path} element={element} />
                    ))}
                    <Route
                      path="*"
                      element={
                        <UnknownRouteFallback pluginsLoading={pluginsLoading} />
                      }
                    />
                  </Routes>
                </ProfileKeyedRoutes>

                {embeddedChat &&
                  !chatOverriddenByPlugin &&
                  (pluginsLoading ? (
                    isChatRoute ? (
                      <div
                        className="flex min-h-0 min-w-0 flex-1 items-center justify-center"
                        aria-busy="true"
                        aria-live="polite"
                      >
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Spinner />
                          <span>Loading chat…</span>
                        </div>
                      </div>
                    ) : null
                  ) : (
                    <div
                      data-chat-active={isChatRoute ? "true" : "false"}
                      className={cn(
                        "min-h-0 min-w-0",
                        isChatRoute ? "flex flex-1 flex-col" : "hidden",
                      )}
                      aria-hidden={!isChatRoute}
                    >
                      <ChatPage isActive={isChatRoute} />
                    </div>
                  ))}
              </div>
              <PluginSlot name="post-main" />
            </div>
          </PageHeaderProvider>
        </div>
      </div>

      <PluginSlot name="overlay" />
    </div>
    </ProfileProvider>
  );
}

/**
 * Remounts the entire routed page tree when the global management profile
 * changes. Pages load their data on mount; without this, a page opened
 * under profile A would keep showing A's state while writes (via the
 * fetchJSON ?profile= injection) silently targeted the newly selected
 * profile B — the exact stale-target footgun the switcher exists to kill.
 * Keying by profile resets every page's local state so it refetches under
 * the new scope. The persistent ChatPage host below handles its own
 * remount (channel keyed on scopedProfile).
 */
function ProfileKeyedRoutes({ children }: { children: ReactNode }) {
  const { profile } = useProfileScope();
  return <div key={profile || "__own__"} className="contents">{children}</div>;
}

function SidebarNavLink({
  closeMobile,
  collapsed,
  item,
  tooltipWarmRef,
  t,
}: SidebarNavLinkProps) {
  const { path, to, label, labelKey, icon: Icon } = item;
  const [hovered, setHovered] = useState(false);
  const [tooltipAnchor, setTooltipAnchor] = useState<HTMLElement | null>(null);

  // "Nova sessão" (the /chat item) is only ACTIVE on the new-session screen —
  // not in the project space (?home=1) nor in a resumed conversation (?resume).
  // Without this, the NavLink matches by pathname and it stayed always lit; and
  // the project got highlighted alongside, giving the odd feeling Leonardo
  // pointed out. Here "Nova sessão" lights up and the project goes dark (see
  // SidebarTasks).
  const location = useLocation();
  const isChatItem = path === "/chat";
  const chatFresh =
    isChatItem &&
    location.pathname === "/chat" &&
    !new URLSearchParams(location.search).has("resume") &&
    !new URLSearchParams(location.search).has("home");

  const navLabel = labelKey
    ? ((t.app.nav as Record<string, string>)[labelKey] ?? label)
    : label;
  const showTooltip = (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    setHovered(true);
    setTooltipAnchor(event.currentTarget);
  };
  const hideTooltip = () => {
    setHovered(false);
    setTooltipAnchor(null);
  };

  return (
    <li
      onMouseEnter={collapsed ? showTooltip : undefined}
      onMouseLeave={collapsed ? hideTooltip : undefined}
    >
      <NavLink
        to={to ?? path}
        end={path === "/sessions"}
        onClick={closeMobile}
        aria-label={collapsed ? navLabel : undefined}
        onFocus={collapsed ? showTooltip : undefined}
        onBlur={collapsed ? hideTooltip : undefined}
        className={({ isActive }) => {
          const active = isChatItem ? chatFresh : isActive;
          return cn(
            "group/nav relative flex items-center gap-3.5",
            "px-5 py-3",
            "font-sans text-display uppercase text-sm tracking-[0.06em]",
            "whitespace-nowrap transition-colors cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground",
            active
              ? "text-midground"
              : "text-text-secondary hover:text-midground",
          );
        }}
        style={{
          clipPath: "var(--component-tab-clip-path)",
        }}
      >
        {({ isActive }) => {
          const active = isChatItem ? chatFresh : isActive;
          return (
          <>
            <Icon className="h-[18px] w-[18px] shrink-0" />

            <span
              className={cn(
                "truncate transition-opacity duration-300",
                collapsed ? "lg:opacity-0" : "lg:opacity-100",
              )}
            >
              {navLabel}
            </span>

            <span
              aria-hidden
              className="absolute inset-y-0.5 left-1.5 right-1.5 bg-midground opacity-0 pointer-events-none transition-opacity duration-200 group-hover/nav:opacity-5"
            />

            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0 w-px bg-midground"
              />
            )}
          </>
          );
        }}
      </NavLink>

      {collapsed && hovered && tooltipAnchor && (
        <SidebarTooltip anchor={tooltipAnchor} label={navLabel} warmRef={tooltipWarmRef} />
      )}
    </li>
  );
}

/**
 * Expandable nav group (Claude Console-style dropdown): the parent does NOT
 * navigate — it only opens/closes; the submodules are indented children,
 * sentence-case (same pattern as the SidebarTasks items). Auto-expands when the
 * current route belongs to the group; the manual choice persists in
 * localStorage. Collapsed to icons, the group degrades to the normal
 * SidebarNavLink (link + tooltip).
 */
function SidebarNavGroup({
  closeMobile,
  collapsed,
  item,
  t,
  tooltipWarmRef,
}: SidebarNavLinkProps) {
  const { path, label, labelKey, icon: Icon, children = [] } = item;
  const location = useLocation();
  const inGroup =
    location.pathname === path || location.pathname.startsWith(`${path}/`);
  const storageKey = `w4y-nav-group:${path}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v !== null) return v === "1";
    } catch {
      /* no storage → default open */
    }
    return true;
  });
  // Entering a route in the group always reveals it — nobody navigates blind.
  useEffect(() => {
    if (inGroup) setOpen(true);
  }, [inGroup]);
  const toggle = () =>
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* best effort */
      }
      return next;
    });

  // Sidebar in icon mode: a dropdown does not fit — it becomes the usual plain link.
  if (collapsed) {
    return (
      <SidebarNavLink
        closeMobile={closeMobile}
        collapsed={collapsed}
        item={{ ...item, children: undefined }}
        t={t}
        tooltipWarmRef={tooltipWarmRef}
      />
    );
  }

  const navLabel = labelKey
    ? ((t.app.nav as Record<string, string>)[labelKey] ?? label)
    : label;

  return (
    <li>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          "group/nav relative flex w-full items-center gap-3.5",
          "px-5 py-3",
          "font-sans text-display uppercase text-sm tracking-[0.06em]",
          "whitespace-nowrap transition-colors cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground",
          inGroup ? "text-midground" : "text-text-secondary hover:text-midground",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 truncate text-left">{navLabel}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
        <span
          aria-hidden
          className="absolute inset-y-0.5 left-1.5 right-1.5 bg-midground opacity-0 pointer-events-none transition-opacity duration-200 group-hover/nav:opacity-5"
        />
        {/* Closed group with an active route inside: keeps the signal of where you are. */}
        {inGroup && !open && (
          <span aria-hidden className="absolute left-0 top-0 bottom-0 w-px bg-midground" />
        )}
      </button>

      {open && (
        <ul className="flex flex-col pb-1">
          {children.map((child) => (
            <li key={child.path}>
              <NavLink
                to={child.path}
                end={child.end}
                onClick={closeMobile}
                className={({ isActive }) =>
                  cn(
                    "group/nav relative flex items-center py-2 pl-[52px] pr-5",
                    "font-sans text-sm whitespace-nowrap transition-colors cursor-pointer",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground",
                    isActive
                      ? "text-midground"
                      : "text-text-secondary hover:text-midground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="truncate">{child.getLabel(t)}</span>
                    <span
                      aria-hidden
                      className="absolute inset-y-0.5 left-1.5 right-1.5 bg-midground opacity-0 pointer-events-none transition-opacity duration-200 group-hover/nav:opacity-5"
                    />
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 w-px bg-midground"
                      />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SidebarSystemActions({
  collapsed,
  onNavigate,
  status,
  tooltipWarmRef,
}: SidebarSystemActionsProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { activeAction, isBusy, isRunning, pendingAction, runAction } =
    useSystemActions();
  const canUpdateWayne = status?.can_update_wayne === true;
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [updateConfirmInfo, setUpdateConfirmInfo] =
    useState<UpdateCheckResponse | null>(null);
  const [updateConfirmChecking, setUpdateConfirmChecking] = useState(false);

  useEffect(() => {
    if (!updateConfirmOpen) {
      setUpdateConfirmInfo(null);
      return;
    }
    let cancelled = false;
    setUpdateConfirmChecking(true);
    api
      .checkWayneUpdate(false)
      .then((info) => {
        if (!cancelled) setUpdateConfirmInfo(info);
      })
      .catch(() => {
        if (!cancelled) setUpdateConfirmInfo(null);
      })
      .finally(() => {
        if (!cancelled) setUpdateConfirmChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [updateConfirmOpen]);

  const updateConfirmDescription = useMemo(() => {
    if (updateConfirmInfo?.behind && updateConfirmInfo.behind > 0) {
      const cmd = updateConfirmInfo.update_command;
      const n = updateConfirmInfo.behind;
      return `This will run 'wayne update' (${cmd}) and pull ${n} new commit${n === 1 ? "" : "s"}. The gateway restarts when the update finishes; the current session keeps its prompt cache until then.`;
    }
    const cmd = updateConfirmInfo?.update_command ?? "wayne update";
    return (
      t.status.updateWayneConfirmMessage ??
      `This will run 'wayne update' (${cmd}) and restart the gateway when it finishes.`
    );
  }, [t.status.updateWayneConfirmMessage, updateConfirmInfo]);

  const items: SystemActionItem[] = [
    {
      action: "restart",
      icon: RotateCw,
      label: t.status.restartGateway,
      runningLabel: t.status.restartingGateway,
      spin: true,
    },
  ];
  if (canUpdateWayne) {
    items.push({
      action: "update",
      icon: Download,
      label: t.status.updateWayne,
      runningLabel: t.status.updatingWayne,
      spin: false,
    });
  }

  const handleClick = (action: SystemAction) => {
    if (isBusy) return;
    if (action === "restart") {
      setRestartConfirmOpen(true);
      return;
    }
    if (action === "update") {
      setUpdateConfirmOpen(true);
      return;
    }
    void runAction(action);
    navigate("/sessions");
    onNavigate();
  };

  const confirmRestart = () => {
    setRestartConfirmOpen(false);
    void runAction("restart");
    navigate("/sessions");
    onNavigate();
  };

  const confirmUpdate = () => {
    setUpdateConfirmOpen(false);
    void runAction("update");
    navigate("/sessions");
    onNavigate();
  };

  return (
    <>
    <div
      className={cn(
        "shrink-0 flex flex-col",
        "border-t border-current/10",
        "py-1",
      )}
    >
      <span
        className={cn(
          "px-5 pt-0.5 pb-0.5",
          "font-sans text-display text-xs tracking-[0.12em] text-text-tertiary",
          collapsed && "lg:hidden",
        )}
      >
        {t.app.system}
      </span>

      <div className={cn(collapsed && "lg:hidden")}>
        <SidebarStatusStrip status={status} />
      </div>

      <GatewayDot collapsed={collapsed} status={status} tooltipWarmRef={tooltipWarmRef} />

      <ul className="flex flex-col">
        {items.map((item) => (
          <SystemActionButton
            key={item.action}
            collapsed={collapsed}
            disabled={isBusy && !(pendingAction === item.action || (activeAction === item.action && isRunning))}
            tooltipWarmRef={tooltipWarmRef}
            isPending={pendingAction === item.action}
            isRunning={activeAction === item.action && isRunning && pendingAction !== item.action}
            item={item}
            onClick={() => handleClick(item.action)}
          />
        ))}
      </ul>
    </div>

    <ConfirmDialog
      cancelLabel={t.common.cancel}
      confirmLabel={t.status.restartGateway}
      description={
        t.status.restartGatewayConfirmMessage ??
        "This restarts the Work4You gateway process. Connected channels and active sessions will reconnect afterward."
      }
      loading={pendingAction === "restart"}
      onCancel={() => setRestartConfirmOpen(false)}
      onConfirm={confirmRestart}
      open={restartConfirmOpen}
      title={
        t.status.restartGatewayConfirmTitle ?? `${t.status.restartGateway}?`
      }
    />

    <ConfirmDialog
      cancelLabel={t.common.cancel}
      confirmLabel={t.status.updateWayneConfirmNow ?? "Update now"}
      description={
        updateConfirmChecking ? t.common.loading : updateConfirmDescription
      }
      loading={pendingAction === "update" || updateConfirmChecking}
      onCancel={() => setUpdateConfirmOpen(false)}
      onConfirm={confirmUpdate}
      open={updateConfirmOpen}
      title={t.status.updateWayneConfirmTitle ?? `${t.status.updateWayne}?`}
    />
    </>
  );
}

function SystemActionButton({
  collapsed,
  disabled,
  isPending,
  isRunning: isActionRunning,
  item,
  onClick,
  tooltipWarmRef,
}: SystemActionButtonProps) {
  const { icon: Icon, label, runningLabel, spin } = item;
  const [hovered, setHovered] = useState(false);
  const [tooltipAnchor, setTooltipAnchor] = useState<HTMLElement | null>(null);
  const busy = isPending || isActionRunning;
  const displayLabel = isActionRunning ? runningLabel : label;
  const showTooltip = (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    setHovered(true);
    setTooltipAnchor(event.currentTarget);
  };
  const hideTooltip = () => {
    setHovered(false);
    setTooltipAnchor(null);
  };

  return (
    <li
      onMouseEnter={collapsed ? showTooltip : undefined}
      onMouseLeave={collapsed ? hideTooltip : undefined}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        aria-busy={busy}
        aria-label={collapsed ? displayLabel : undefined}
        onFocus={collapsed ? showTooltip : undefined}
        onBlur={collapsed ? hideTooltip : undefined}
        type="button"
        className={cn(
          "group/action relative flex w-full items-center gap-3",
          "px-5 py-2.5",
          "font-sans text-display text-xs tracking-[0.1em]",
          "whitespace-nowrap transition-colors cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground",
          busy
            ? "text-midground"
            : "text-text-secondary hover:text-midground",
          "disabled:text-text-disabled disabled:cursor-not-allowed",
        )}
      >
        {isPending ? (
          <Spinner className="shrink-0 text-[0.875rem]" />
        ) : isActionRunning && spin ? (
          <Spinner className="shrink-0 text-[0.875rem]" />
        ) : (
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isActionRunning && !spin && "animate-pulse",
            )}
          />
        )}

        <span className={cn(
          "truncate transition-opacity duration-300",
          collapsed ? "lg:opacity-0" : "lg:opacity-100",
        )}>
          {displayLabel}
        </span>

        <span
          aria-hidden
          className="absolute inset-y-0.5 left-1.5 right-1.5 bg-midground opacity-0 pointer-events-none transition-opacity duration-200 group-hover/action:opacity-5"
        />

        {busy && (
          <span
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-px bg-midground"
          />
        )}
      </button>

      {collapsed && hovered && tooltipAnchor && (
        <SidebarTooltip anchor={tooltipAnchor} label={displayLabel} warmRef={tooltipWarmRef} />
      )}
    </li>
  );
}

function SidebarIconWithTooltip({
  children,
  collapsed,
  label,
  tooltipWarmRef,
}: SidebarIconWithTooltipProps) {
  const [hovered, setHovered] = useState(false);
  const [tooltipAnchor, setTooltipAnchor] = useState<HTMLElement | null>(null);
  const showTooltip = (event: MouseEvent<HTMLDivElement>) => {
    setHovered(true);
    setTooltipAnchor(event.currentTarget);
  };
  const hideTooltip = () => {
    setHovered(false);
    setTooltipAnchor(null);
  };

  return (
    <div
      className={cn(
        "relative w-fit",
        collapsed && "group/icon",
      )}
      onMouseEnter={collapsed ? showTooltip : undefined}
      onMouseLeave={collapsed ? hideTooltip : undefined}
    >
      {children}

      {collapsed && (
        <span
          aria-hidden
          className="absolute inset-y-0 inset-x-[-0.375rem] bg-midground opacity-0 pointer-events-none transition-opacity duration-200 group-hover/icon:opacity-5 hidden lg:block"
        />
      )}

      {collapsed && hovered && tooltipAnchor && (
        <SidebarTooltip anchor={tooltipAnchor} label={label} warmRef={tooltipWarmRef} />
      )}
    </div>
  );
}

function GatewayDot({ collapsed, status, tooltipWarmRef }: GatewayDotProps) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [tooltipAnchor, setTooltipAnchor] = useState<HTMLElement | null>(null);

  const toneToColor: Record<string, string> = {
    "text-success": "bg-success",
    "text-warning": "bg-warning",
    "text-destructive": "bg-destructive",
    "text-muted-foreground": "bg-muted-foreground",
  };

  let color: string;
  let label: string;

  if (!status) {
    color = "bg-midground/20";
    label = t.status.gateway;
  } else {
    const gw = gatewayLine(status, t);
    color = toneToColor[gw.tone] ?? "bg-muted-foreground";
    label = `${t.status.gateway} ${gw.label}`;
  }
  const showTooltip = (event: MouseEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) => {
    setHovered(true);
    setTooltipAnchor(event.currentTarget);
  };
  const hideTooltip = () => {
    setHovered(false);
    setTooltipAnchor(null);
  };

  return (
    <div
      className={cn(
        "hidden lg:flex py-3 pl-[1.625rem] transition-opacity duration-300",
        collapsed ? "lg:opacity-100" : "lg:opacity-0 lg:h-0 lg:py-0 lg:overflow-hidden",
      )}
      role="status"
      aria-label={label}
      tabIndex={collapsed ? 0 : -1}
      onMouseEnter={collapsed ? showTooltip : undefined}
      onMouseLeave={collapsed ? hideTooltip : undefined}
      onFocus={collapsed ? showTooltip : undefined}
      onBlur={collapsed ? hideTooltip : undefined}
    >
      <span
        aria-hidden
        className={cn("h-1.5 w-1.5 rounded-full", color)}
      />

      {hovered && tooltipAnchor && (
        <SidebarTooltip anchor={tooltipAnchor} label={label} warmRef={tooltipWarmRef} />
      )}
    </div>
  );
}

function SidebarTooltip({ anchor, label, warmRef }: SidebarTooltipProps) {
  const rect = anchor.getBoundingClientRect();
  const sidebar = document.getElementById("app-sidebar");
  const sidebarRight = sidebar?.getBoundingClientRect().right ?? rect.right;
  const [isWarm, setIsWarm] = useState(false);

  useEffect(() => {
    if (!warmRef) {
      setIsWarm(false);
      return;
    }
    const now = Date.now();
    setIsWarm(now - warmRef.current < 300);
    warmRef.current = now;
    return () => {
      if (warmRef) warmRef.current = Date.now();
    };
  }, [warmRef]);

  return createPortal(
    <span
      className={cn(
        "fixed z-[100] pointer-events-none",
        "px-2 py-1",
        "bg-background-base border border-current/20 shadow-lg",
        "font-sans text-display text-xs tracking-[0.1em] text-midground uppercase",
      )}
      style={{
        top: rect.top + rect.height / 2,
        left: sidebarRight + 8,
        transform: "translateY(-50%)",
        opacity: isWarm ? 1 : undefined,
        animation: isWarm ? "none" : "sidebar-tooltip-in 120ms ease-out",
      }}
    >
      {label}
    </span>,
    document.body,
  );
}

type TooltipWarmRef = React.RefObject<number>;

interface GatewayDotProps {
  collapsed: boolean;
  status: StatusResponse | null;
  tooltipWarmRef: TooltipWarmRef;
}

/** Sub-item of a nav group (Claude Console-style dropdown) — no icon, just
 *  indented text; `end` tells the group's index route apart from the children. */
interface SidebarSubItem {
  path: string;
  end?: boolean;
  getLabel: (t: Translations) => string;
}

interface NavItem {
  icon: ComponentType<{ className?: string }>;
  label: string;
  labelKey?: string;
  path: string;
  /** The link's real destination when it differs from the identity `path` (e.g.
   *  the "Nova tarefa" item navigates with a ?new=1 trigger that forces a new
   *  conversation). */
  to?: string;
  /** Present = the item becomes an expandable GROUP (dropdown) with submodules —
   *  Claude Console pattern ("Agentes Gerenciados ⌄"). Leonardo's request 10/07:
   *  submodules in the sidebar, not tabs inside the module. */
  children?: SidebarSubItem[];
}

interface SidebarIconWithTooltipProps {
  children: ReactNode;
  collapsed: boolean;
  label: string;
  tooltipWarmRef: TooltipWarmRef;
}

interface SidebarNavLinkProps {
  closeMobile: () => void;
  collapsed: boolean;
  item: NavItem;
  t: Translations;
  tooltipWarmRef: TooltipWarmRef;
}

interface SidebarSystemActionsProps {
  collapsed: boolean;
  onNavigate: () => void;
  status: StatusResponse | null;
  tooltipWarmRef: TooltipWarmRef;
}

interface SidebarTooltipProps {
  anchor: HTMLElement;
  label: string;
  warmRef?: TooltipWarmRef;
}

interface SystemActionButtonProps {
  collapsed: boolean;
  disabled: boolean;
  isPending: boolean;
  isRunning: boolean;
  item: SystemActionItem;
  onClick: () => void;
  tooltipWarmRef: TooltipWarmRef;
}

interface SystemActionItem {
  action: SystemAction;
  icon: ComponentType<{ className?: string }>;
  label: string;
  runningLabel: string;
  spin: boolean;
}
