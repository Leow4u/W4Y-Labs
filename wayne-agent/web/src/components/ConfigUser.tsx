/**
 * ConfigUser — Configuração ENXUTA do usuário (benchmark: Manus web).
 * Seções: Conta · Geral · Personalização · Privacidade · Controle de dados —
 * só controles com lastro REAL (curadoria em docs/CONFIG-CURADORIA.md).
 *
 * Bloco 3 — AUTO-SAVE: não há botão Salvar. Toggles/selects gravam no ato
 * (api.saveConfig); o textarea de Instruções grava ao sair do campo
 * (updateProfileSoul); tema/idioma já persistem nos próprios hooks.
 *
 * Backings: Conta=/api/auth/me + logout · Geral=useI18n/useTheme/config ·
 * Personalização=SOUL.md · Privacidade=memory + privacy.redact_pii ·
 * Controle de dados=resetMemory + bulkDeleteSessions. Tela técnica: ?full=1.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { UserCircle, SlidersHorizontal, Sparkles, Shield, LogOut, Package, Plug, Puzzle, Search, Monitor, Bell, Brain, Laptop, HardDrive, Cpu, MemoryStick, Archive, ExternalLink, Gauge, Check } from "lucide-react";
import SkillsPage from "@/pages/SkillsPage";
import McpPage from "@/pages/McpPage";
import PluginsPage from "@/pages/PluginsPage";
import { Switch } from "@nous-research/ui/ui/components/switch";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@nous-research/ui/ui/components/card";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { ConfirmDialog } from "@nous-research/ui/ui/components/confirm-dialog";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { api, type AuthMeResponse, type SystemStats, type StatusResponse, type AnalyticsResponse } from "@/lib/api";
import { TIER_ORDER, TIER_PRESETS, tierFromConfig, type TierKey } from "@/lib/tier-presets";
import { formatCredits, usdToCredits } from "@/lib/credits";
import {
  getChatDisplay,
  setChatDisplay,
  type ChatTextSize,
  type ChatWidth,
} from "@/lib/chat-display";
import { isNotifyEnabled, setNotifyKind } from "@/lib/notify-prefs";
import { getNestedValue, setNestedValue } from "@/lib/nested";
import { useI18n, LOCALE_META } from "@/i18n";
import type { Locale } from "@/i18n";
import { useTheme, THEME_DEFAULT_FONT_ID } from "@/themes";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn } from "@/lib/utils";

type SectionKey =
  | "general" | "account" | "computer" | "planTab" | "notificationsTab" | "memoryTab" | "privacyData"
  | "skills" | "connectors" | "plugins";
type NavItem = { key: SectionKey; icon: React.ComponentType<{ className?: string }> };

// Grupo "Configurações" — Onda A (10/07): estrutura Claude, lastro nativo.
// Geral absorveu Personalização (instruções); Privacidade+Controle viraram
// "Privacidade e dados"; Memória ganhou seção própria; Computador e
// Notificações são novas (benchmark Manus "My Computer" / Claude).
const SECTIONS: NavItem[] = [
  { key: "general", icon: SlidersHorizontal },
  { key: "account", icon: UserCircle },
  { key: "computer", icon: Monitor },
  { key: "planTab", icon: Gauge },
  { key: "notificationsTab", icon: Bell },
  { key: "memoryTab", icon: Brain },
  { key: "privacyData", icon: Shield },
];
// Grupo "Personalizar" — reusa as PÁGINAS existentes (mesmo backing/API),
// montadas aqui no modal como o Claude/Manus fazem. Não são telas novas.
const PAGES: NavItem[] = [
  { key: "skills", icon: Package },
  { key: "connectors", icon: Plug },
  { key: "plugins", icon: Puzzle },
];
const PAGE_KEYS: SectionKey[] = ["skills", "connectors", "plugins"];

/** Galeria de temas (benchmark: aba Appearance do Hermes desktop) — cada
 *  card mostra uma MINI-PRÉVIA real do tema (fundo, superfície, texto e
 *  acento, hexes dos presets em themes/presets.ts) + nome + descrição. */
const THEME_PREVIEWS: Array<{
  key: string;
  labelKey: "themeLight" | "themeDark" | null;
  literal?: string;
  descKey: "themeDescWhite" | "themeDescMono" | "themeDescCyberpunk" | "themeDescRose";
  bg: string;
  surface: string;
  fg: string;
  accent: string;
}> = [
  { key: "white", labelKey: "themeLight", descKey: "themeDescWhite", bg: "#faf9f5", surface: "#ffffff", fg: "#1a1915", accent: "#c15f3c" },
  { key: "mono", labelKey: "themeDark", descKey: "themeDescMono", bg: "#0e0e0e", surface: "#1b1b1b", fg: "#ffffff", accent: "#eaeaea" },
  { key: "cyberpunk", labelKey: null, literal: "Cyberpunk", descKey: "themeDescCyberpunk", bg: "#040608", surface: "#0b1512", fg: "#d9ffe9", accent: "#9bffcf" },
  { key: "rose", labelKey: null, literal: "Rosé", descKey: "themeDescRose", bg: "#1a0f15", surface: "#271521", fg: "#ffe6f0", accent: "#ffd4e1" },
];

