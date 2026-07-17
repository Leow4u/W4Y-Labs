/**
 * UseCaseCarousel — the top strip of the Plugins hub (benchmark Manus): ~6 USE
 * cards. Each card is a TASK that Wayne runs with the integration — clicking
 * OPENS the task in the chat with the prompt already filled in
 * (`/chat?ask=<prompt>`), it does not merely connect: if the app is not
 * connected, the agent itself drives the connect-through-chat flow. Compact
 * cards, curated on the client, mapped to a real connector (logo + connected
 * state). Edge fade via CardRow.
 */
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ConnectorAccount, ConnectorToolkit } from "@/lib/api";
import { useI18n } from "@/i18n";
import { stateOf } from "@/hooks/useConnectors";
import { LogoTile } from "@/components/connectors/ConnectorCard";
import { CardRow } from "@/components/hub/CardRow";

export function UseCaseCarousel({
  toolkits,
  byToolkit,
}: {
  toolkits: ConnectorToolkit[];
  byToolkit: Map<string, ConnectorAccount[]>;
}) {
  const { t } = useI18n();
  const tp = t.pluginsHub;
  const navigate = useNavigate();

  // Curated use cases: title (the TASK) + ready prompt + the app that enables it.
  const USE_CASES: { app: string; title: string; prompt: string }[] = [
    { app: "Gmail", title: tp.ucEmail, prompt: tp.promptEmail },
    { app: "Google Calendar", title: tp.ucCalendar, prompt: tp.promptCalendar },
    { app: "Slack", title: tp.ucSlack, prompt: tp.promptSlack },
    { app: "Notion", title: tp.ucNotion, prompt: tp.promptNotion },
    { app: "GitHub", title: tp.ucGithub, prompt: tp.promptGithub },
    { app: "Google Sheets", title: tp.ucSheets, prompt: tp.promptSheets },
  ];

  const byName = new Map(toolkits.map((tk) => [tk.name.toLowerCase(), tk]));
  const items = USE_CASES.map((uc) => ({ uc, tk: byName.get(uc.app.toLowerCase()) })).filter(
    (x): x is { uc: (typeof USE_CASES)[number]; tk: ConnectorToolkit } => Boolean(x.tk),
  );
  if (items.length === 0) return null;

  return (
    <CardRow fade>
      {items.map(({ uc, tk }) => {
        const connected = stateOf(byToolkit.get(tk.slug.toLowerCase()) || []) === "connected";
        return (
          <button
            key={tk.slug}
            type="button"
            onClick={() => navigate(`/chat?ask=${encodeURIComponent(uc.prompt)}`)}
            title={uc.prompt}
            className="group flex h-[138px] w-[220px] shrink-0 snap-start flex-col justify-between rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <LogoTile toolkit={tk} />
                {connected && <CheckCircle2 className="h-3.5 w-3.5 text-live" />}
              </div>
              <div className="line-clamp-2 type-body font-medium leading-snug text-foreground">
                {uc.title}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 type-ui text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-foreground">
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        );
      })}
    </CardRow>
  );
}
