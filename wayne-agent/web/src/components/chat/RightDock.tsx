/**
 * RightDock v2 — o "Computador do Wayne" (benchmark Codex desktop + Manus web,
 * decidido em 09/07 com o mapa dos batedores: os prints do rail são do Codex;
 * o Hermes tem panes soltos; NOSSO backend web já tem a suíte git REST
 * completa, preview com mime real e screenshots do navegador do agente).
 *
 * Header de ÍCONES estilo Codex: [fixar resumo] · abas [Ambiente · Pré-
 * visualização · Código · Arquivos · Alterações · Projeto] · [fechar].
 * Terminal NÃO existe na web (decisão de produto — o terminal técnico segue
 * no ?full=1 interno; o "computador na nuvem" aparece por estas janelas).
 *
 *   Ambiente      todo vivo, subagentes (identicon pixel), navegador com
 *                 TÍTULO + screenshot real, fontes com favicon, churn
 *   Pré-visual.   iframe de .html do workspace (mime real via
 *                 /api/fs/read-data-url) + toggle desktop/celular + barra
 *   Código        fonte do arquivo em mono, copiar
 *   Arquivos      navegador REAL do workspace (abrir .html → Preview)
 *   Alterações    git REAL quando o projeto é repo (status/stage/commit/
 *                 push/PR com confirmação dupla); senão diffs das ferramentas
 *   Projeto       instruções (AGENTS.md) do workspace ativo
 *
 * Fechado: punho na borda; com atividade, chip "Ambiente · resumo" com ponto
 * vivo. Auto-abre na 1ª vez que um turno roda com conteúdo (pref localStorage).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Circle,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileDiff,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Globe,
  Home,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorSmartphone,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  RefreshCw,
  RotateCcw,
  Settings2,
  Smartphone,
  SquareArrowOutUpRight,
  Users,
  XCircle,
} from "lucide-react";

import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import { useI18n } from "@/i18n";
import {
  api,
  type CronJob,
  type GitRepoStatus,
  type GitReviewFile,
  type ManagedFileEntry,
} from "@/lib/api";
import type { SubagentInfo } from "@/hooks/useChatSession";
import type { TaskStep } from "./types";
import { DiffView } from "./ToolLine";

export interface DockChange {
  path: string;
  diff: string;
}
export interface DockUrl {
  url: string;
  domain: string;
  title?: string;
  shot?: string;
}
export interface DockEnvFile {
  path: string;
  added: number;
  removed: number;
}

const PREF_KEY = "wayne:right-dock";
const PIN_KEY = "wayne:dock-pin";
const WIDTH_KEY = "wayne:dock-width";

const MIN_W = 300;
const maxW = () => Math.min(920, Math.round(window.innerWidth * 0.7));
const clampW = (w: number) => Math.max(MIN_W, Math.min(maxW(), w));

/** Os diffs do gateway nomeiam arquivos relativos ao cwd DA FERRAMENTA
 *  (ex.: "data/x.html" p/ /opt/data/x.html); o files API espera absoluto ou
 *  relativo ao ROOT gerenciado. Gera candidatos e o chamador tenta em ordem. */
function pathCandidates(path: string): string[] {
  const out = [path];
  if (!path.startsWith("/")) {
    const parts = path.split("/");
    if (parts.length > 1) out.push(parts.slice(1).join("/")); // tira "data/"
    out.push(`/opt/${path}`);
  }
  return [...new Set(out)];
}