const TIMEZONES: string[] = (() => {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    return fn ? fn("timeZone") : [];
  } catch {
    return [];
  }
})();

function initialsOf(label: string): string {
  const parts = label.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "•";
}

const inputCls =
  "h-10 w-full max-w-sm rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-live/50";

/** Linha de toggle reutilizável (rótulo + descrição + Switch). */
function ToggleRow({
  label, hint, checked, onChange, border,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; border?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", border && "border-t border-border pt-4")}>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm">{label}</span>
        {hint && <span className="text-xs text-text-secondary">{hint}</span>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Grupo segmentado (padrão dos botões de tema) — tamanho/largura/orçamento. */
function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "min-w-[5.5rem] rounded-lg border px-4 py-2.5 text-sm transition-colors",
            value === o.v
              ? "border-current/60 bg-current/10 font-semibold text-foreground"
              : "border-border text-muted-foreground hover:bg-current/5",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Medidor de recurso do Computador (memória/armazenamento/CPU): rótulo,
 *  leitura e barra que esquenta com o uso (verde→âmbar 70%→vermelho 90%). */
function Meter({
  icon: Icon, label, detail, percent,
}: { icon: React.ComponentType<{ className?: string }>; label: string; detail: string; percent: number | null }) {
  const pct = percent == null ? null : Math.max(0, Math.min(100, percent));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </span>
        <span className="text-xs tabular-nums text-text-secondary">{detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        {pct != null && (
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-live",
            )}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

/** bytes → "1,2 GB" (uma casa até 10 GB, inteiro acima). */
function gb(n: number): string {
  const v = n / 1073741824;
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} GB`;
}

export default function ConfigUser() {
  const { t, locale, setLocale } = useI18n();
  const cu = t.configUser;
  const { themeName, setTheme, fontId, fontChoices, setFont } = useTheme();
  const { setEnd } = usePageHeader();
  const { toast, showToast } = useToast();

  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [soul, setSoul] = useState<string>("");
  const soulLoaded = useRef<string>("");
  const [active, setActive] = useState<SectionKey>("general");
  const [confirm, setConfirm] = useState<null | "memory" | "sessions">(null);
  const [busy, setBusy] = useState(false);
  const [navQuery, setNavQuery] = useState("");

  // Re-render dos controles client-side (transcrição/notificações) — os
  // valores moram nas libs (localStorage), o tick só força a releitura.
  const [, setPrefsTick] = useState(0);
  const bumpPrefs = () => setPrefsTick((n) => n + 1);

  // ── Computador (benchmark Manus "My Computer") — /api/system/stats +
  // /api/status, carregados ao abrir a seção. Tudo lastro real (RAM/CPU/
  // disco = o VOLUME /opt/data do tenant, medido por psutil no servidor).
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [sysStatus, setSysStatus] = useState<StatusResponse | null>(null);
  const [computerTab, setComputerTab] = useState<"cloud" | "local">("cloud");
  const [backupBusy, setBackupBusy] = useState(false);
  useEffect(() => {
    if (active !== "computer") return;
    let cancelled = false;
    const load = () => {
      api.getSystemStats().then((s) => { if (!cancelled) setStats(s); }).catch(() => {});
      api.getStatus().then((s) => { if (!cancelled) setSysStatus(s); }).catch(() => {});
    };
    load();
    const iv = window.setInterval(load, 15000); // ao vivo, leve
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [active]);

  // ── Plano & Utilização (Onda C) — consumo em CRÉDITOS (nunca US$; ver
  // lib/credits.ts) a partir do /api/analytics/usage; tier PADRÃO global
  // (mesma mecânica do TierPicker: setModelAssignment + reasoning/delegation).
  const [usage, setUsage] = useState<AnalyticsResponse | null>(null);
  const [tierBusy, setTierBusy] = useState(false);
  // Medidor do ciclo — RPC usage.account do gateway (percentual da quota da
  // chave OpenRouter do tenant; nunca $ nem a chave). Client efêmero: abre,
  // pergunta, fecha — a aba Plano é REST no resto.
  const [cycleMeter, setCycleMeter] = useState<
    { configured: boolean; used_percent: number | null; depleted: boolean } | null
  >(null);
  useEffect(() => {
    if (active !== "planTab") return;
    let cancelled = false;
    api.getAnalytics(30).then((u) => { if (!cancelled) setUsage(u); }).catch(() => {});
    void (async () => {
      const { GatewayClient } = await import("@/lib/gatewayClient");
      const gw = new GatewayClient();
      try {
        await gw.connect();
        const res = await gw.request<{
          configured: boolean;
          used_percent: number | null;
          depleted: boolean;
        }>("usage.account", {});
        if (!cancelled) setCycleMeter(res);
      } catch {
        if (!cancelled) setCycleMeter({ configured: false, used_percent: null, depleted: false });
      } finally {
        gw.close();
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  const applyDefaultTier = async (k: TierKey) => {
    if (tierBusy || k === currentTier) return;
    setTierBusy(true);
    const preset = TIER_PRESETS[k];
    try {
      await api.setModelAssignment({
        confirm_expensive_model: true,
        scope: "main",
        provider: "openrouter",
        model: preset.model,
      });
      const cfg = ((await api.getConfig()) ?? {}) as Record<string, unknown>;
      const agent =
        cfg.agent && typeof cfg.agent === "object" ? { ...(cfg.agent as Record<string, unknown>) } : {};
      agent.reasoning_effort = preset.reasoning;
      const delegation =
        cfg.delegation && typeof cfg.delegation === "object"
          ? { ...(cfg.delegation as Record<string, unknown>) }
          : {};
      delegation.model = preset.delegationModel;
      delegation.reasoning_effort = preset.delegationReasoning;
      if (preset.maxConcurrentChildren) delegation.max_concurrent_children = preset.maxConcurrentChildren;
      const next = { ...cfg, agent, delegation };
      await api.saveConfig(next);
      setConfig(next);
      showToast(cu.tierAppliedToast, "success");
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    } finally {
      setTierBusy(false);
    }
  };

  const runBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await api.runBackup();
      if (res.ok === false) throw new Error(res.error || res.message || "backup");
      showToast(cu.backupStarted, "success");
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    } finally {
      setBackupBusy(false);
    }
  };

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
    api.getAuthMe().then(setMe).catch(() => {});
    api
      .getProfileSoul("default")
      .then((r) => { setSoul(r.content ?? ""); soulLoaded.current = r.content ?? ""; })
      .catch(() => {});
  }, []);

  // Nas seções de settings a barra do provider fica limpa (auto-save, sem
  // toolbar). Nas PÁGINAS (Habilidades/Conectores/Plugins) NÃO limpamos —
  // elas injetam a própria toolbar (busca/Adicionar) via usePageHeader.
  const isPage = PAGE_KEYS.includes(active);
  useEffect(() => {
    if (isPage) return;
    setEnd(null);
    return () => setEnd(null);
  }, [setEnd, isPage]);

  const val = (key: string) => getNestedValue(config ?? {}, key);

  const persist = async (next: Record<string, unknown>) => {
    try {
      await api.saveConfig(next);
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    }
  };
  // Auto-save: grava a config inteira no ato de cada mudança (Bloco 3).
  const update = (key: string, v: unknown) => {
    const next = setNestedValue(config ?? {}, key, v) as Record<string, unknown>;
    setConfig(next);
    void persist(next);
  };

  const saveSoul = async () => {
    if (soul === soulLoaded.current) return;
    try {
      await api.updateProfileSoul("default", soul);
      soulLoaded.current = soul;
      showToast(cu.done, "success");
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    }
  };

  const clearMemory = async () => {
    setBusy(true);
    try {
      await api.resetMemory("all");
      showToast(cu.done, "success");
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const clearSessions = async () => {
    setBusy(true);
    try {
      for (let guard = 0; guard < 200; guard++) {
        const page = await api.getSessions(200, 0);
        const ids = page.sessions.map((s) => s.id);
        if (ids.length === 0) break;
        await api.bulkDeleteSessions(ids);
        if (ids.length < 200) break;
      }
      showToast(cu.done, "success");
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  // Tier padrão ativo — depende de `val` (config carregada acima).
  const currentTier: TierKey | null = tierFromConfig(
    String(val("model") ?? ""),
    String(val("agent.reasoning_effort") ?? "medium"),
  );

  const tzValue = String(val("timezone") ?? "");
  const timezones = useMemo(
    () => (tzValue && !TIMEZONES.includes(tzValue) ? [tzValue, ...TIMEZONES] : TIMEZONES),
    [tzValue],
  );
  const allLocales = Object.entries(LOCALE_META) as Array<[Locale, { name: string }]>;

  // Busca do menu: casa a query com o rótulo da seção E os rótulos dos
  // controles dentro dela (ex.: "fonte"/"tema"/"idioma" acham "Geral";
  // "memória"/"perfil" acham "Privacidade"). v1 simples e útil.
  const q = navQuery.trim().toLowerCase();
  const searchText = (key: SectionKey): string => {
    const p: string[] = [cu[key]];
    if (key === "account") p.push(cu.logout);
    else if (key === "general")
      p.push(cu.language, cu.appearance, cu.font, cu.timezone, cu.instructions, cu.textSize, cu.chatWidth, cu.memoryNotif);
    else if (key === "computer")
      p.push(cu.cloudTab, cu.localTab, cu.resMemory, cu.resDisk, cu.resCpu, cu.backupTitle);
    else if (key === "planTab") p.push(cu.defaultTier, cu.usageTitle, cu.creditsUsed, cu.balanceTitle);
    else if (key === "notificationsTab") p.push(cu.notifyTurnDone, cu.notifyNeedsYou);
    else if (key === "memoryTab") p.push(cu.memoryBetween, cu.userProfile, cu.memoryBudget, cu.clearMemory);
    else if (key === "privacyData") p.push(cu.redactPii, cu.writeApproval, cu.clearSessions);
    return p.join(" ").toLowerCase();
  };
  const matches = (key: SectionKey) => !q || searchText(key).includes(q);
  const visibleSections = SECTIONS.filter((s) => matches(s.key));
  const visiblePages = PAGES.filter((s) => matches(s.key));

  if (!config) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-primary" />
      </div>
    );
  }

  const idLabel = me ? me.display_name || me.email || me.user_id : "";

  return (
    <div className="flex flex-col gap-4 sm:min-h-0 sm:flex-1">
      <Toast toast={toast} />

      <div className="flex flex-col gap-4 sm:min-h-0 sm:flex-1 sm:flex-row sm:overflow-hidden">
        {/* Menu lateral com busca no topo (estilo Claude). */}
        <aside className="sm:w-52 sm:shrink-0 sm:flex sm:min-h-0 sm:flex-col">
          <div className="relative px-1 pb-2 pt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder={t.common.search}
              className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 font-sans text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-live/50"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto p-1 max-sm:scrollbar-none sm:flex-col sm:gap-0.5 sm:overflow-x-hidden">
            {visibleSections.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActive(key)}
                aria-current={active === key ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left font-sans text-sm transition-colors",
                  active === key
                    ? "bg-midground/10 font-medium text-foreground"
                    : "text-text-secondary hover:bg-midground/5 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-70" />
                <span className="flex-1 truncate">{cu[key]}</span>
              </button>
            ))}
            {/* Grupo "Personalizar" — páginas existentes montadas no modal. */}
            {visiblePages.length > 0 && (
              <div className="hidden px-3 pb-1 pt-4 font-sans text-display text-xs tracking-[0.12em] text-text-tertiary sm:block">
                {cu.personalize}
              </div>
            )}
            {visiblePages.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActive(key)}
                aria-current={active === key ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left font-sans text-sm transition-colors",
                  active === key
                    ? "bg-midground/10 font-medium text-foreground"
                    : "text-text-secondary hover:bg-midground/5 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-70" />
                <span className="flex-1 truncate">{cu[key]}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Conteúdo */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:min-h-0 sm:overflow-y-auto">
          {/* ---------- CONTA ---------- */}
          {active === "account" && (
            <Card>
              <CardHeader className="px-5 py-4">
                <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
                  <UserCircle className="h-4 w-4" />
                  {cu.account}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 px-5 pb-5">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-midground/15 font-mono text-sm font-semibold text-foreground/90"
                  >
                    {idLabel ? initialsOf(idLabel) : "•"}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{idLabel || "—"}</div>
                    {me?.email && me.email !== idLabel && (
                      <div className="truncate text-xs text-text-secondary">{me.email}</div>
                    )}
                    <div className="mt-0.5 text-xs text-text-tertiary">{cu.identityNote}</div>
                  </div>
                </div>
                <div className="border-t border-border pt-3">
                  <Button outlined size="sm" prefix={<LogOut className="h-4 w-4" />} onClick={() => void api.logout()}>
                    {cu.logout}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ---------- GERAL ---------- */}
          {active === "general" && (
            <>
              <Card>
                <CardHeader className="px-5 py-4">
                  <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
                    <SlidersHorizontal className="h-4 w-4" />
                    {cu.general}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-5 px-5 pb-5">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm">{cu.language}</span>
                    <span className="text-xs text-text-secondary">{cu.languageNote}</span>
                    <select className={cn(inputCls, "mt-1")} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                      {allLocales.map(([code, meta]) => (
                        <option key={code} value={code}>{meta.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                    <span className="text-sm">{cu.appearance}</span>
                    {/* Galeria com mini-prévia real de cada tema (desktop). */}
                    <div className="mt-1 grid grid-cols-2 gap-3 xl:grid-cols-4">
                      {THEME_PREVIEWS.map((tb) => {
                        const activeTheme = themeName === tb.key;
                        return (
                          <button
                            key={tb.key}
                            type="button"
                            onClick={() => setTheme(tb.key)}
                            aria-pressed={activeTheme}
                            className={cn(
                              "group flex flex-col overflow-hidden rounded-xl border text-left transition-all",
                              activeTheme
                                ? "border-live shadow-card ring-1 ring-live/40"
                                : "border-border hover:border-foreground/30",
                            )}
                          >
                            <span
                              aria-hidden
                              className="block h-20 w-full p-2.5"
                              style={{ backgroundColor: tb.bg }}
                            >
                              <span className="flex h-full gap-2">
                                <span
                                  className="block w-8 shrink-0 rounded-md"
                                  style={{ backgroundColor: tb.surface }}
                                />
                                <span className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                                  <span
                                    className="block h-2 w-3/4 rounded-full"
                                    style={{ backgroundColor: tb.fg, opacity: 0.85 }}
                                  />
                                  <span
                                    className="block h-2 w-1/2 rounded-full"
                                    style={{ backgroundColor: tb.fg, opacity: 0.35 }}
                                  />
                                  <span
                                    className="ml-auto block h-4 w-10 rounded-full"
                                    style={{ backgroundColor: tb.accent }}
                                  />
                                </span>
                              </span>
                            </span>
                            <span className="flex flex-col gap-0.5 border-t border-border bg-card px-3 py-2">
                              <span className="text-sm font-medium text-foreground">
                                {tb.labelKey ? cu[tb.labelKey] : tb.literal}
                              </span>
                              <span className="text-xs text-text-secondary">{cu[tb.descKey]}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Fonte — reusa o seletor de fonte do useTheme (dashboard.font).
                      "Padrão do tema" = a fonte do tema ativo (IBM Plex Sans no
                      tema padrão). As demais persistem mesmo trocando de tema. */}
                  <label className="flex flex-col gap-1.5 border-t border-border pt-4">
                    <span className="text-sm">{cu.font}</span>
                    <select className={cn(inputCls, "mt-1")} value={fontId} onChange={(e) => setFont(e.target.value)}>
                      <option value={THEME_DEFAULT_FONT_ID}>{cu.fontThemeDefault}</option>
                      {fontChoices.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5 border-t border-border pt-4">
                    <span className="text-sm">{cu.timezone}</span>
                    <select className={cn(inputCls, "mt-1")} value={tzValue} onChange={(e) => update("timezone", e.target.value)}>
                      <option value="">{cu.timezoneAuto}</option>
                      {timezones.map((tz) => (
                        <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </label>

                  {/* Transcrição (benchmark Claude Code): tamanho + largura da
                      conversa, ao vivo via CSS vars (lib/chat-display.ts). */}
                  <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                    <span className="text-sm">{cu.textSize}</span>
                    <Segmented<ChatTextSize>
                      value={getChatDisplay().size}
                      options={[
                        { v: "small", label: cu.sizeSmall },
                        { v: "medium", label: cu.sizeMedium },
                        { v: "large", label: cu.sizeLarge },
                      ]}
                      onChange={(v) => { setChatDisplay({ size: v }); bumpPrefs(); }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                    <span className="text-sm">{cu.chatWidth}</span>
                    <Segmented<ChatWidth>
                      value={getChatDisplay().width}
                      options={[
                        { v: "narrow", label: cu.widthNarrow },
                        { v: "medium", label: cu.widthMedium },
                        { v: "wide", label: cu.widthWide },
                      ]}
                      onChange={(v) => { setChatDisplay({ width: v }); bumpPrefs(); }}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="px-5 py-4">
                  <CardTitle className="font-sans text-[15px] font-semibold">{cu.communication}</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <ToggleRow
                    label={cu.memoryNotif}
                    hint={cu.memoryNotifHint}
                    checked={val("display.memory_notifications") !== "off"}
                    onChange={(v) => update("display.memory_notifications", v ? "on" : "off")}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {/* Instruções — movidas da antiga "Personalização" pro Geral
              (como o Claude: perfil + preferências numa aba só). */}
          {active === "general" && (
            <Card>
              <CardHeader className="px-5 py-4">
                <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
                  <Sparkles className="h-4 w-4" />
                  {cu.instructions}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-5 pb-5">
                <span className="text-xs text-text-secondary">{cu.instructionsHint}</span>
                <textarea
                  className="min-h-[160px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-live/50"
                  placeholder={cu.instructionsPlaceholder}
                  value={soul}
                  onChange={(e) => setSoul(e.target.value)}
                  onBlur={() => void saveSoul()}
                  spellCheck={false}
                />
              </CardContent>
            </Card>
          )}

          {/* ---------- MEMÓRIA (benchmark Claude "Capacidades") ---------- */}
          {active === "memoryTab" && (
            <Card>
              <CardHeader className="px-5 py-4">
                <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
                  <Brain className="h-4 w-4" />
                  {cu.memoryTab}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 px-5 pb-5">
                <ToggleRow
                  label={cu.memoryBetween}
                  hint={cu.memoryBetweenHint}
                  checked={val("memory.memory_enabled") !== false}
                  onChange={(v) => update("memory.memory_enabled", v)}
                />
                <ToggleRow
                  border
                  label={cu.userProfile}
                  hint={cu.userProfileHint}
                  checked={val("memory.user_profile_enabled") !== false}
                  onChange={(v) => update("memory.user_profile_enabled", v)}
                />
                {/* Orçamento da memória — memory.memory_char_limit nativo
                    (2200 = padrão do backend, ~800 tokens). */}
                <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                  <span className="text-sm">{cu.memoryBudget}</span>
                  <span className="text-xs text-text-secondary">{cu.memoryBudgetHint}</span>
                  <Segmented<"compact" | "standard" | "ample">
                    value={(() => {
                      const n = Number(val("memory.memory_char_limit") ?? 2200);
                      return n <= 1400 ? "compact" : n >= 3800 ? "ample" : "standard";
                    })()}
                    options={[
                      { v: "compact", label: cu.budgetCompact },
                      { v: "standard", label: cu.budgetStandard },
                      { v: "ample", label: cu.budgetAmple },
                    ]}
                    onChange={(v) =>
                      update("memory.memory_char_limit", v === "compact" ? 1100 : v === "ample" ? 4400 : 2200)
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm">{cu.clearMemory}</span>
                    <span className="text-xs text-text-secondary">{cu.clearMemoryHint}</span>
                  </div>
                  <Button outlined size="sm" disabled={busy} className="text-destructive" onClick={() => setConfirm("memory")}>
                    {cu.clearBtn}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ---------- PRIVACIDADE E DADOS ---------- */}
          {active === "privacyData" && (
            <Card>
              <CardHeader className="px-5 py-4">
                <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
                  <Shield className="h-4 w-4" />
                  {cu.privacyData}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 px-5 pb-5">
                <ToggleRow
                  label={cu.redactPii}
                  hint={cu.redactPiiHint}
                  checked={val("privacy.redact_pii") === true}
                  onChange={(v) => update("privacy.redact_pii", v)}
                />
                {/* memory.write_approval — nativo (nem o desktop expõe): o
                    Wayne pede confirmação antes de gravar memória nova. */}
                <ToggleRow
                  border
                  label={cu.writeApproval}
                  hint={cu.writeApprovalHint}
                  checked={val("memory.write_approval") === true}
                  onChange={(v) => update("memory.write_approval", v)}
                />
                <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm">{cu.clearSessions}</span>
                    <span className="text-xs text-text-secondary">{cu.clearSessionsHint}</span>
                  </div>
                  <Button outlined size="sm" disabled={busy} className="text-destructive" onClick={() => setConfirm("sessions")}>
                    {cu.clearBtn}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ---------- COMPUTADOR (benchmark Manus "My Computer") ---------- */}
          {active === "computer" && (
            <>
              {/* Abas Nuvem/Local — fiel ao Manus. */}
              <div className="flex gap-1 border-b border-border px-1">
                {(["cloud", "local"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setComputerTab(tab)}
                    className={cn(
                      "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                      computerTab === tab
                        ? "border-foreground font-semibold text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab === "cloud" ? cu.cloudTab : cu.localTab}
                  </button>
                ))}
              </div>

              {computerTab === "cloud" ? (
                <>
                  {/* Estado do computador — /api/status */}
                  <Card>
                    <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-5">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span
                          aria-hidden
                          className={cn(
                            "h-2 w-2 rounded-full",
                            sysStatus?.gateway_running ? "bg-live" : "bg-muted-foreground/50",
                          )}
                        />
                        {sysStatus == null ? "…" : sysStatus.gateway_running ? cu.statusOn : cu.statusOff}
                      </span>
                      {stats?.uptime_seconds != null && (
                        <span className="text-xs text-text-secondary">
                          {cu.uptimeLabel}{" "}
                          {stats.uptime_seconds >= 86400
                            ? `${Math.floor(stats.uptime_seconds / 86400)} d`
                            : `${Math.max(1, Math.floor(stats.uptime_seconds / 3600))} h`}
                        </span>
                      )}
                      {sysStatus != null && (
                        <span className="text-xs text-text-secondary">
                          {cu.activeSessionsLabel}: {sysStatus.active_sessions}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-text-tertiary">
                        {cu.alwaysOnNote}
                      </span>
                    </CardContent>
                  </Card>

                  {/* Recursos — /api/system/stats (RAM/CPU/disco = o volume
                      /opt/data do tenant, medido no servidor). */}
                  <Card>
                    <CardHeader className="px-5 py-4">
                      <CardTitle className="font-sans text-[15px] font-semibold">{cu.resourcesTitle}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5 px-5 pb-5">
                      {stats == null ? (
                        <div className="flex justify-center py-6">
                          <Spinner className="text-xl text-primary" />
                        </div>
                      ) : (
                        <>
                          {stats.memory && (
                            <Meter
                              icon={MemoryStick}
                              label={cu.resMemory}
                              detail={`${gb(stats.memory.used)} / ${gb(stats.memory.total)}`}
                              percent={stats.memory.percent}
                            />
                          )}
                          {stats.disk && (
                            <Meter
                              icon={HardDrive}
                              label={cu.resDisk}
                              detail={`${gb(stats.disk.used)} / ${gb(stats.disk.total)}`}
                              percent={stats.disk.percent}
                            />
                          )}
                          <Meter
                            icon={Cpu}
                            label={cu.resCpu}
                            detail={
                              stats.cpu_percent != null
                                ? `${Math.round(stats.cpu_percent)}%${stats.cpu_count ? ` · ${stats.cpu_count} vCPU` : ""}`
                                : stats.cpu_count
                                  ? `${stats.cpu_count} vCPU`
                                  : "—"
                            }
                            percent={stats.cpu_percent ?? null}
                          />
                          {stats.memory && stats.disk && (
                            <p className="border-t border-border pt-3 text-xs text-text-tertiary">
                              {cu.includedPlan}:{" "}
                              {cu.includedSpec
                                .replace("{cpu}", String(stats.cpu_count ?? "—"))
                                .replace("{mem}", gb(stats.memory.total))
                                .replace("{disk}", gb(stats.disk.total))}
                            </p>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Upsell elegante (Manus) — só sinalização; preços = onda
                      de billing. Aparece quando o armazenamento aperta. */}
                  {stats?.disk && stats.disk.percent >= 70 && (
                    <Card className="border-live/40">
                      <CardContent className="flex items-start gap-3 px-5 py-5">
                        <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-live" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">{cu.almostFull}</span>
                          <span className="text-xs text-text-secondary">{cu.almostFullHint}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Segurança — backup completo via /api/ops/backup (zip em
                      /opt/data/backups, visível na tela Arquivos). */}
                  <Card>
                    <CardHeader className="px-5 py-4">
                      <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
                        <Archive className="h-4 w-4" />
                        {cu.backupTitle}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 px-5 pb-5">
                      <span className="max-w-md text-xs text-text-secondary">{cu.backupHint}</span>
                      <span className="flex items-center gap-2">
                        <a
                          href="/files?path=backups"
                          className="flex items-center gap-1 text-xs text-text-secondary underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {cu.backupSee}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <Button outlined size="sm" disabled={backupBusy} onClick={() => void runBackup()}>
                          {backupBusy ? "…" : cu.backupBtn}
                        </Button>
                      </span>
                    </CardContent>
                  </Card>
                </>
              ) : (
                /* Computador local — Em breve (chega com o app desktop). */
                <Card>
                  <CardContent className="flex items-center gap-3 px-5 py-5">
                    <Laptop className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {cu.localTab}
                        <span className="rounded bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                          {t.chat.comingSoon}
                        </span>
                      </span>
                      <span className="text-xs text-text-secondary">{cu.localSoonHint}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ---------- PLANO & UTILIZAÇÃO (Onda C — créditos, nunca US$) ---------- */}
          {active === "planTab" && (
            <>
              {/* Tier PADRÃO da conta — vale pra novas tarefas em todo lugar;
                  no chat continua dando pra trocar por tarefa (TierPicker). */}
              <Card>
                <CardHeader className="px-5 py-4">
                  <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
                    <Gauge className="h-4 w-4" />
                    {cu.defaultTier}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 px-5 pb-5">
                  <span className="text-xs text-text-secondary">{cu.defaultTierHint}</span>
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {TIER_ORDER.map((k) => {
                      const p = TIER_PRESETS[k];
                      const isCur = currentTier === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          disabled={tierBusy}
                          onClick={() => void applyDefaultTier(k)}
                          aria-pressed={isCur}
                          className={cn(
                            "flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left transition-all disabled:opacity-60",
                            isCur
                              ? "border-live bg-live/5 ring-1 ring-live/40"
                              : "border-border hover:border-foreground/30",
                          )}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            {p.label}
                            {isCur && <Check className="h-3.5 w-3.5 text-live" />}
                          </span>
                          <span className="text-xs text-text-secondary">{p.subtitle}</span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Utilização — /api/analytics/usage convertido pra CRÉDITOS. */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
                  <CardTitle className="font-sans text-[15px] font-semibold">{cu.usageTitle}</CardTitle>
                  <span className="text-xs text-text-tertiary">{cu.usagePeriod}</span>
                </CardHeader>
                <CardContent className="flex flex-col gap-5 px-5 pb-5">
                  {usage == null ? (
                    <div className="flex justify-center py-6">
                      <Spinner className="text-xl text-primary" />
                    </div>
                  ) : (
                    (() => {
                      const dayCredits = (d: { estimated_cost: number; actual_cost: number }) =>
                        usdToCredits(d.actual_cost > 0 ? d.actual_cost : d.estimated_cost);
                      const totalCredits = usdToCredits(
                        usage.totals.total_actual_cost > 0
                          ? usage.totals.total_actual_cost
                          : usage.totals.total_estimated_cost,
                      );
                      const days = usage.daily.slice(-14);
                      const maxDay = Math.max(1, ...days.map(dayCredits));
                      const groups = [
                        { label: cu.tierGroupFast, credits: 0 },
                        { label: cu.tierGroupDeep, credits: 0 },
                        { label: cu.tierGroupOther, credits: 0 },
                      ];
                      for (const m of usage.by_model) {
                        const cr = usdToCredits(m.estimated_cost);
                        const name = (m.model || "").toLowerCase();
                        if (/claude|anthropic|opus|sonnet/.test(name)) groups[1].credits += cr;
                        else if (/gemini|deepseek|flash|mistral|llama|qwen|gpt/.test(name))
                          groups[0].credits += cr;
                        else groups[2].credits += cr;
                      }
                      const groupTotal = Math.max(1, groups.reduce((a, g) => a + g.credits, 0));
                      return (
                        <>
                          <div className="flex flex-wrap gap-8">
                            <div className="flex flex-col">
                              <span className="text-2xl font-semibold tabular-nums text-foreground">
                                {formatCredits(totalCredits)}
                              </span>
                              <span className="text-xs text-text-secondary">{cu.creditsUsed}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-2xl font-semibold tabular-nums text-foreground">
                                {formatCredits(usage.totals.total_sessions)}
                              </span>
                              <span className="text-xs text-text-secondary">{cu.sessionsCount}</span>
                            </div>
                          </div>

                          {totalCredits === 0 ? (
                            <p className="text-xs text-text-tertiary">{cu.noUsage}</p>
                          ) : (
                            <>
                              {/* Consumo diário (14 dias) — barras CSS puras. */}
                              <div>
                                <div className="flex h-24 items-end gap-1">
                                  {days.map((d) => {
                                    const cr = dayCredits(d);
                                    return (
                                      <div
                                        key={d.day}
                                        title={`${d.day.slice(8, 10)}/${d.day.slice(5, 7)} · ${formatCredits(cr)} cr`}
                                        className="flex h-full flex-1 items-end"
                                      >
                                        <div
                                          className={cn(
                                            "w-full rounded-t",
                                            cr > 0 ? "bg-live/80" : "bg-muted",
                                          )}
                                          style={{ height: `${Math.max(cr > 0 ? 6 : 2, Math.round((cr / maxDay) * 100))}%` }}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="mt-1 flex gap-1">
                                  {days.map((d) => (
                                    <span
                                      key={d.day}
                                      className="flex-1 text-center text-[10px] tabular-nums text-text-tertiary"
                                    >
                                      {d.day.slice(8, 10)}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Por modo (Flash·Auto / Expert·Crew) — sem expor LLMs. */}
                              <div className="flex flex-col gap-2 border-t border-border pt-4">
                                <span className="text-sm">{cu.byTier}</span>
                                {groups
                                  .filter((g) => g.credits > 0)
                                  .map((g) => (
                                    <div key={g.label} className="flex items-center gap-3">
                                      <span className="w-28 shrink-0 text-xs text-text-secondary">
                                        {g.label}
                                      </span>
                                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                                        <div
                                          className="h-full rounded-full bg-live/70"
                                          style={{ width: `${Math.round((g.credits / groupTotal) * 100)}%` }}
                                        />
                                      </div>
                                      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-text-secondary">
                                        {formatCredits(g.credits)} cr
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </>
                          )}
                        </>
                      );
                    })()
                  )}
                </CardContent>
              </Card>

              {/* Saldo do ciclo — medidor REAL quando a chave do tenant tem
                  teto (usage.account → percentual; faixas 50/75/90 na cor);
                  senão, casca honesta até o plano provisionar o teto. */}
              {cycleMeter?.configured && cycleMeter.used_percent != null ? (
                <Card>
                  <CardHeader className="px-5 py-4">
                    <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
                      <Sparkles className="h-4 w-4" />
                      {cu.balanceTitle}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 px-5 pb-5">
                    <Meter
                      icon={Gauge}
                      label={cu.usageTitle}
                      detail={`${Math.round(cycleMeter.used_percent)}%`}
                      percent={cycleMeter.used_percent}
                    />
                    <span
                      className={cn(
                        "text-xs",
                        cycleMeter.depleted ? "text-destructive" : "text-text-secondary",
                      )}
                    >
                      {cycleMeter.depleted
                        ? cu.cycleDepleted
                        : cu.cyclePercentUsed.replace(
                            "{pct}",
                            String(Math.round(cycleMeter.used_percent)),
                          )}
                    </span>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex items-center gap-3 px-5 py-4">
                    <Sparkles className="h-4 w-4 shrink-0 text-live" />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">{cu.balanceTitle}</span>
                      <span className="text-xs text-text-secondary">{cu.balanceSoon}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ---------- NOTIFICAÇÕES (browser; espelho do desktop) ---------- */}
          {active === "notificationsTab" && (
            <Card>
              <CardHeader className="px-5 py-4">
                <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
                  <Bell className="h-4 w-4" />
                  {cu.notificationsTab}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 px-5 pb-5">
                {typeof Notification !== "undefined" && Notification.permission === "default" && (
                  <div className="flex items-center justify-between gap-4 rounded border border-border bg-muted/40 px-3 py-2.5">
                    <span className="text-xs text-text-secondary">{cu.notifyAllow}</span>
                    <Button
                      outlined
                      size="sm"
                      onClick={() => void Notification.requestPermission().then(() => bumpPrefs())}
                    >
                      {cu.notifyAllowBtn}
                    </Button>
                  </div>
                )}
                {typeof Notification !== "undefined" && Notification.permission === "denied" && (
                  <p className="rounded border border-border bg-muted/40 px-3 py-2.5 text-xs text-text-secondary">
                    {cu.notifyBlocked}
                  </p>
                )}
                <ToggleRow
                  label={cu.notifyTurnDone}
                  hint={cu.notifyTurnDoneHint}
                  checked={isNotifyEnabled("turnDone")}
                  onChange={(v) => { setNotifyKind("turnDone", v); bumpPrefs(); }}
                />
                <ToggleRow
                  border
                  label={cu.notifyNeedsYou}
                  hint={cu.notifyNeedsYouHint}
                  checked={isNotifyEnabled("needsYou")}
                  onChange={(v) => { setNotifyKind("needsYou", v); bumpPrefs(); }}
                />
              </CardContent>
            </Card>
          )}

          {/* ---------- PERSONALIZAR (páginas existentes) ---------- */}
          {active === "skills" && <SkillsPage />}
          {active === "connectors" && <McpPage />}
          {active === "plugins" && <PluginsPage />}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "memory"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void clearMemory()}
        title={cu.clearMemory}
        description={cu.clearMemoryConfirm}
        destructive
        confirmLabel={cu.clearBtn}
      />
      <ConfirmDialog
        open={confirm === "sessions"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void clearSessions()}
        title={cu.clearSessions}
        description={cu.clearSessionsConfirm}
        destructive
        confirmLabel={cu.clearBtn}
      />
    </div>
  );
}
