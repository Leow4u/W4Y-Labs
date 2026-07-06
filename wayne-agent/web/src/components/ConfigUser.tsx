/**
 * ConfigUser — Configuração ENXUTA do usuário (benchmark: Manus web).
 * Três seções: Conta · Geral · Personalização — só controles que pertencem
 * ao usuário e têm lastro REAL no sistema (nada inventado; curadoria + 2
 * investigações em docs/CONFIG-CURADORIA.md).
 *
 * Backings reais usados aqui:
 *  - Conta: /api/auth/me (read-only) + api.logout().
 *  - Geral: idioma (useI18n.setLocale, localStorage) · tema (useTheme.setTheme,
 *    4 paletas reais white/mono/cyberpunk/rose) · fuso (config.timezone) ·
 *    avisos de memória (config.display.memory_notifications).
 *  - Personalização: Instruções personalizadas = SOUL.md (updateProfileSoul,
 *    injetado como identidade em toda conversa) · Memória entre conversas
 *    (memory.memory_enabled) · Perfil pessoal (memory.user_profile_enabled).
 *
 * Tela técnica completa (ConfigPage) fica atrás de ?full=1 (nós/suporte).
 * Guardar persiste config + SOUL; tema/idioma persistem no ato (hooks
 * próprios). O auto-save total (removendo Guardar) é o Bloco 3.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { UserCircle, SlidersHorizontal, Sparkles, LogOut } from "lucide-react";
import { Switch } from "@nous-research/ui/ui/components/switch";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@nous-research/ui/ui/components/card";
import { ListItem } from "@nous-research/ui/ui/components/list-item";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { api, type AuthMeResponse } from "@/lib/api";
import { getNestedValue, setNestedValue } from "@/lib/nested";
import { useI18n, LOCALE_META } from "@/i18n";
import type { Locale } from "@/i18n";
import { useTheme } from "@/themes";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn } from "@/lib/utils";

type SectionKey = "account" | "general" | "personalization";
const SECTIONS: Array<{ key: SectionKey; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "account", icon: UserCircle },
  { key: "general", icon: SlidersHorizontal },
  { key: "personalization", icon: Sparkles },
];

/** As 4 paletas REAIS do dashboard (BUILTIN_THEMES). "Escuro" = chave `mono`. */
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
    api.getAuthMe().then(setMe).catch(() => {});
    api
      .getProfileSoul("default")
      .then((r) => { setSoul(r.content ?? ""); soulLoaded.current = r.content ?? ""; })
      .catch(() => {});
  }, []);

  // Barra do provider limpa — o Guardar vive no próprio conteúdo.
  useEffect(() => {
    setEnd(null);
    return () => setEnd(null);
  }, [setEnd]);

  const val = (key: string) => getNestedValue(config ?? {}, key);
  const update = (key: string, v: unknown) =>
    setConfig((c) => setNestedValue(c ?? {}, key, v) as Record<string, unknown>);

  const save = async () => {
    setSaving(true);
    try {
      if (config) await api.saveConfig(config);
      if (soul !== soulLoaded.current) {
        await api.updateProfileSoul("default", soul);
        soulLoaded.current = soul;
      }
      showToast(t.config.configSaved, "success");
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    } finally {
      setSaving(false);
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
                  <Button
                    outlined
                    size="sm"
                    prefix={<LogOut className="h-4 w-4" />}
                    onClick={() => void api.logout()}
                  >
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
                  {/* Idioma */}
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm">{cu.language}</span>
                    <span className="text-xs text-text-secondary">{cu.languageNote}</span>
                    <select
                      className={cn(inputCls, "mt-1")}
                      value={locale}
                      onChange={(e) => setLocale(e.target.value as Locale)}
                    >
                      {allLocales.map(([code, meta]) => (
                        <option key={code} value={code}>
                          {meta.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Tema */}
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

                  {/* Fuso horário */}
                  <label className="flex flex-col gap-1.5 border-t border-border pt-4">
                    <span className="text-sm">{cu.timezone}</span>
                    <select
                      className={cn(inputCls, "mt-1")}
                      value={tzValue}
                      onChange={(e) => update("timezone", e.target.value)}
                    >
                      <option value="">{cu.timezoneAuto}</option>
                      {timezones.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </CardContent>
              </Card>

              {/* Comunicação */}
              <Card>
                <CardHeader className="px-4 py-3">
                  <CardTitle className="text-sm">{cu.communication}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">{cu.memoryNotif}</span>
                      <span className="text-xs text-text-secondary">{cu.memoryNotifHint}</span>
                    </div>
                    <Switch
                      checked={val("display.memory_notifications") !== "off"}
                      onCheckedChange={(v) => update("display.memory_notifications", v ? "on" : "off")}
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ---------- PERSONALIZAÇÃO ---------- */}
          {active === "personalization" && (
            <>
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
                    spellCheck={false}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="px-4 py-3">
                  <CardTitle className="text-sm">{cu.memory}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 px-4 pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">{cu.memoryBetween}</span>
                      <span className="text-xs text-text-secondary">{cu.memoryBetweenHint}</span>
                    </div>
                    <Switch
                      checked={val("memory.memory_enabled") !== false}
                      onCheckedChange={(v) => update("memory.memory_enabled", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">{cu.userProfile}</span>
                      <span className="text-xs text-text-secondary">{cu.userProfileHint}</span>
                    </div>
                    <Switch
                      checked={val("memory.user_profile_enabled") !== false}
                      onCheckedChange={(v) => update("memory.user_profile_enabled", v)}
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Guardar (persiste config + instruções). Tema e idioma já salvam no ato. */}
          <div className="flex justify-end pt-1">
            <Button size="sm" className="uppercase" onClick={save} disabled={saving}>
              {saving ? t.common.saving : t.common.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
