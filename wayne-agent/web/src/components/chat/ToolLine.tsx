/**
 * ToolLine — uma ação do agente como o Manus mostra: linha fina com ícone
 * (encaixotado) por categoria, verbo em linguagem natural e o alvo técnico em
 * mono, pulsando enquanto roda. Clique expande o detalhe (args/resultado/erro/
 * diff/duração). Substitui o chip agrupado (ToolCallGroup) no chat nativo; a
 * tela de Sessões continua com o visual "review" próprio.
 */
import { useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  FilePenLine,
  FileText,
  Globe,
  Image as ImageIcon,
  Package,
  Search,
  SquareTerminal,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { useI18n } from "@/i18n";
import type { Translations } from "@/i18n/types";

import type { ToolCallState } from "./types";

interface ToolFace {
  Icon: LucideIcon;
  verb: string;
  /** Alvo curto em mono (comando, arquivo, url…) — 1ª linha do argsPreview. */
  target?: string;
}

const CATEGORIES: Array<{ re: RegExp; Icon: LucideIcon; key: keyof Translations["chat"] }> = [
  { re: /terminal|bash|shell|exec|command|process|script/, Icon: SquareTerminal, key: "toolRun" },
  { re: /write|edit|replace|patch|apply|save|create_file|mkdir|move|copy|delete/, Icon: FilePenLine, key: "toolEdit" },
  { re: /read|cat|view|open|list|ls\b/, Icon: FileText, key: "toolRead" },
  { re: /browser|web|fetch|http|url|navigate|visit|download|request/, Icon: Globe, key: "toolWeb" },
  { re: /search|find|grep|glob|lookup|query/, Icon: Search, key: "toolSearch" },
  { re: /skill/, Icon: Package, key: "toolSkill" },
  { re: /delegate|subagent|agent|spawn|crew|task/, Icon: Users, key: "toolDelegate" },
  { re: /image|photo|draw|paint|vision|media|video|audio|voice|tts/, Icon: ImageIcon, key: "toolImage" },
];

// O context do gateway costuma abrir com um gerúndio em inglês ("Running
// code …", "Reading skill …") que repete o verbo já traduzido da linha —
// limpa o prefixo redundante e deixa só o alvo.
const REDUNDANT_PREFIX_RE =
  /^(?:running code|running|executing|reading|listing|writing|loading)\b[:#\s]*/i;

function firstLine(s: string | undefined, max = 88): string | undefined {
  if (!s) return undefined;
  const line = s.split("\n").find((l) => l.trim()) ?? "";
  const trimmed = line.trim().replace(REDUNDANT_PREFIX_RE, "").trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Nunca vazar nome técnico cru pra conversa (Onda 1): `mcp__server__acao`
 *  vira "acao" legível; underscores viram espaço; o placeholder literal
 *  "tool" (mensagem órfã sem nome) some. */
function prettifyToolName(name: string): string | undefined {
  if (!name || name === "tool") return undefined;
  const last = name.includes("__") ? name.split("__").filter(Boolean).pop()! : name;
  const cleaned = last.replace(/[_-]+/g, " ").trim();
  return cleaned || undefined;
}

export function toolFace(tc: ToolCallState, t: Translations): ToolFace {
  const name = tc.name.toLowerCase();
  const cat = CATEGORIES.find((c) => c.re.test(name));
  const verb = cat ? (t.chat[cat.key] as string) : (t.chat.toolGeneric as string);
  return {
    Icon: cat?.Icon ?? Wrench,
    verb,
    target: firstLine(tc.argsPreview) ?? (cat ? undefined : prettifyToolName(tc.name)),
  };
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

// Tira códigos de escape ANSI (cores do terminal) do texto — senão aparece
// "[0m[32m" cru no resultado (paridade: ansi-text do desktop, sem cores).
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;]*m/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, "");

/** Diff unificado colorido + cabeçalho +N/−M (paridade: FileDiffPanel). */
export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.startsWith("+") && !l.startsWith("+++")) added++;
    else if (l.startsWith("-") && !l.startsWith("---")) removed++;
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-2 py-1 text-[11px] tabular-nums">
        <span className="text-success">+{added}</span>
        <span className="text-destructive">−{removed}</span>
      </div>
      <pre className="max-h-56 overflow-auto font-mono text-[11px] leading-relaxed">
        {lines.map((l, i) => {
          const isAdd = l.startsWith("+") && !l.startsWith("+++");
          const isDel = l.startsWith("-") && !l.startsWith("---");
          const isHunk = l.startsWith("@@");
          return (
            <div
              key={i}
              className={`px-2 ${
                isAdd
                  ? "bg-success/10 text-success"
                  : isDel
                    ? "bg-destructive/10 text-destructive"
                    : isHunk
                      ? "bg-muted text-muted-foreground"
                      : "text-muted-foreground/80"
              }`}
            >
              {l || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

/** Botãozinho de copiar (canto do painel de detalhe). */
function CopyIconButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function ToolLine({
  tool,
  rail,
}: {
  tool: ToolCallState;
  /** Trilho de árvore ("├─" | "└─") — prefixo mono do bloco de atividade. */
  rail?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { Icon, verb, target } = toolFace(tool, t);
  const running = tool.status === "running";
  const failed = tool.status === "error";

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`group flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-[3px] text-left transition-colors hover:bg-muted/50 ${
          running ? "chat-working" : ""
        }`}
      >
        {rail && (
          <span
            aria-hidden
            className="shrink-0 select-none font-mono type-micro leading-none text-muted-foreground/40"
          >
            {rail}
          </span>
        )}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-border bg-card">
          {failed ? (
            <AlertCircle className="h-3 w-3 text-destructive" />
          ) : (
            <Icon className="h-3 w-3 text-muted-foreground" />
          )}
        </span>
        <span className="shrink-0 text-[13px] text-muted-foreground">{verb}</span>
        {target && (
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/70">
            {target}
          </span>
        )}
        {failed && (
          <span className="shrink-0 text-xs text-destructive">{t.status.error}</span>
        )}
        {!running && tool.durationS != null && (
          <span className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70">
            {fmtDuration(tool.durationS)}
          </span>
        )}
      </button>

      {open && (
        <div className="mb-1 ml-7 mt-1 space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
          <div className="flex items-start justify-between gap-2">
            {tool.argsPreview ? (
              <pre className="max-h-40 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words font-mono text-muted-foreground">
                {tool.argsPreview}
              </pre>
            ) : (
              <span />
            )}
            <CopyIconButton
              text={tool.result ?? tool.error ?? tool.inlineDiff ?? tool.argsPreview ?? ""}
              label={t.chat.copy}
            />
          </div>
          {tool.inlineDiff && <DiffView diff={tool.inlineDiff} />}
          {tool.error ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-destructive">
              {stripAnsi(tool.error)}
            </pre>
          ) : (
            tool.result && (
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-foreground/80">
                {stripAnsi(tool.result)}
              </pre>
            )
          )}
          {tool.durationS != null && (
            <div className="text-[11px] tabular-nums text-muted-foreground/70">
              {fmtDuration(tool.durationS)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
