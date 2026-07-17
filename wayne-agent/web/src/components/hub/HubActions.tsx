/**
 * HubActions — the "Gerir" and "Criar" menus in the top-right corner of the
 * Plugins hub (Manus benchmark). Rendered in the PluginsHub body, top-right.
 *
 * Reuses the flows that already exist: MCP via api.addMcpServer (URL/stdio/JSON),
 * skills via api.createSkill (upload), api.installSkillFromHub (GitHub) and the
 * /learn flow ("Criar habilidade" → /chat?learn=). Dropdown on useMenuDismiss
 * (same pattern as ModePicker/SkillsPage). Onda 3; i18n in Onda 4.
 */
import { useRef, useState } from "react";
import {
  ChevronDown,
  FileJson,
  Github,
  Globe,
  Loader2,
  Package,
  Plug,
  Settings2,
  Sparkles,
  Upload,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { McpServerCreate } from "@/lib/api";
import { Button } from "@nous-research/ui/ui/components/button";
import { Input } from "@nous-research/ui/ui/components/input";
import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";

type ShowToast = (m: string, v: "success" | "error") => void;
type Manage = "connectors" | "skills";
type Dialog = null | "mcp-url" | "mcp-stdio" | "mcp-json" | "skill-github" | "skill-learn";

const TRIGGER =
  "inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted";
const PANEL =
  "absolute right-0 top-full z-50 mt-1 min-w-[240px] rounded-2xl border border-border bg-card p-1.5 shadow-pop";
const ITEM =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted";
const GROUP = "px-2.5 pb-1 pt-2 text-[10px] uppercase tracking-[0.12em] text-text-tertiary";

function parseArgs(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {};
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const idx = line.indexOf("=");
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) env[key] = value;
    });
  return env;
}

/** Accepts `{mcpServers:{name:{url|command}}}`, an array, or a single object. */
function parseMcpJson(raw: string): McpServerCreate[] {
  const data = JSON.parse(raw) as unknown;
  const out: McpServerCreate[] = [];
  const fromEntry = (name: string, cfg: unknown): McpServerCreate | null => {
    if (!cfg || typeof cfg !== "object") return null;
    const c = cfg as Record<string, unknown>;
    const b: McpServerCreate = { name };
    if (typeof c.url === "string") b.url = c.url;
    if (typeof c.command === "string") b.command = c.command;
    if (Array.isArray(c.args)) b.args = c.args.map(String);
    if (c.env && typeof c.env === "object") b.env = c.env as Record<string, string>;
    if (!b.url && !b.command) return null;
    return b;
  };
  const asRec = data as Record<string, unknown>;
  if (asRec && typeof asRec.mcpServers === "object" && asRec.mcpServers) {
    for (const [n, cfg] of Object.entries(asRec.mcpServers as Record<string, unknown>)) {
      const b = fromEntry(n, cfg);
      if (b) out.push(b);
    }
  } else if (Array.isArray(data)) {
    for (const item of data) {
      const b = fromEntry(((item as Record<string, unknown>)?.name as string) ?? "mcp", item);
      if (b) out.push(b);
    }
  } else if (data && typeof data === "object") {
    const b = fromEntry((asRec.name as string) ?? "mcp", data);
    if (b) out.push(b);
  }
  return out;
}

