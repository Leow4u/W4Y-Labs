/**
 * ConnectLinkCard — o Connect Link da Composio vira um CARD de autorização no
 * chat (Conectores Onda 3), em vez de um link solto na prosa.
 *
 * Fluxo: Autorizar → abre a página white-label (popup) → o card sonda
 * /api/connectors/status até uma conta NOVA ficar ACTIVE → "Conectado ✓".
 * Sem reload de sessão: as ferramentas Composio executam server-side, então
 * a conta ativada já vale na conversa em andamento (provado na Onda 0/1).
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Plug } from "lucide-react";

import { api } from "@/lib/api";
import { useI18n } from "@/i18n";

type Phase = "idle" | "waiting" | "connected";

export function ConnectLinkCard({ url }: { url: string }) {
  const { t } = useI18n();
  const tc = t.connectors;
  const [phase, setPhase] = useState<Phase>("idle");
  const [toolkit, setToolkit] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const authorize = async () => {
    window.open(url, "_blank", "noopener");
    setPhase("waiting");
    // Snapshot das contas ACTIVE de agora; a que APARECER depois é a nova.
    let before = new Set<string>();
    try {
      const st = await api.getConnectorsStatus("global");
      before = new Set(
        st.accounts.filter((a) => a.status === "ACTIVE").map((a) => a.id),
      );
    } catch {
      /* segue sem snapshot — qualquer ACTIVE serve */
    }
    const poll = (tries: number) => {
      if (!aliveRef.current) return;
      timerRef.current = setTimeout(async () => {
        try {
          const st = await api.getConnectorsStatus("global");
          const fresh = st.accounts.find(
            (a) => a.status === "ACTIVE" && !before.has(a.id),
          );
          if (fresh) {
            setToolkit(fresh.toolkit);
            setPhase("connected");
            return;
          }
        } catch {
          /* tenta de novo */
        }
        if (tries < 34) poll(tries + 1);
        else if (aliveRef.current) setPhase("idle");
      }, 3500);
    };
    poll(0);
  };

  return (
    <div className="flex w-full items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3 font-sans shadow-card transition-shadow hover:shadow-pop">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
        <Plug className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate type-body font-medium text-foreground">
          {phase === "connected" && toolkit ? toolkit : tc.authTitle}
        </span>
        <span className="mt-0.5 block type-caption text-muted-foreground">
          {phase === "waiting" ? tc.waiting : "composio.dev"}
        </span>
      </span>
      {phase === "connected" ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 type-ui font-medium text-live">
          <CheckCircle2 className="h-4 w-4" />
          {tc.connected}
        </span>
      ) : (
        <button
          type="button"
          onClick={authorize}
          disabled={phase === "waiting"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 type-ui font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {phase === "waiting" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="h-3.5 w-3.5" />
          )}
          {tc.authorize}
        </button>
      )}
    </div>
  );
}
