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
import { UserCircle, SlidersHorizontal, Sparkles, Shield, Database, LogOut, Package, Plug, Puzzle } from "lucide-react";
import SkillsPage from "@/pages/SkillsPage";
import McpPage from "@/pages/McpPage";
import PluginsPage from "@/pages/PluginsPage";
import { Switch } from "@nous-research/ui/ui/components/switch";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@nous-research/ui/ui/components/card";
import { ListItem } from "@nous-research/ui/ui/components/list-item";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { ConfirmDialog } from "@nous-research/ui/ui/components/confirm-dialog";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { api, type AuthMeResponse } from "@/lib/api";
import { getNestedValue, setNestedValue } from "@/lib/nested";
import { useI18n, LOCALE_META } from "@/i18n";
import type { Locale } from "@/i18n";
import { useTheme } from "@/themes";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn } from "@/lib/utils";

type SectionKey =
  | "account" | "general" | "personalization" | "privacy" | "dataControl"
  | "skills" | "connectors" | "plugins";
type NavItem = { key: SectionKey; icon: React.ComponentType<{ className?: string }> };

// Grupo "Configurações" — seções enxutas de settings (ConfigUser próprio).
const SECTIONS: NavItem[] = [
  { key: "account", icon: UserCircle },
  { key: "general", icon: SlidersHorizontal },
  { key: "personalization", icon: Sparkles },
  { key: "privacy", icon: Shield },
  { key: "dataControl", icon: Database },
];
// Grupo "Personalizar" — reusa as PÁGINAS existentes (mesmo backing/API),
// montadas aqui no modal como o Claude/Manus fazem. Não são telas novas.
const PAGES: NavItem[] = [
  { key: "skills", icon: Package },
  { key: "connectors", icon: Plug },
  { key: "plugins", icon: Puzzle },
];
const PAGE_KEYS: SectionKey[] = ["skills", "connectors", "plugins"];

const THEME_BUTTONS: Array<{ key: string; labelKey: "themeLight" | "themeDark" | null; literal?: string }> = [
  { key: "white", labelKey: "themeLight" },
  { key: "mono", labelKey: "themeDark" },
  { key: "cyberpunk", labelKey: null, literal: "Cyberpunk" },
  { key: "rose", labelKey: null, literal: "Rosé" },
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
  "h-9 w-full max-w-sm border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

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

export default function ConfigUser() {
  const { t, locale, setLocale } = useI18n();
  const cu = t.configUser;
  const { themeName, setTheme } = useTheme();
  const { setEnd } = usePageHeader();
  const { toast, showToast } = useToast();

  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [soul, setSoul] = useState<string>("");
  const soulLoaded = useRef<string>("");
  const [active, setActive] = useState<SectionKey>("account");
  const [confirm, setConfirm] = useState<null | "memory" | "sessions">(null);
  const [busy, setBusy] = useState(false);

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

  const tzValue = String(val("timezone") ?? "");
  const timezones = useMemo(
    () => (tzValue && !TIMEZONES.includes(tzValue) ? [tzValue, ...TIMEZONES] : TIMEZONES),
    [tzValue],
  );
  const allLocales = Object.entries(LOCALE_META) as Array<[Locale, { name: string }]>;

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
        {/* Menu lateral */}
        <aside className="sm:w-52 sm:shrink-0 sm:flex sm:min-h-0 sm:flex-col">
          <div className="flex gap-1 overflow-x-auto p-1 max-sm:scrollbar-none sm:flex-col sm:gap-px sm:overflow-x-hidden">
            {SECTIONS.map(({ key, icon: Icon }) => (
              <ListItem
                key={key}
                active={active === key}
                onClick={() => setActive(key)}
                className="rounded-none whitespace-nowrap px-2 py-1.5 text-sm"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{cu[key]}</span>
              </ListItem>
            ))}
            {/* Grupo "Personalizar" — páginas existentes montadas no modal. */}
            <div className="hidden sm:block px-2 pb-1 pt-3 font-mondwest text-display text-xs tracking-[0.12em] text-text-tertiary">
              {cu.personalize}
            </div>
            {PAGES.map(({ key, icon: Icon }) => (
              <ListItem
                key={key}
                active={active === key}
                onClick={() => setActive(key)}
                className="rounded-none whitespace-nowrap px-2 py-1.5 text-sm"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{cu[key]}</span>
              </ListItem>
            ))}
          </div>
        </aside>

        {/* Conteúdo */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:min-h-0 sm:overflow-y-auto">
          {/* ---------- CONTA ---------- */}
          {active === "account" && (
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <UserCircle className="h-4 w-4" />
                  {cu.account}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 px-4 pb-4">
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
                <CardHeader className="px-4 py-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <SlidersHorizontal className="h-4 w-4" />
                    {cu.general}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 px-4 pb-4">
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
                    <div className="mt-1 flex flex-wrap gap-2">
                      {THEME_BUTTONS.map((tb) => {
                        const activeTheme = themeName === tb.key;
                        return (
                          <button
                            key={tb.key}
                            type="button"
                            onClick={() => setTheme(tb.key)}
                            className={cn(
                              "min-w-[5.5rem] rounded border px-3 py-2 text-sm transition-colors",
                              activeTheme
                                ? "border-current/60 bg-current/10 font-semibold text-foreground"
                                : "border-border text-muted-foreground hover:bg-current/5",
                            )}
                          >
                            {tb.labelKey ? cu[tb.labelKey] : tb.literal}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex flex-col gap-1.5 border-t border-border pt-4">
                    <span className="text-sm">{cu.timezone}</span>
                    <select className={cn(inputCls, "mt-1")} value={tzValue} onChange={(e) => update("timezone", e.target.value)}>
                      <option value="">{cu.timezoneAuto}</option>
                      {timezones.map((tz) => (
                        <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="px-4 py-3">
                  <CardTitle className="text-sm">{cu.communication}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
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

          {/* ---------- PERSONALIZAÇÃO ---------- */}
          {active === "personalization" && (
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4" />
                  {cu.instructions}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-4 pb-4">
                <span className="text-xs text-text-secondary">{cu.instructionsHint}</span>
                <textarea
                  className="min-h-[160px] w-full resize-y border border-input bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder={cu.instructionsPlaceholder}
                  value={soul}
                  onChange={(e) => setSoul(e.target.value)}
                  onBlur={() => void saveSoul()}
                  spellCheck={false}
                />
              </CardContent>
            </Card>
          )}

          {/* ---------- PRIVACIDADE ---------- */}
          {active === "privacy" && (
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4" />
                  {cu.privacy}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 px-4 pb-4">
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
                <ToggleRow
                  border
                  label={cu.redactPii}
                  hint={cu.redactPiiHint}
                  checked={val("privacy.redact_pii") === true}
                  onChange={(v) => update("privacy.redact_pii", v)}
                />
              </CardContent>
            </Card>
          )}

          {/* ---------- CONTROLE DE DADOS ---------- */}
          {active === "dataControl" && (
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Database className="h-4 w-4" />
                  {cu.dataControl}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 px-4 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm">{cu.clearMemory}</span>
                    <span className="text-xs text-text-secondary">{cu.clearMemoryHint}</span>
                  </div>
                  <Button outlined size="sm" disabled={busy} className="text-destructive" onClick={() => setConfirm("memory")}>
                    {cu.clearBtn}
                  </Button>
                </div>
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