export function HubActions({
  scope,
  onManage,
  onCreated,
  showToast,
}: {
  scope: string;
  onManage: (which: Manage) => void;
  onCreated: () => void;
  showToast: ShowToast;
}) {
  const { t } = useI18n();
  const tp = t.pluginsHub;
  const [menu, setMenu] = useState<null | "gerir" | "criar">(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  useMenuDismiss(menu !== null, () => setMenu(null), "hubmenu");

  const skillProfile = scope !== "global" ? scope : undefined;
  const open = (d: Dialog) => {
    setMenu(null);
    setDialog(d);
  };

  const onUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const base = file.name.replace(/\.[^.]+$/, "");
      const name = base
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9._-]/g, "");
      if (!name) {
        showToast(tp.invalidFile, "error");
        return;
      }
      const res = await api.createSkill({ name, content: text }, skillProfile);
      if (res.success === false) {
        showToast(res.error || res.message || tp.uploadFailed, "error");
        return;
      }
      showToast(`${name} ✓`, "success");
      onCreated();
    } catch {
      showToast(tp.uploadFailed, "error");
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Gerir */}
        <div className="relative">
          <button
            type="button"
            data-menu-trigger="hubmenu"
            onClick={() => setMenu(menu === "gerir" ? null : "gerir")}
            className={TRIGGER}
          >
            {tp.manage}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
          {menu === "gerir" && (
            <div data-menu-root="hubmenu" className={PANEL}>
              <button
                type="button"
                className={ITEM}
                onClick={() => {
                  setMenu(null);
                  onManage("skills");
                }}
              >
                <Package className="h-4 w-4 opacity-70" />
                {tp.groupSkills}
              </button>
              <button
                type="button"
                className={ITEM}
                onClick={() => {
                  setMenu(null);
                  onManage("connectors");
                }}
              >
                <Plug className="h-4 w-4 opacity-70" />
                {tp.groupConnectors}
              </button>
            </div>
          )}
        </div>

        {/* Criar */}
        <div className="relative">
          <button
            type="button"
            data-menu-trigger="hubmenu"
            onClick={() => setMenu(menu === "criar" ? null : "criar")}
            className={TRIGGER}
          >
            {tp.create}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
          {menu === "criar" && (
            <div data-menu-root="hubmenu" className={PANEL}>
              <div className={GROUP}>{tp.groupConnectors}</div>
              <button type="button" className={ITEM} onClick={() => open("mcp-url")}>
                <Globe className="h-4 w-4 opacity-70" />
                {tp.customApi}
              </button>
              <button type="button" className={ITEM} onClick={() => open("mcp-stdio")}>
                <Settings2 className="h-4 w-4 opacity-70" />
                {tp.customMcp}
              </button>
              <button type="button" className={ITEM} onClick={() => open("mcp-json")}>
                <FileJson className="h-4 w-4 opacity-70" />
                {tp.importMcpJson}
              </button>
              <button type="button" className={ITEM} onClick={() => open("mcp-url")}>
                <Plug className="h-4 w-4 opacity-70" />
                {tp.addMcpUrl}
              </button>

              <div className={GROUP}>{tp.groupSkills}</div>
              <button type="button" className={ITEM} onClick={() => open("skill-learn")}>
                <Sparkles className="h-4 w-4 opacity-70" />
                {tp.createSkill}
              </button>
              <button
                type="button"
                className={ITEM}
                onClick={() => {
                  setMenu(null);
                  uploadRef.current?.click();
                }}
              >
                <Upload className="h-4 w-4 opacity-70" />
                {tp.uploadSkill}
              </button>
              <button type="button" className={ITEM} onClick={() => open("skill-github")}>
                <Github className="h-4 w-4 opacity-70" />
                {tp.importGithub}
              </button>
            </div>
          )}
        </div>
      </div>

      <input
        ref={uploadRef}
        type="file"
        accept=".md,.txt,.markdown"
        className="hidden"
        onChange={onUploadChange}
      />

      {dialog && (
        <HubDialog
          kind={dialog}
          skillProfile={skillProfile}
          onClose={() => setDialog(null)}
          onCreated={onCreated}
          showToast={showToast}
        />
      )}
    </>
  );
}

