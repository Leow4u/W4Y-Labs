/**
 * SkillMarketplace — a visão de Habilidades do USUÁRIO (decisão Leonardo 10/07):
 * um marketplace navegável do catálogo OFICIAL (as 102 optional-skills locais),
 * por CATEGORIA + filtro + busca, com Instalar/Instalado/Remover. Nomes e
 * descrições ORIGINAIS (sem tradução/rótulo amigável — só o chrome é i18n).
 *
 * As 72 skills ativas ("do sistema") NÃO aparecem aqui e não são desativáveis
 * pelo usuário — ficam no ?full=1 (nós). Reusa /api/skills/hub/catalog (novo,
 * lê optional-skills/ do disco) + install/uninstall + o polling de ação.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Coins,
  Database,
  Download,
  Gamepad2,
  Globe,
  HeartPulse,
  Loader2,
  Package,
  Paintbrush,
  Search,
  Shield,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import type { SkillHubInstalledEntry, SkillHubResult } from "@/lib/api";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Input } from "@nous-research/ui/ui/components/input";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

const CAT_ICON: Record<string, LucideIcon> = {
  general: Package,
  blockchain: Coins,
  crypto: Coins,
  finance: Wallet,
  payments: Wallet,
  gaming: Gamepad2,
  health: HeartPulse,
  security: Shield,
  "red-teaming": Shield,
  mcp: Globe,
  web: Globe,
  data: Database,
  "data-science": Database,
  mlops: Bot,
  ml: Bot,
  ai: Bot,
  agent: Bot,
  creative: Paintbrush,
  design: Paintbrush,
  productivity: Zap,
  automation: Zap,
};

function catIcon(cat?: string): LucideIcon {
  const c = (cat || "general").toLowerCase();
  if (CAT_ICON[c]) return CAT_ICON[c];
  for (const [key, icon] of Object.entries(CAT_ICON)) if (c.includes(key)) return icon;
  return Wrench;
}

/** Título-case do slug da categoria (SEM traduzir — só apresentação). */
function prettyCat(cat: string, generalLabel: string): string {
  if (!cat || cat === "general") return generalLabel;
  return cat
    .split(/[-_/]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function SkillMarketplace({ profile }: { profile?: string }) {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillHubResult[]>([]);
  const [installed, setInstalled] = useState<Record<string, SkillHubInstalledEntry>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  // identifier -> operação em andamento (só "install"; remover ficou de fora).
  const [busy, setBusy] = useState<Record<string, "install">>({});
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .getSkillHubCatalog(profile)
      .then((r) => {
        if (!aliveRef.current) return;
        setSkills(r.skills);
        setInstalled(r.installed);
      })
      .catch(() => {})
      .finally(() => aliveRef.current && setLoading(false));
  }, [profile]);

  const refetchInstalled = () => {
    api
      .getSkillHubCatalog(profile)
      .then((r) => aliveRef.current && setInstalled(r.installed))
      .catch(() => {});
  };

  const clearBusy = (id: string) =>
    setBusy((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });

  // Poll a ação de install/uninstall até parar; então atualiza o "installed".
  const pollAction = (name: string, id: string) => {
    let tries = 0;
    const tick = async () => {
      try {
        const st = await api.getActionStatus(name, 5);
        if (!aliveRef.current) return;
        if (st.running && tries++ < 400) {
          setTimeout(tick, 1500);
          return;
        }
      } catch {
        /* ignore — cai no finally abaixo */
      }
      refetchInstalled();
      clearBusy(id);
    };
    setTimeout(tick, 1200);
  };

  const install = (r: SkillHubResult) => {
    setBusy((p) => ({ ...p, [r.identifier]: "install" }));
    api
      .installSkillFromHub(r.identifier, profile)
      .then((res) => pollAction(res.name, r.identifier))
      .catch(() => clearBusy(r.identifier));
  };

  // Remover ficou de fora por ora: o CLI `wayne skills uninstall` não tem modo
  // não-interativo (pede confirmação por input() e nem aceita --yes), então
  // desinstalar via ação headless sempre falha. Decisão do Leonardo: deixar o
  // marketplace só com instalar até isso ser tratado no backend.

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of skills) {
      const c = s.category || "general";
      m.set(c, (m.get(c) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills]);

  const lower = search.trim().toLowerCase();
  const shown = useMemo(() => {
    return skills.filter((s) => {
      if (activeCat && (s.category || "general") !== activeCat) return false;
      if (!lower) return true;
      return (
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower) ||
        (s.tags || []).some((tag) => tag.toLowerCase().includes(lower))
      );
    });
  }, [skills, activeCat, lower]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra: categorias (esq) + busca (dir). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <Chip
            label={`${t.configUser.skAll} (${skills.length})`}
            active={!activeCat}
            onClick={() => setActiveCat(null)}
          />
          {categories.map(([c, n]) => (
            <Chip
              key={c}
              label={`${prettyCat(c, t.common.general)} (${n})`}
              active={activeCat === c}
              onClick={() => setActiveCat(activeCat === c ? null : c)}
            />
          ))}
        </div>
        <div className="relative w-44 shrink-0 sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder={t.configUser.skBrowse}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Grade de cards (nomes ORIGINAIS). */}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          {t.skills.noSkillsMatch}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((r) => {
            const isInstalled = Boolean(installed[r.identifier]);
            const op = busy[r.identifier];
            const Icon = catIcon(r.category);
            return (
              <div
                key={r.identifier}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-shadow hover:shadow-pop"
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono-ui text-sm text-foreground">{r.name}</span>
                    {r.category && r.category !== "general" && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 type-micro text-muted-foreground">
                        {prettyCat(r.category, t.common.general)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {r.description}
                  </p>
                </div>
                <div className="shrink-0 pt-0.5">
                  {op === "install" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 type-ui text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t.skills.installing}
                    </span>
                  ) : isInstalled ? (
                    <span className="inline-flex items-center gap-1 type-ui text-live">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t.skills.installed}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => install(r)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 type-ui font-medium text-background transition-opacity hover:opacity-90"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t.skills.install}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground/90 text-background"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
