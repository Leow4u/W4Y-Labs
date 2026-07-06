/**
 * ConfigUser — a Configuração ENXUTA que o usuário final vê (Bloco 2 da
 * curadoria). Estilo Claude: menu lateral (Geral / Aparência / Memória) +
 * conteúdo, com apenas os controles que pertencem ao usuário.
 *
 * Da curadoria dos 480 campos do config.yaml, só 3 são do usuário — Fuso
 * horário, Memória entre conversas e Perfil pessoal — mais o Tema (que já
 * vivia no card de Aparência). Todo o resto é sistema e fica na tela técnica
 * (ConfigPage), acessível só por nós/suporte via `?full=1`.
 *
 * Escreve nos MESMOS campos do config.yaml (`timezone`, `memory.*`); carrega
 * o config inteiro e devolve inteiro no Guardar, preservando tudo mais.
 * Todos os rótulos vêm do i18n (t.configUser), nos 16 idiomas.
 */
import { useEffect, useMemo, useState } from "react";
import { Settings, Palette, Brain } from "lucide-react";
import { Switch } from "@nous-research/ui/ui/components/switch";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@nous-research/ui/ui/components/card";
import { ListItem } from "@nous-research/ui/ui/components/list-item";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { api } from "@/lib/api";
import { getNestedValue, setNestedValue } from "@/lib/nested";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn } from "@/lib/utils";

type SectionKey = "general" | "appearance" | "memory";
const SECTIONS: Array<{ key: SectionKey; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "general", icon: Settings },
  { key: "appearance", icon: Palette },
  { key: "memory", icon: Brain },
];

/** Lista IANA de fusos (nativa do browser); vazia = "automático". */
const TIMEZONES: string[] = (() => {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    return fn ? fn("timeZone") : [];
  } catch {
    return [];
  }
})();

export default function ConfigUser() {
  const { t } = useI18n();
  const cu = t.configUser;
  const { setEnd } = usePageHeader();
  const { toast, showToast } = useToast();
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [active, setActive] = useState<SectionKey>("general");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
  }, []);

  // A tela técnica injeta busca/Guardar no header via setEnd; aqui a barra é
  // limpa (a tela enxuta tem o Guardar dentro do próprio conteúdo).
  useEffect(() => {
    setEnd(null);
    return () => setEnd(null);
  }, [setEnd]);

  const val = (key: string) => getNestedValue(config ?? {}, key);
  const update = (key: string, v: unknown) =>
    setConfig((c) => setNestedValue(c ?? {}, key, v) as Record<string, unknown>);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.saveConfig(config);
      showToast(t.config.configSaved, "success");
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const tzValue = String(val("timezone") ?? "");
  // Se o fuso salvo não estiver na lista do browser, ainda o oferecemos.
  const timezones = useMemo(() => {
    if (tzValue && !TIMEZONES.includes(tzValue)) return [tzValue, ...TIMEZONES];
    return TIMEZONES;
  }, [tzValue]);

  if (!config) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:min-h-0 sm:flex-1">
      <Toast toast={toast} />

      <div className="flex flex-col gap-4 sm:min-h-0 sm:flex-1 sm:flex-row sm:overflow-hidden">
        {/* Menu lateral de secções */}
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

        {/* Conteúdo da secção activa */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:min-h-0 sm:overflow-y-auto">
          {active === "general" && (
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Settings className="h-4 w-4" />
                  {cu.general}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm">{cu.timezone}</span>
                  <span className="text-xs text-text-secondary">{cu.timezoneHint}</span>
                  <select
                    value={tzValue}
                    onChange={(e) => update("timezone", e.target.value)}
                    className={cn(
                      "mt-1 h-9 w-full max-w-sm border border-input bg-transparent px-2 text-sm",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    )}
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
          )}

          {active === "appearance" && (
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Palette className="h-4 w-4" />
                  {cu.appearance}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <span className="mb-2 block text-sm">{t.theme?.title ?? cu.appearance}</span>
                <ThemeSwitcher />
              </CardContent>
            </Card>
          )}

          {active === "memory" && (
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Brain className="h-4 w-4" />
                  {cu.memory}
                </CardTitle>
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
          )}

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
