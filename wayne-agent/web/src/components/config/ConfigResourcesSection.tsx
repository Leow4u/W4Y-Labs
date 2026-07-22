/**
 * Config → Recursos (Fase 10 · PR-3 / Onda A5b).
 * Permissões + lista do que está ligado · link-out para Integrações.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Package, Plug, Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@nous-research/ui/ui/components/card";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { useI18n } from "@/i18n";
import { useConnectors, stateOf } from "@/hooks/useConnectors";
import { useToast } from "@nous-research/ui/hooks/use-toast";

export function ConfigResourcesSection() {
  const { t } = useI18n();
  const cu = t.configUser;
  const { showToast } = useToast();
  const c = useConnectors(showToast);

  const connected = useMemo(() => {
    const out: { name: string; slug: string }[] = [];
    for (const tk of c.toolkits) {
      const accounts = c.byToolkit.get(tk.slug.toLowerCase()) ?? [];
      if (stateOf(accounts) === "connected") {
        out.push({ name: tk.name, slug: tk.slug });
      }
    }
    return out.slice(0, 8);
  }, [c.toolkits, c.byToolkit]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">{cu.resourcesIntro}</p>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
          <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
            <Plug className="h-4 w-4" />
            {cu.resourcesConnectors}
          </CardTitle>
          <Link
            to="/integrations?tab=connectors"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50"
          >
            {cu.goToIntegrations}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {c.loading ? (
            <div className="flex justify-center py-6">
              <Spinner className="text-xl text-primary" />
            </div>
          ) : connected.length === 0 ? (
            <p className="text-sm text-muted-foreground">{cu.resourcesEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {connected.map(({ name, slug }) => (
                <li
                  key={slug}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span>{name}</span>
                  <span className="text-xs text-live">{cu.resourcesConnected}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
          <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
            <Package className="h-4 w-4" />
            {cu.resourcesSkills}
          </CardTitle>
          <Link
            to="/integrations?tab=skills"
            className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50"
          >
            {cu.goToIntegrations}
          </Link>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <p className="text-sm text-muted-foreground">{cu.resourcesSkillsHint}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
          <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
            <Radio className="h-4 w-4" />
            {cu.resourcesChannels}
          </CardTitle>
          <Link
            to="/integrations?tab=channels"
            className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50"
          >
            {cu.goToIntegrations}
          </Link>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <p className="text-sm text-muted-foreground">{cu.resourcesChannelsHint}</p>
        </CardContent>
      </Card>
    </div>
  );
}