async function readDataUrlSmart(path: string): Promise<string | null> {
  for (const p of pathCandidates(path)) {
    try {
      const r = await api.readFileDataUrl(p);
      const d = r.dataUrl ?? r.data_url;
      if (d) return d;
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

async function readTextSmart(path: string): Promise<string | null> {
  for (const p of pathCandidates(path)) {
    try {
      const r = await api.readFile(p);
      const [meta, b64] = r.data_url.split(",", 2);
      if (/base64/.test(meta) && b64) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return new TextDecoder("utf-8").decode(bytes);
      }
      return "";
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

type DockTab = "env" | "preview" | "code" | "files" | "changes" | "project";

/* ── átomos ──────────────────────────────────────────────────────────── */

/** Identicon pixel 5×5 determinístico — identidade visual dos subagentes
 *  (benchmark Codex; nem o desktop tem — geramos client-side, zero backend). */
function PixelAvatar({ seed, size = 16 }: { seed: string; size?: number }) {
  const cells = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const hue = Math.abs(h) % 360;
    const bits: boolean[] = [];
    let x = Math.abs(h) || 1;
    for (let i = 0; i < 15; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      bits.push(x % 100 < 52);
    }
    // 5×5 com simetria horizontal (colunas 0-2 espelham em 4-3).
    const grid: boolean[] = [];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) grid.push(bits[r * 3 + (c > 2 ? 4 - c : c)]);
    return { hue, grid };
  }, [seed]);
  const cell = size / 5;
  return (
    <span
      aria-hidden
      className="grid shrink-0 overflow-hidden rounded-[4px]"
      style={{
        width: size,
        height: size,
        gridTemplateColumns: `repeat(5, ${cell}px)`,
        backgroundColor: `hsl(${cells.hue} 30% 92%)`,
      }}
    >
      {cells.grid.map((on, i) => (
        <span
          key={i}
          style={{
            width: cell,
            height: cell,
            backgroundColor: on ? `hsl(${cells.hue} 52% 48%)` : "transparent",
          }}
        />
      ))}
    </span>
  );
}

/** Favicon de domínio com fallback pro globo (benchmark Codex "Fontes"). */
function Favicon({ domain, size = 16 }: { domain: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Globe className="h-4 w-4 text-muted-foreground/60" />;
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
      alt=""
      width={size}
      height={size}
      className="rounded"
      onError={() => setFailed(true)}
    />
  );
}

function SectionTitle({ icon: Icon, label }: { icon: typeof Globe; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span className="type-caption font-medium uppercase tracking-[0.05em]">{label}</span>
    </div>
  );
}

/** Botão de ação destrutiva/mutante com confirmação em DOIS toques. */
function ArmedButton({
  label,
  confirmLabel,
  onFire,
  disabled,
  primary,
}: {
  label: string;
  confirmLabel: string;
  onFire: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onFire();
        } else setArmed(true);
      }}
      className={`rounded-lg px-3 py-1.5 type-ui font-medium transition-colors disabled:opacity-40 ${
        armed
          ? "bg-warning/15 text-warning"
          : primary
            ? "bg-foreground text-background hover:opacity-90"
            : "border border-border bg-background text-foreground hover:bg-muted"
      }`}
      title={armed ? confirmLabel : label}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

function fmtElapsed(startedAt: number, durationS?: number): string {
  const s = durationS ?? (Date.now() - startedAt) / 1000;
  if (s < 60) return `${Math.max(1, Math.round(s))}s`;
  return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

/* ── Ambiente ────────────────────────────────────────────────────────── */

function EnvSections({
  busy,
  steps,
  subagents,
  urls,
  envFiles,
  added,
  removed,
  compact,
}: {
  busy: boolean;
  steps: TaskStep[];
  subagents: SubagentInfo[];
  urls: DockUrl[];
  envFiles: DockEnvFile[];
  added: number;
  removed: number;
  /** Modo "resumo fixado": 1 linha por seção. */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [showAllAgents, setShowAllAgents] = useState(false);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const lastUrl = urls[urls.length - 1];
  const domains = [...new Set(urls.map((u) => u.domain))];

  // Screenshot do navegador do agente — lazy via /api/media (PNG do cache).
  useEffect(() => {
    setShotUrl(null);
    const shot = lastUrl?.shot;
    if (!shot || compact) return;
    let cancelled = false;
    void api
      .getMedia(shot)
      .then((r) => {
        if (!cancelled) setShotUrl(r.data_url ?? r.dataUrl ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lastUrl?.shot, compact]);

  // relógio p/ tempos vivos
  const [, tick] = useState(0);
  const anyRunning = subagents.some((s) => s.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  if (compact) {
    const bits: string[] = [];
    if (steps.length > 0)
      bits.push(`${steps.filter((s) => s.status === "completed").length}/${steps.length}`);
    if (subagents.length > 0) bits.push(`${subagents.length} ${t.chat.envAgents.toLowerCase()}`);
    if (added + removed > 0) bits.push(`+${added} −${removed}`);
    if (domains.length > 0) bits.push(domains[domains.length - 1]);
    return (
      <div className="flex items-center gap-2 border-b border-border/70 bg-muted/30 px-3 py-1.5">
        {busy ? (
          <span className="relative grid h-3 w-3 shrink-0 place-items-center">
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-live/40" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
          </span>
        ) : (
          <Monitor className="h-3 w-3 shrink-0 text-muted-foreground/70" />
        )}
        <span className="min-w-0 flex-1 truncate type-caption tabular-nums text-muted-foreground">
          {bits.length > 0 ? bits.join(" · ") : t.chat.envTitle}
        </span>
      </div>
    );
  }

  const shownAgents = showAllAgents ? subagents : subagents.slice(0, 6);

  return (
    <div className="min-h-0 space-y-4 overflow-y-auto px-3.5 py-3">
      {steps.length > 0 && (
        <section className="space-y-1.5">
          <SectionTitle icon={Check} label={t.chat.envTasks} />
          <div className="space-y-1">
            {steps.map((s) => (
              <div key={s.id} className="flex items-start gap-1.5 type-caption">
                {s.status === "completed" ? (
                  <Check className="mt-px h-3 w-3 shrink-0 text-success" />
                ) : s.status === "in_progress" ? (
                  <Loader2 className="mt-px h-3 w-3 shrink-0 animate-spin text-live" />
                ) : s.status === "cancelled" ? (
                  <XCircle className="mt-px h-3 w-3 shrink-0 text-muted-foreground/50" />
                ) : (
                  <Circle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                )}
                <span
                  className={
                    s.status === "completed"
                      ? "text-muted-foreground line-through decoration-border"
                      : s.status === "in_progress"
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                  }
                >
                  {s.content}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {subagents.length > 0 && (
        <section className="space-y-1.5">
          <SectionTitle icon={Users} label={t.chat.envAgents} />
          <div className="space-y-1">
            {shownAgents.map((a) => (
              <div key={a.id} className="flex items-center gap-2 type-caption">
                <PixelAvatar seed={a.id} />
                {a.status === "running" ? (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-live" />
                ) : a.status === "error" ? (
                  <XCircle className="h-3 w-3 shrink-0 text-destructive" />
                ) : (
                  <Check className="h-3 w-3 shrink-0 text-success" />
                )}
                <span className="min-w-0 flex-1 truncate text-foreground">{a.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground/70">
                  {fmtElapsed(a.startedAt, a.durationS)}
                </span>
              </div>
            ))}
            {subagents.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllAgents((v) => !v)}
                className="type-caption text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                {showAllAgents
                  ? t.chat.showLess
                  : `${t.chat.showMore} ${subagents.length - 6}`}
              </button>
            )}
          </div>
        </section>
      )}

      {lastUrl && (
        <section className="space-y-1.5">
          <SectionTitle icon={Globe} label={t.chat.envBrowser} />
          <a
            href={lastUrl.url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-foreground/25"
          >
            {shotUrl && (
              <img src={shotUrl} alt="" className="max-h-36 w-full border-b border-border object-cover object-top" />
            )}
            <span className="flex items-center gap-2 px-2.5 py-2">
              <Favicon domain={lastUrl.domain} />
              <span className="min-w-0 flex-1">
                <span className="block truncate type-caption font-medium text-foreground">
                  {lastUrl.title || lastUrl.domain}
                </span>
                <span className="block truncate type-micro text-muted-foreground">
                  {lastUrl.url}
                </span>
              </span>
            </span>
          </a>
        </section>
      )}

      {domains.length > 1 && (
        <section className="space-y-1.5">
          <SectionTitle icon={Globe} label={t.chat.envSources} />
          <div className="flex flex-wrap gap-1.5">
            {domains.slice(0, 12).map((d) => (
              <span
                key={d}
                title={d}
                className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-background"
              >
                <Favicon domain={d} />
              </span>
            ))}
            {domains.length > 12 && (
              <span className="self-center type-micro text-muted-foreground/70">
                +{domains.length - 12}
              </span>
            )}
          </div>
        </section>
      )}

      {envFiles.length > 0 && (
        <section className="space-y-1.5">
          <SectionTitle icon={FileDiff} label={t.chat.envChanges} />
          {added + removed > 0 && (
            <div className="type-caption tabular-nums">
              <span className="font-medium text-success">+{added}</span>{" "}
              <span className="font-medium text-destructive">−{removed}</span>
            </div>
          )}
          <div className="space-y-0.5">
            {envFiles.slice(-4).reverse().map((f) => (
              <div key={f.path} className="flex items-center gap-2 type-micro">
                <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                  {f.path.split(/[/\\]/).pop()}
                </span>
                {f.added + f.removed > 0 && (
                  <span className="shrink-0 tabular-nums">
                    <span className="text-success">+{f.added}</span>{" "}
                    <span className="text-destructive">−{f.removed}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── Pré-visualização ────────────────────────────────────────────────── */

const PREVIEWABLE_RE = /\.(html?|svg|png|jpe?g|gif|webp|pdf)$/i;

function PreviewTab({
  path,
  onOpenCode,
}: {
  path: string | null;
  onOpenCode: (p: string) => void;
}) {
  const { t } = useI18n();
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void readDataUrlSmart(path)
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Barra do navegador do preview (benchmark Manus: home · caminho ·
          abrir fora · atualizar + desktop/celular). */}
      <div className="flex items-center gap-1 border-b border-border/70 px-2 py-1.5">
        <Home className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span
          className="min-w-0 flex-1 truncate rounded-md bg-muted/50 px-2 py-1 font-mono type-micro text-muted-foreground"
          title={path ?? "/"}
        >
          {path ? `/${path.split(/[/\\]/).slice(-2).join("/")}` : "/"}
        </span>
        <button
          type="button"
          onClick={() => setDevice((d) => (d === "desktop" ? "mobile" : "desktop"))}
          title={device === "desktop" ? t.chat.previewMobile : t.chat.previewDesktop}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {device === "desktop" ? (
            <Smartphone className="h-3.5 w-3.5" />
          ) : (
            <MonitorSmartphone className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          disabled={!path}
          title={t.common.refresh}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button
          type="button"
          onClick={() => path && onOpenCode(path)}
          disabled={!path}
          title={t.chat.dockCode}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <Code2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!dataUrl) return;
            const win = window.open("about:blank", "_blank");
            if (win) win.location.href = dataUrl;
          }}
          disabled={!dataUrl}
          title={t.chat.openNewTab}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-2">
        {!path ? (
          <p className="px-3 py-6 text-center type-caption text-muted-foreground/70">
            {t.chat.previewEmptyHint}
          </p>
        ) : loading && !dataUrl ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : dataUrl ? (
          <div
            className={`mx-auto h-full overflow-hidden rounded-lg border border-border bg-white shadow-card transition-all ${
              device === "mobile" ? "w-[375px] max-w-full" : "w-full"
            }`}
          >
            <iframe
              key={`${path}-${device}-${nonce}`}
              src={dataUrl}
              title={path}
              sandbox="allow-scripts"
              className="h-full w-full"
            />
          </div>
        ) : (
          <p className="px-3 py-6 text-center type-caption text-destructive/80">
            {t.status.error}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Código ──────────────────────────────────────────────────────────── */

function CodeTab({ path }: { path: string | null }) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setText(null);
    if (!path) return;
    let cancelled = false;
    void readTextSmart(path).then((s) => {
      if (!cancelled) setText(s ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path)
    return (
      <p className="px-3.5 py-6 text-center type-caption text-muted-foreground/70">
        {t.chat.previewEmptyHint}
      </p>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-1.5">
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 flex-1 truncate font-mono type-micro text-muted-foreground">
          {path}
        </span>
        <button
          type="button"
          title={t.chat.copy}
          onClick={() => {
            if (text == null) return;
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {text === null ? (
          <Loader2 className="m-3 h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-mono type-caption leading-relaxed text-foreground/90">
            {text || "—"}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ── Arquivos ────────────────────────────────────────────────────────── */

function FilesTab({ onOpen }: { onOpen: (path: string, kind: "preview" | "code") => void }) {
  const { t } = useI18n();
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<ManagedFileEntry[]>([]);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .listFiles(path)
      .then((res) => {
        if (cancelled) return;
        const sorted = [...(res.entries ?? [])].sort((a, b) =>
          a.is_directory === b.is_directory
            ? a.name.localeCompare(b.name)
            : a.is_directory
              ? -1
              : 1,
        );
        setEntries(sorted);
      })
      .catch(() => setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [path]);

  const download = useCallback(async (entry: ManagedFileEntry) => {
    setBusyFile(entry.path);
    try {
      const res = await api.readFile(entry.path);
      const a = document.createElement("a");
      a.href = res.data_url;
      a.download = res.name || entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* transitório */
    } finally {
      setBusyFile(null);
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/70 px-3 py-2 type-caption text-muted-foreground">
        <button
          type="button"
          onClick={() => setPath("")}
          className="rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" />
        </button>
        {path &&
          path.split("/").map((seg, i, all) => (
            <span key={i} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <button
                type="button"
                onClick={() => setPath(all.slice(0, i + 1).join("/"))}
                className="max-w-[9rem] truncate rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
              >
                {seg}
              </button>
            </span>
          ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {path && (
          <button
            type="button"
            onClick={() => setPath(path.split("/").slice(0, -1).join("/"))}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left type-ui text-muted-foreground transition-colors hover:bg-muted/60"
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            ..
          </button>
        )}
        {entries.map((e) =>
          e.is_directory ? (
            <button
              key={e.path}
              type="button"
              onClick={() => setPath(e.path)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left type-ui text-foreground transition-colors hover:bg-muted/60"
            >
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
            </button>
          ) : (
            <div
              key={e.path}
              className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 type-ui text-foreground transition-colors hover:bg-muted/60"
            >
              <button
                type="button"
                onClick={() =>
                  onOpen(e.path, PREVIEWABLE_RE.test(e.name) ? "preview" : "code")
                }
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title={e.name}
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
              </button>
              <button
                type="button"
                title={t.chat.copyId}
                onClick={() => {
                  void navigator.clipboard.writeText(e.path).then(() => {
                    setCopied(e.path);
                    setTimeout(() => setCopied(null), 1200);
                  });
                }}
                className="shrink-0 rounded p-1 text-muted-foreground/0 transition-colors hover:bg-muted hover:text-foreground group-hover:text-muted-foreground/70"
              >
                {copied === e.path ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                title={t.chat.downloadFile}
                onClick={() => void download(e)}
                disabled={busyFile === e.path}
                className="shrink-0 rounded p-1 text-muted-foreground/0 transition-colors hover:bg-muted hover:text-foreground group-hover:text-muted-foreground/70"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          ),
        )}
        {entries.length === 0 && (
          <div className="px-2.5 py-4 type-caption text-muted-foreground/70">
            {t.common.noResults}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Alterações (git real + fallback) ────────────────────────────────── */

function ChangesTab({
  cwd,
  changes,
  busy,
  refreshTick,
}: {
  cwd: string | null;
  changes: DockChange[];
  busy: boolean;
  refreshTick: number;
}) {
  const { t } = useI18n();
  const [repo, setRepo] = useState<GitRepoStatus | null | undefined>(undefined);
  const [openDiff, setOpenDiff] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [ship, setShip] = useState<{ ghReady: boolean; pr: { url: string } | null } | null>(null);
  const [mutating, setMutating] = useState(false);
  // Seletor de branch (fase git 2) + revert por arquivo, ambos com
  // confirmação em dois toques.
  const [branchMenu, setBranchMenu] = useState(false);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [armedBranch, setArmedBranch] = useState<string | null>(null);
  const [armedRevert, setArmedRevert] = useState<string | null>(null);
  useMenuDismiss(branchMenu, () => { setBranchMenu(false); setArmedBranch(null); }, "branch");
  useEffect(() => {
    if (!armedRevert) return;
    const timer = setTimeout(() => setArmedRevert(null), 5000);
    return () => clearTimeout(timer);
  }, [armedRevert]);

  const reload = useCallback(() => {
    if (!cwd) {
      setRepo(null);
      return;
    }
    // GUARDA (achado 09/07): `git status` sobe pro repo PAI — um cwd sem
    // repo dentro de /opt/data versionado mostraria o repo raiz (com dbs e
    // credenciais). Só liga o modo git se o `.git` mora NO próprio cwd.
    void api
      .listFiles(cwd)
      .then((res) => {
        const hasGit = (res.entries ?? []).some((e) => e.is_directory && e.name === ".git");
        if (!hasGit) {
          setRepo(null);
          return;
        }
        void api
          .gitStatus(cwd)
          .then((s) => {
            setRepo(s);
            if (s) void api.gitShipInfo(cwd).then(setShip).catch(() => setShip(null));
          })
          .catch(() => setRepo(null));
      })
      .catch(() => setRepo(null));
  }, [cwd]);
  useEffect(() => reload(), [reload, refreshTick]);

  useEffect(() => {
    setDiffText(null);
    if (!cwd || !openDiff || !repo) return;
    const f = repo.files.find((x) => x.path === openDiff);
    let cancelled = false;
    void api
      .gitReviewDiff(cwd, openDiff, !!f?.staged && !f?.untracked ? f.staged : false)
      .then((r) => {
        if (!cancelled) setDiffText(r.diff || "");
      })
      .catch(() => {
        if (!cancelled) setDiffText("");
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, openDiff, repo]);

  const toggleStage = useCallback(
    async (f: GitReviewFile) => {
      if (!cwd) return;
      setMutating(true);
      try {
        if (f.staged) await api.gitUnstage(cwd, f.path);
        else await api.gitStage(cwd, f.path);
        reload();
      } finally {
        setMutating(false);
      }
    },
    [cwd, reload],
  );

  const commit = useCallback(
    async (push: boolean) => {
      if (!cwd) return;
      setMutating(true);
      try {
        const message =
          msg.trim() || `Wayne — ${new Date().toLocaleString()}`;
        await api.gitCommit(cwd, message, push);
        setMsg("");
        reload();
      } finally {
        setMutating(false);
      }
    },
    [cwd, msg, reload],
  );

  // ── Sem repo (ou sem projeto): fallback = diffs das ferramentas ─────
  if (repo === null || repo === undefined) {
    return (
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {cwd && repo === null && (
          <p className="px-2 py-1 type-micro text-muted-foreground/70">{t.chat.gitNoRepo}</p>
        )}
        {changes.length === 0 && (
          <div className="px-2.5 py-4 type-caption text-muted-foreground/70">
            {t.common.noResults}
          </div>
        )}
        {[...changes].reverse().map((c) => (
          <div key={c.path} className="min-w-0">
            <button
              type="button"
              onClick={() => setOpenDiff((o) => (o === c.path ? null : c.path))}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left type-ui text-foreground transition-colors hover:bg-muted/60"
            >
              <FileDiff className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono type-caption">
                {c.path.split(/[/\\]/).pop()}
              </span>
            </button>
            {openDiff === c.path && (
              <div className="mt-1 px-1">
                <DiffView diff={c.diff} />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── Repo git de verdade (benchmark Codex "Comitar ou enviar") ───────
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex items-center gap-2 border-b border-border/70 px-3 py-2">
        {/* Branch atual — clique abre o seletor (troca com confirmação;
            nunca com um turno rodando). */}
        <button
          type="button"
          disabled={busy || mutating}
          data-menu-trigger="branch"
          title={t.chat.gitSwitchBranch}
          onClick={() => {
            setBranchMenu((v) => !v);
            if (!branchMenu && cwd) {
              setArmedBranch(null);
              void api
                .gitBranches(cwd)
                .then((r) =>
                  setBranches(
                    (r.branches ?? []).map((b) =>
                      typeof b === "string" ? b : (b.name ?? ""),
                    ).filter(Boolean),
                  ),
                )
                .catch(() => setBranches([]));
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
        >
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono type-caption text-foreground">
            {repo.branch ?? "—"}
          </span>
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform ${branchMenu ? "rotate-90" : ""}`}
          />
        </button>
        {(repo.ahead > 0 || repo.behind > 0) && (
          <span className="shrink-0 type-micro tabular-nums text-muted-foreground">
            ↑{repo.ahead} ↓{repo.behind}
          </span>
        )}
        <span className="shrink-0 type-caption tabular-nums">
          <span className="font-medium text-success">+{repo.added}</span>{" "}
          <span className="font-medium text-destructive">−{repo.removed}</span>
        </span>
        {branchMenu && (
          <div data-menu-root="branch" className="absolute left-2 top-full z-30 mt-1 max-h-56 w-[calc(100%-16px)] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-pop">
            {branches === null ? (
              <Loader2 className="m-2 h-4 w-4 animate-spin text-muted-foreground" />
            ) : branches.length === 0 ? (
              <p className="px-2.5 py-2 type-caption text-muted-foreground/70">
                {t.common.noResults}
              </p>
            ) : (
              branches.map((b) => {
                const current = b === repo.branch;
                const armed = armedBranch === b;
                return (
                  <button
                    key={b}
                    type="button"
                    disabled={current || mutating}
                    onClick={() => {
                      if (!armed) {
                        setArmedBranch(b);
                        return;
                      }
                      if (!cwd) return;
                      setMutating(true);
                      void api
                        .gitBranchSwitch(cwd, b)
                        .then(() => {
                          setBranchMenu(false);
                          setArmedBranch(null);
                          reload();
                        })
                        .finally(() => setMutating(false));
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono type-caption transition-colors ${
                      current
                        ? "text-muted-foreground/60"
                        : armed
                          ? "bg-warning/15 text-warning"
                          : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{b}</span>
                    {current && <Check className="h-3 w-3 shrink-0" />}
                    {armed && (
                      <span className="shrink-0 font-sans type-micro">{t.chat.gitConfirm}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {repo.files.length === 0 && (
          <div className="px-2.5 py-4 type-caption text-muted-foreground/70">
            {t.common.noResults}
          </div>
        )}
        {repo.files.map((f) => (
          <div key={f.path} className="min-w-0">
            <div className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 type-ui transition-colors hover:bg-muted/60">
              <input
                type="checkbox"
                checked={f.staged}
                disabled={mutating}
                onChange={() => void toggleStage(f)}
                className="h-3.5 w-3.5 shrink-0 accent-[var(--live)]"
                title={f.staged ? "staged" : "unstaged"}
              />
              <button
                type="button"
                onClick={() => setOpenDiff((o) => (o === f.path ? null : f.path))}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="w-4 shrink-0 text-center font-mono type-micro text-muted-foreground">
                  {f.status}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono type-caption text-foreground">
                  {f.path}
                </span>
                <span className="shrink-0 type-micro tabular-nums">
                  <span className="text-success">+{f.added}</span>{" "}
                  <span className="text-destructive">−{f.removed}</span>
                </span>
              </button>
              {/* Reverter o arquivo — 2 toques (destrutivo de verdade). */}
              <button
                type="button"
                disabled={mutating}
                title={armedRevert === f.path ? t.chat.gitConfirm : t.chat.gitRevert}
                onClick={() => {
                  if (armedRevert !== f.path) {
                    setArmedRevert(f.path);
                    return;
                  }
                  if (!cwd) return;
                  setArmedRevert(null);
                  setMutating(true);
                  void api
                    .gitRevert(cwd, f.path)
                    .then(() => reload())
                    .finally(() => setMutating(false));
                }}
                className={`shrink-0 rounded p-1 transition-colors ${
                  armedRevert === f.path
                    ? "bg-warning/15 text-warning"
                    : "text-muted-foreground/0 hover:bg-muted hover:text-destructive group-hover:text-muted-foreground/70"
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
            {openDiff === f.path && (
              <div className="mb-1 mt-0.5 px-1">
                {diffText === null ? (
                  <Loader2 className="m-2 h-4 w-4 animate-spin text-muted-foreground" />
                ) : diffText ? (
                  <DiffView diff={diffText} />
                ) : (
                  <p className="px-2 py-1 type-micro text-muted-foreground/70">—</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ship bar — commit/push/PR com confirmação dupla; nunca durante turno. */}
      <div className="space-y-2 border-t border-border px-3 py-2.5">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder={t.chat.gitMsgPlaceholder}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 type-ui text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/30"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <ArmedButton
            label={t.chat.gitCommit}
            confirmLabel={t.chat.gitConfirm}
            disabled={busy || mutating || repo.changed === 0}
            onFire={() => void commit(false)}
          />
          <ArmedButton
            label={t.chat.gitCommitPush}
            confirmLabel={t.chat.gitConfirm}
            primary
            disabled={busy || mutating || (repo.changed === 0 && repo.ahead === 0)}
            onFire={() => void commit(true)}
          />
          {ship?.pr?.url ? (
            <a
              href={ship.pr.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto flex items-center gap-1 type-ui text-live-ink transition-opacity hover:opacity-80"
            >
              {t.chat.gitViewPr}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : ship?.ghReady ? (
            <ArmedButton
              label={t.chat.gitCreatePr}
              confirmLabel={t.chat.gitConfirm}
              disabled={busy || mutating}
              onFire={() => {
                if (!cwd) return;
                setMutating(true);
                void api
                  .gitCreatePr(cwd)
                  .then(() => reload())
                  .finally(() => setMutating(false));
              }}
            />
          ) : (
            <span className="ml-auto type-micro text-muted-foreground/60">
              {t.chat.gitGhMissing}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Projeto ─────────────────────────────────────────────────────────── */

function ProjectTab({ project, cwd }: { project: string | null; cwd: string | null }) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const path = project ? `projects/${project}/AGENTS.md` : null;

  // Agendadas do projeto — mesmo critério do ProjectWorkspace: jobs cujo
  // workdir é a pasta (ou subpasta) do projeto.
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  useEffect(() => {
    setJobs(null);
    if (!cwd) return;
    let cancelled = false;
    void api
      .getCronJobs("all")
      .then((all) => {
        if (cancelled) return;
        setJobs(all.filter((j) => j.workdir === cwd || j.workdir?.startsWith(`${cwd}/`)));
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  useEffect(() => {
    setText(null);
    if (!path) return;
    let cancelled = false;
    void api
      .readFile(path)
      .then((r) => {
        if (cancelled) return;
        const [, b64] = r.data_url.split(",", 2);
        try {
          setText(new TextDecoder("utf-8").decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
        } catch {
          setText("");
        }
      })
      .catch(() => {
        if (!cancelled) setText("");
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!project)
    return (
      <p className="px-3.5 py-6 text-center type-caption text-muted-foreground/70">
        {t.chat.projectTasksEmpty}
      </p>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate type-ui font-semibold text-foreground">
          {project}
        </span>
      </div>
      <label className="type-caption font-medium uppercase tracking-[0.05em] text-muted-foreground">
        {t.chat.instructions}
      </label>
      <textarea
        value={text ?? ""}
        disabled={text === null}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.chat.instructionsPlaceholder}
        className="min-h-0 flex-1 resize-none rounded-lg border border-border bg-background p-2.5 font-mono type-caption text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-foreground/30"
      />
      <div className="flex items-center justify-end gap-2">
        {saved && <span className="type-micro text-success">{t.chat.instructionsSaved}</span>}
        <button
          type="button"
          disabled={saving || text === null}
          onClick={() => {
            if (!path || text === null) return;
            setSaving(true);
            void api
              .uploadFile(path, new File([new Blob([text])], "AGENTS.md"), true)
              .then(() => {
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              })
              .finally(() => setSaving(false));
          }}
          className="rounded-lg bg-foreground px-3.5 py-1.5 type-ui font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? t.common.saving : t.common.save}
        </button>
      </div>

      {/* Agendadas do projeto — leitura rápida; gestão completa na Agenda. */}
      <div className="space-y-1.5 border-t border-border/70 pt-2.5">
        <div className="flex items-center gap-1.5">
          <span className="type-caption font-medium uppercase tracking-[0.05em] text-muted-foreground">
            {t.chat.scheduledTasks}
          </span>
          <a
            href={cwd ? `/cron?workdir=${encodeURIComponent(cwd)}` : "/cron"}
            className="ml-auto flex items-center gap-1 type-micro text-live-ink transition-opacity hover:opacity-80"
          >
            {t.chat.viewAll}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {jobs === null ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" />
        ) : jobs.length === 0 ? (
          <p className="type-micro text-muted-foreground/60">{t.chat.projectTasksEmpty}</p>
        ) : (
          jobs.slice(0, 5).map((j, i) => (
            <div key={`${j.name ?? i}`} className="flex items-center gap-2 type-caption">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-live/70" />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {j.name || j.schedule?.display || j.schedule?.expr || "—"}
              </span>
              {(j.schedule?.display ?? j.schedule?.expr) && (
                <span className="shrink-0 font-mono type-micro text-muted-foreground/70">
                  {j.schedule?.display ?? j.schedule?.expr}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <a
        href={project ? `/chat?project=${encodeURIComponent(project)}&home=1` : "/chat"}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 type-ui font-medium text-foreground transition-colors hover:bg-muted"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        {t.chat.projectOpenWorkspace}
      </a>
    </div>
  );
}

/* ── Dock shell ──────────────────────────────────────────────────────── */

export function RightDock({
  busy,
  steps,
  subagents,
  urls,
  envFiles,
  added,
  removed,
  changes,
  cwd,
  project,
  openSignal,
  refreshTick,
}: {
  busy: boolean;
  steps: TaskStep[];
  subagents: SubagentInfo[];
  urls: DockUrl[];
  envFiles: DockEnvFile[];
  added: number;
  removed: number;
  changes: DockChange[];
  cwd: string | null;
  project: string | null;
  /** Página manda abrir uma aba (ex.: auto-preview de .html gerado). */
  openSignal?: { tab: DockTab; path?: string; nonce: number } | null;
  /** Bump no fim de cada turno → re-consulta git. */
  refreshTick: number;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(PREF_KEY) === "open";
    } catch {
      return false;
    }
  });
  const [tab, setTab] = useState<DockTab>("env");
  const [pin, setPin] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(PIN_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [codePath, setCodePath] = useState<string | null>(null);

  // ── Largura manual (pedido 09/07): alça de arraste na borda esquerda +
  //    botão expandir/contrair (⤢ do Manus). Persistida. ──
  const [width, setWidth] = useState<number>(() => {
    try {
      const w = Number(window.localStorage.getItem(WIDTH_KEY));
      return w >= MIN_W ? clampW(w) : 340;
    } catch {
      return 340;
    }
  });
  const widthRef = useRef(width);
  widthRef.current = width;
  const preExpandRef = useRef<number | null>(null);
  const persistWidth = (w: number) => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(w));
    } catch {
      /* modo privado */
    }
  };
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: MouseEvent) => {
      setWidth(clampW(window.innerWidth - ev.clientX));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
      preExpandRef.current = null;
      persistWidth(widthRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
  const expanded = width >= maxW() - 40;
  const toggleExpand = useCallback(() => {
    if (expanded) {
      const back = clampW(preExpandRef.current ?? 340);
      preExpandRef.current = null;
      setWidth(back);
      persistWidth(back);
    } else {
      preExpandRef.current = widthRef.current;
      const wide = maxW();
      setWidth(wide);
      persistWidth(wide);
    }
  }, [expanded]);

  const setOpenPersist = useCallback((v: boolean) => {
    setOpen(v);
    try {
      window.localStorage.setItem(PREF_KEY, v ? "open" : "closed");
    } catch {
      /* modo privado */
    }
  }, []);

  const hasEnvContent =
    steps.length > 0 || subagents.length > 0 || urls.length > 0 || envFiles.length > 0;

  // Auto-abre na 1ª vez que um turno roda com conteúdo (sem pref salva).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!busy || !hasEnvContent || autoOpenedRef.current || open) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(PREF_KEY);
    } catch {
      /* modo privado */
    }
    if (stored === null) {
      autoOpenedRef.current = true;
      setOpen(true);
      setTab("env");
    }
  }, [busy, hasEnvContent, open]);

  // Sinal da página (auto-preview, abrir arquivo…).
  const lastSignalRef = useRef(0);
  useEffect(() => {
    if (!openSignal || openSignal.nonce === lastSignalRef.current) return;
    lastSignalRef.current = openSignal.nonce;
    if (openSignal.path) {
      if (openSignal.tab === "code") setCodePath(openSignal.path);
      else setPreviewPath(openSignal.path);
    }
    setTab(openSignal.tab);
    setOpenPersist(true);
  }, [openSignal, setOpenPersist]);

  const openFromFiles = useCallback((p: string, kind: "preview" | "code") => {
    if (kind === "preview") {
      setPreviewPath(p);
      setTab("preview");
    } else {
      setCodePath(p);
      setTab("code");
    }
  }, []);

  if (!open) {
    // Punho; com atividade, chip rico "Ambiente · resumo".
    const bits: string[] = [];
    if (subagents.length > 0) bits.push(`${subagents.length} ${t.chat.envAgents.toLowerCase()}`);
    if (added + removed > 0) bits.push(`+${added} −${removed}`);
    return (
      <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex flex-col items-end justify-start pt-4 max-md:hidden">
        {busy || hasEnvContent ? (
          <button
            type="button"
            onClick={() => setOpenPersist(true)}
            className="pointer-events-auto mr-4 flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 shadow-pop transition-colors hover:border-foreground/25"
            title={t.chat.envTitle}
          >
            {busy ? (
              <span className="relative grid h-3 w-3 place-items-center">
                <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-live/40" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
              </span>
            ) : (
              <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="type-ui font-medium text-foreground">{t.chat.envTitle}</span>
            {bits.length > 0 && (
              <span className="type-caption tabular-nums text-muted-foreground">
                {bits.join(" · ")}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpenPersist(true)}
            title={t.chat.envTitle}
            aria-label={t.chat.envTitle}
            className="pointer-events-auto mt-[38vh] rounded-l-xl border border-r-0 border-border bg-card px-1 py-3 text-muted-foreground shadow-card transition-colors hover:text-foreground"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  const TABS: Array<{ key: DockTab; Icon: typeof Monitor; label: string }> = [
    { key: "env", Icon: Monitor, label: t.chat.envTitle },
    { key: "preview", Icon: MonitorSmartphone, label: t.chat.dockPreview },
    { key: "code", Icon: Code2, label: t.chat.dockCode },
    { key: "files", Icon: Folder, label: t.chat.taskFiles },
    { key: "changes", Icon: FileDiff, label: t.chat.envChanges },
    { key: "project", Icon: Settings2, label: t.chat.dockProject },
  ];

  return (
    <aside
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-card max-lg:hidden"
    >
      {/* Alça de redimensionar — arrasta pra alargar/estreitar. */}
      <div
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-live/40 active:bg-live/60"
      />
      {/* Header de ícones (benchmark Codex). */}
      <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1.5">
        <button
          type="button"
          onClick={() => {
            setPin((v) => {
              try {
                window.localStorage.setItem(PIN_KEY, v ? "off" : "on");
              } catch {
                /* modo privado */
              }
              return !v;
            });
          }}
          title={t.chat.pinSummary}
          aria-label={t.chat.pinSummary}
          className={`rounded-lg p-1.5 transition-colors hover:bg-muted ${
            pin ? "text-live" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Pin className="h-4 w-4" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-border" />
        {TABS.map(({ key, Icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            title={label}
            aria-label={label}
            className={`rounded-lg p-1.5 transition-colors ${
              tab === key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={toggleExpand}
          title={expanded ? t.common.collapse : t.common.expand}
          aria-label={expanded ? t.common.collapse : t.common.expand}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setOpenPersist(false)}
          aria-label={t.common.close}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {/* Resumo fixado (pin) — 1 linha viva acima de qualquer aba. */}
      {pin && tab !== "env" && (
        <EnvSections
          compact
          busy={busy}
          steps={steps}
          subagents={subagents}
          urls={urls}
          envFiles={envFiles}
          added={added}
          removed={removed}
        />
      )}

      {tab === "env" && (
        <EnvSections
          busy={busy}
          steps={steps}
          subagents={subagents}
          urls={urls}
          envFiles={envFiles}
          added={added}
          removed={removed}
        />
      )}
      {tab === "preview" && <PreviewTab path={previewPath} onOpenCode={(p) => openFromFiles(p, "code")} />}
      {tab === "code" && <CodeTab path={codePath ?? previewPath} />}
      {tab === "files" && <FilesTab onOpen={openFromFiles} />}
      {tab === "changes" && (
        <ChangesTab cwd={cwd} changes={changes} busy={busy} refreshTick={refreshTick} />
      )}
      {tab === "project" && <ProjectTab project={project} cwd={cwd} />}
      {tab === "env" && !hasEnvContent && !busy && (
        <p className="px-3.5 pb-4 type-caption text-muted-foreground/60">{t.chat.envTitle}</p>
      )}
    </aside>
  );
}