function Modal({
  title,
  onClose,
  children,
  onSubmit,
  submitLabel,
  busy,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-pop">
        <div className="mb-4 text-sm font-medium text-foreground">{title}</div>
        <div className="flex flex-col gap-3">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button ghost size="sm" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={onSubmit}
            prefix={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

const TEXTAREA =
  "min-h-[110px] w-full rounded-lg border border-border bg-background p-2.5 font-mono-ui text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

function HubDialog({
  kind,
  skillProfile,
  onClose,
  onCreated,
  showToast,
}: {
  kind: Exclude<Dialog, null>;
  skillProfile?: string;
  onClose: () => void;
  onCreated: () => void;
  showToast: ShowToast;
}) {
  const { t } = useI18n();
  const tp = t.pluginsHub;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [json, setJson] = useState("");
  const [ghUrl, setGhUrl] = useState("");
  const [learnText, setLearnText] = useState("");

  const addMcp = async (bodies: McpServerCreate[]) => {
    if (!bodies.length) {
      showToast(tp.nothingToAdd, "error");
      return;
    }
    setBusy(true);
    try {
      for (const b of bodies) await api.addMcpServer(b);
      showToast(bodies.length > 1 ? `${bodies.length} ✓` : tp.added, "success");
      onClose();
      onCreated();
    } catch (e) {
      showToast(`${e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (kind === "mcp-url") {
      if (!name.trim() || !url.trim()) {
        showToast(tp.nameUrlRequired, "error");
        return;
      }
      await addMcp([{ name: name.trim(), url: url.trim() }]);
    } else if (kind === "mcp-stdio") {
      if (!name.trim() || !command.trim()) {
        showToast(tp.nameCommandRequired, "error");
        return;
      }
      const b: McpServerCreate = { name: name.trim(), command: command.trim() };
      const a = parseArgs(args);
      if (a.length) b.args = a;
      const e = parseEnv(env);
      if (Object.keys(e).length) b.env = e;
      await addMcp([b]);
    } else if (kind === "mcp-json") {
      let bodies: McpServerCreate[] = [];
      try {
        bodies = parseMcpJson(json);
      } catch {
        showToast(tp.invalidJson, "error");
        return;
      }
      await addMcp(bodies);
    } else if (kind === "skill-github") {
      const u = ghUrl.trim();
      if (!u) return;
      setBusy(true);
      try {
        await api.installSkillFromHub(u, skillProfile);
        showToast(`${u} ✓`, "success");
        onClose();
        onCreated();
      } catch (e) {
        showToast(`${e}`, "error");
      } finally {
        setBusy(false);
      }
    } else if (kind === "skill-learn") {
      const text = learnText.trim();
      if (!text) return;
      navigate(`/chat?learn=${encodeURIComponent(text)}`);
      onClose();
    }
  };

  if (kind === "mcp-url") {
    return (
      <Modal title={tp.urlTitle} onClose={onClose} onSubmit={submit} submitLabel={tp.addBtn} busy={busy}>
        <Input placeholder={tp.namePh} value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="https://…/mcp" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
      </Modal>
    );
  }
  if (kind === "mcp-stdio") {
    return (
      <Modal title={tp.customMcp} onClose={onClose} onSubmit={submit} submitLabel={tp.addBtn} busy={busy}>
        <Input placeholder={tp.namePh} value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder={tp.commandPh} value={command} onChange={(e) => setCommand(e.target.value)} spellCheck={false} />
        <Input placeholder={tp.argsPh} value={args} onChange={(e) => setArgs(e.target.value)} spellCheck={false} />
        <textarea className={TEXTAREA} placeholder={tp.envPh} value={env} onChange={(e) => setEnv(e.target.value)} spellCheck={false} />
      </Modal>
    );
  }
  if (kind === "mcp-json") {
    return (
      <Modal title={tp.importMcpJson} onClose={onClose} onSubmit={submit} submitLabel={tp.importBtn} busy={busy}>
        <textarea
          className={TEXTAREA}
          placeholder={'{\n  "mcpServers": {\n    "meu-servidor": { "url": "https://…/mcp" }\n  }\n}'}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          spellCheck={false}
        />
      </Modal>
    );
  }
  if (kind === "skill-github") {
    return (
      <Modal title={tp.importGithub} onClose={onClose} onSubmit={submit} submitLabel={tp.importBtn} busy={busy}>
        <Input placeholder={tp.githubPh} value={ghUrl} onChange={(e) => setGhUrl(e.target.value)} spellCheck={false} />
      </Modal>
    );
  }
  // skill-learn
  return (
    <Modal title={tp.createSkill} onClose={onClose} onSubmit={submit} submitLabel={tp.createWithWayne} busy={busy}>
      <textarea
        className={TEXTAREA}
        placeholder={tp.learnPh}
        value={learnText}
        onChange={(e) => setLearnText(e.target.value)}
      />
    </Modal>
  );
}
