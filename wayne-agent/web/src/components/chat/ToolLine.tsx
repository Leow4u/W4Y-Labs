/**
 * ToolLine — an agent action the way Manus shows it: thin row with a (boxed)
 * icon per category, the verb in natural language and the technical target in
 * mono, pulsing while it runs. Clicking expands the detail (args/result/error/
 * diff/duration). Replaces the grouped chip (ToolCallGroup) in the native chat;
 * the Sessions screen keeps its own "review" look.
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
  Plug,
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
  /** Short target in mono (command, file, url…) — 1st line of argsPreview. */
  target?: string;
}

const CATEGORIES: Array<{ re: RegExp; Icon: LucideIcon; key: keyof Translations["chat"] }> = [
  // Connectors (Composio): manage_connections / auth / oauth → "Conectando".
  { re: /manage_connection|connect_account|\boauth\b|authorize_connection/, Icon: Plug, key: "toolConnect" },
  { re: /terminal|bash|shell|exec|command|process|script/, Icon: SquareTerminal, key: "toolRun" },
  { re: /write|edit|replace|patch|apply|save|create_file|mkdir|move|copy|delete/, Icon: FilePenLine, key: "toolEdit" },
  { re: /read|cat|view|open|list|ls\b/, Icon: FileText, key: "toolRead" },
  { re: /browser|web|fetch|http|url|navigate|visit|download|request/, Icon: Globe, key: "toolWeb" },
  { re: /search|find|grep|glob|lookup|query/, Icon: Search, key: "toolSearch" },
  { re: /skill/, Icon: Package, key: "toolSkill" },
  { re: /delegate|subagent|agent|spawn|crew|task/, Icon: Users, key: "toolDelegate" },
  { re: /image|photo|draw|paint|vision|media|video|audio|voice|tts/, Icon: ImageIcon, key: "toolImage" },
];

// The gateway context usually opens with an English gerund ("Running
// code …", "Reading skill …") that repeats the row's already-translated verb —
// strip the redundant prefix and keep only the target.
const REDUNDANT_PREFIX_RE =
  /^(?:running code|running|executing|reading|listing|writing|loading)\b[:#\s]*/i;

function firstLine(s: string | undefined, max = 88): string | undefined {
  if (!s) return undefined;
  const line = s.split("\n").find((l) => l.trim()) ?? "";
  const trimmed = line.trim().replace(REDUNDANT_PREFIX_RE, "").trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Never leak the raw technical name into the conversation (Onda 1):
 *  `mcp__server__acao` becomes a readable "acao"; underscores become spaces;
 *  the literal "tool" placeholder (orphan message with no name) disappears. */
function prettifyToolName(name: string): string | undefined {
  if (!name || name === "tool") return undefined;
  const last = name.includes("__") ? name.split("__").filter(Boolean).pop()! : name;
  const cleaned = last.replace(/[_-]+/g, " ").trim();
  return cleaned || undefined;
}

/** True when a tool name denotes fetching EXTERNAL / internet context — reuses
 *  the SAME `toolWeb` category the row icon uses (browser / web / fetch / http /
 *  navigate / download …), so there is a single source of truth. The dock's
 *  "Fontes" shows an "Internet" chip when this fires. The `toolSearch` category
 *  is deliberately NOT included: it also matches LOCAL search (grep / glob /
 *  session_search), which is not external — and the real web tools
 *  (web_search / web_extract / browser_*) all carry a web token anyway. */
export function isWebSourceTool(name: string): boolean {
  const web = CATEGORIES.find((c) => c.key === "toolWeb");
  return web ? web.re.test(name.toLowerCase()) : false;
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

/** Short, human status for the `tool.generating` event — never the raw
 *  technical name (e.g. mcp_composio_COMPOSIO_SEARCH_TOOLS). Reuses toolFace's
 *  friendly verb (already translated in the 16 languages). */
export function toolGeneratingLabel(name: string, t: Translations): string {
  const { verb } = toolFace({ id: "", name, status: "running" } as ToolCallState, t);
  return `${verb}…`;
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

// Strips ANSI escape codes (terminal colors) from the text — otherwise raw
// "[0m[32m" shows up in the result (parity: desktop's ansi-text, without colors).
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;]*m/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, "");

/** Colored unified diff + +N/−M header (parity: FileDiffPanel). */
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
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-2 py-1 text-xs tabular-nums">
        <span className="text-success">+{added}</span>
        <span className="text-destructive">−{removed}</span>
      </div>
      <pre className="max-h-56 overflow-auto font-mono text-xs leading-relaxed">
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

/** Little copy button (corner of the detail panel). */
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
      className="rounded p-1 text-text-tertiary transition-colors hover:bg-muted hover:text-foreground"
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
  /** Tree rail ("├─" | "└─") — mono prefix of the activity block. */
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
            className="shrink-0 select-none font-mono type-micro leading-none text-text-tertiary"
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
          <span className="min-w-0 truncate font-mono text-xs text-text-tertiary">
            {target}
          </span>
        )}
        {failed && (
          <span className="shrink-0 text-xs text-destructive">{t.status.error}</span>
        )}
        {!running && tool.durationS != null && (
          <span className="ml-auto shrink-0 pl-2 text-xs tabular-nums text-muted-foreground/0 transition-colors group-hover:text-text-tertiary">
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
            <div className="text-xs tabular-nums text-text-tertiary">
              {fmtDuration(tool.durationS)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
