/**
 * ConnectLinkCard — o Connect Link da Composio vira um CARD de autorização no
 * chat (Conectores Onda 3), em vez de um link solto na prosa.
 *
 * Fluxo: Autorizar → abre a página white-label (popup) → o card sonda
 * /api/connectors/status até uma conta NOVA ficar ACTIVE → "Conectado ✓".
 * Sem reload de sessão: as ferramentas Composio executam server-side, então
 * a conta ativada já vale na conversa em andamento (provado na Onda 0/1).
 *
 * Identidade do app (logo + nome): detectada do PRÓPRIO texto do agente
 * (`context`) casando com o catálogo de conectores. Regra CONSERVADORA — só
 * mostra o app quando exatamente UM app conhecido é citado; senão cai no card
 * genérico. Numa tela de autorização OAuth não podemos mostrar um app errado.
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Plug } from "lucide-react";

import { api } from "@/lib/api";
import type { ConnectorToolkit } from "@/lib/api";
import { useI18n } from "@/i18n";

type Phase = "idle" | "waiting" | "connected";

// Catálogo carregado uma vez por sessão de página (backend já cacheia 6h).
let catalogCache: Promise<ConnectorToolkit[]> | null = null;
function loadCatalog(): Promise<ConnectorToolkit[]> {
  if (!catalogCache) {
    catalogCache = api
      .getConnectorsCatalog()
      .then((r) => r.toolkits)
      .catch(() => []);
  }
  return catalogCache;
}

/** Detecta o app citado no texto — SÓ retorna quando exatamente 1 app conhecido
 *  (nome ≥ 4 chars, palavra inteira) casa. Ambíguo/nenhum → null (genérico). */
function detectApp(text: string, toolkits: ConnectorToolkit[]): ConnectorToolkit | null {
  if (!text) return null;
  const lower = ` ${text.toLowerCase()} `;
  const hits = new Map<string, ConnectorToolkit>();
  for (const tk of toolkits) {
    const name = (tk.name || "").toLowerCase().trim();
    if (name.length < 4) continue;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${esc}\\b`).test(lower)) hits.set(tk.slug, tk);
  }
  return hits.size === 1 ? [...hits.values()][0] : null;
}

function AppTile({ app }: { app: ConnectorToolkit | null }) {
  const [failed, setFailed] = useState(false);
  if (app && app.logo && !failed) {
    return (
      <img
        src={app.logo}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-1.5"
      />
    );
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
      <Plug className="h-4 w-4" />
    </span>
  );
}

export function ConnectLinkCard({ url, context }: { url: string; context?: string }) {
  const { t } = useI18n();
  const tc = t.connectors;
  const [phase, setPhase] = useState<Phase>("idle");
  const [toolkit, setToolkit] = useState<string | null>(null);
  const [app, setApp] = useState<ConnectorToolkit | null>(null);
  const aliveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Detecta o app do texto do agente (conservador — ver detectApp).
  useEffect(() => {
    if (!context) return;
    let alive = true;
    void loadCatalog().then((tks) => {
      if (alive) setApp(detectApp(context, tks));
    });
    return () => {
      alive = false;
    };
  }, [context]);

  const authorize = async () => {
    // Guarda o handle da janela (sem "noopener", senão window.open devolve
    // null) pra fechá-la automaticamente quando a conexão for detectada — a
    // página de sucesso da Composio ("You can close this window now") não fecha
    // sozinha, e o opener pode fechar a janela que abriu mesmo cross-origin.
    const win = window.open(url, "_blank");
    setPhase("waiting");
    let before = new Set<string>();
    try {
      const st = await api.getConnectorsStatus("global");
      before = new Set(
        st.accounts.filter((a) => a.status === "ACTIVE").map((a) => a.id),
      );
    } catch {
      /* segue sem snapshot */
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
            try {
              win?.close();
            } catch {
              /* janela já fechada pelo usuário */
            }
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

  // Título: nome do app detectado > toolkit conectado > genérico. Numa tela de
  // autorização, o nome reflete o que o agente escreveu (mesma fonte).
  const title =
    app?.name ?? (phase === "connected" && toolkit ? toolkit : tc.authTitle);

  return (
    <div className="flex w-full items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3 font-sans shadow-card transition-shadow hover:shadow-pop">
      <AppTile app={app} />
      <span className="min-w-0 flex-1">
        <span className="block truncate type-body font-medium text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block type-caption text-muted-foreground">
          {phase === "waiting" ? tc.waiting : tc.authSecure}
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
