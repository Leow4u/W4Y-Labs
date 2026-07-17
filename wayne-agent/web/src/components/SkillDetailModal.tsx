/**
 * SkillDetailModal — reads a skill (SKILL.md + references/) in a centred
 * modal, on the same pattern as SettingsOverlay (portal to body, clickable
 * backdrop, fixed height, Escape closes, `settings-modal` for Title Case).
 *
 * Two sources, one reader:
 *
 *  - INSTALLED (default): opened from the Skills grid. Loads SKILL.md via
 *    api.getSkillContent; the file tree on the left lists the skill's folder
 *    (derived from content.path) via api.listFiles and reads each file via
 *    api.readFile. If the Files API can't reach the folder (outside the
 *    managed root) it does a graceful FALLBACK: only "SKILL.md", no breakage.
 *
 *  - HUB (`hub` prop): opened from the marketplace to read a skill BEFORE
 *    installing it. Loads api.previewSkillFromHub (GET /api/skills/hub/preview),
 *    which resolves the bundle without installing. That endpoint returns the
 *    SKILL.md text plus the manifest as file NAMES only — no contents — so the
 *    manifest is listed but not selectable, and the install control rides in
 *    the top bar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Copy,
  FileText,
  FolderClosed,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  X,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import type { SkillHubResult, SkillHubScan } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { SkillInstallControl, prettyCat } from "@/components/skills/SkillHubCard";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/** Decode a `data:` URL (base64 or plain) into UTF-8 text. Returns "" on any
 *  failure so a binary/undecodable reference never blows up the reader. */
function dataUrlToText(dataUrl: string): string {
  try {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return "";
    const meta = dataUrl.slice(5, comma); // strip "data:"
    const payload = dataUrl.slice(comma + 1);
    if (/;base64/i.test(meta)) {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return "";
  }
}

/** Trigger a client-side download of `text` as `<filename>`. */
function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface TreeNode {
  /** Display label in the tree. */
  label: string;
  /** Absolute managed-files path (undefined for the synthetic SKILL.md node). */
  path?: string;
  /** true = SKILL.md pseudo-node (served from getSkillContent, not readFile). */
  isSkillMd: boolean;
  /** Nesting depth for indentation. */
  depth: number;
  /** true = a folder header (references/ etc.) — collapsible, not selectable. */
  isFolder?: boolean;
  /** Label of the folder this file lives under (for collapse filtering). */
  parent?: string;
  /** true = hub-preview bundle entry: the name is known but the content is NOT
   *  exposed before install, so the row is listed and not selectable. */
  isManifest?: boolean;
}

/** Split a SKILL.md into its leading YAML frontmatter and the markdown body.
 *  Manus-style: the frontmatter renders as a labelled YAML code block instead
 *  of leaking in as loose paragraph text. Returns null frontmatter when the
 *  document has no `---` fenced header. */
function splitFrontmatter(text: string): { frontmatter: string | null; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatter: null, body: text };
  return { frontmatter: m[1], body: text.slice(m[0].length) };
}

/** `fetchJSON` throws `Error("<status>: <raw body>")` and FastAPI puts the real
 *  cause in a JSON `detail` (404 = the bundle didn't resolve, 502 = the fetch/
 *  scan itself blew up). Surface THAT text — never a reason of our own. */
function scanErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.match(/^(\d{3}): ([\s\S]*)$/);
  if (!m) return raw;
  const [, status, body] = m;
  try {
    const detail = (JSON.parse(body) as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail) return `${status} — ${detail}`;
  } catch {
    /* non-JSON body — fall through and show it verbatim */
  }
  return `${status} — ${body}`.trim();
}

/** ScanResult.verdict → icon + semantic tone. Only the three the scanner can
 *  emit; an unknown value degrades to a neutral shield instead of us guessing
 *  a risk level for it. */
const VERDICT_VISUAL: Record<string, { Icon: LucideIcon; tone: string; edge: string }> = {
  safe: { Icon: ShieldCheck, tone: "text-success", edge: "border-success/40" },
  caution: { Icon: ShieldAlert, tone: "text-warning", edge: "border-warning/40" },
  dangerous: { Icon: ShieldX, tone: "text-destructive", edge: "border-destructive/40" },
};

/** Finding.severity → tone. `critical` drives a dangerous verdict and `high` a
 *  caution one, so those two carry the DS alarm colors; medium/low never gate
 *  an install (see _determine_verdict) and stay quiet. */
const SEVERITY_TONE: Record<string, string> = {
  critical: "text-destructive",
  high: "text-warning",
  medium: "text-text-secondary",
  low: "text-text-tertiary",
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Visual result of `GET /api/skills/hub/scan` — the SAME scan_skill /
 * should_allow_install pipeline the CLI installer runs, without installing.
 *
 * Everything rendered here is a field the endpoint actually returns. The
 * install this modal offers spawns `skills install --yes` with NO `--force`,
 * which is exactly how `policy` was computed (force=False) — so a "blocked"
 * result is a real prediction of that install failing, not a warning we
 * invented.
 */
function ScanPanel({
  scan,
  scanning,
  error,
}: {
  scan: SkillHubScan | null;
  scanning: boolean;
  error: string | null;
}) {
  const { t } = useI18n();
  const s = t.skills.scan;

  // Highest severity first — presentation only; the backend emits findings in
  // file-walk order, which buries a critical under structural noise.
  const findings = useMemo(
    () =>
      scan
        ? [...scan.findings].sort(
            (a, b) =>
              (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
          )
        : [],
    [scan],
  );

  if (scanning) {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-current/15 px-3 py-2.5">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        {/* No progress bar: the endpoint reports no percentage. */}
        <span className="type-ui text-muted-foreground">{s.running}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
          <span className="type-ui font-medium text-destructive">{s.failed}</span>
        </div>
        <p className="mt-1 break-words font-mono text-[0.65rem] leading-relaxed text-text-tertiary">
          {error}
        </p>
      </div>
    );
  }

  if (!scan) return null;

  const v = VERDICT_VISUAL[scan.verdict] ?? {
    Icon: Shield,
    tone: "text-muted-foreground",
    edge: "border-current/15",
  };
  const verdictLabel =
    scan.verdict === "safe"
      ? s.verdictSafe
      : scan.verdict === "caution"
        ? s.verdictCaution
        : scan.verdict === "dangerous"
          ? s.verdictDangerous
          : scan.verdict; // unknown verdict → show the backend's own word

  const trustLabel =
    scan.trust_level === "builtin"
      ? s.trustBuiltin
      : scan.trust_level === "trusted"
        ? s.trustTrusted
        : scan.trust_level === "community"
          ? s.trustCommunity
          : scan.trust_level === "agent-created"
            ? s.trustAgentCreated
            : scan.trust_level; // unknown tier → raw value

  const policyLabel =
    scan.policy === "allow"
      ? s.policyAllow
      : scan.policy === "ask"
        ? s.policyAsk
        : s.policyBlock;
  const policyTone =
    scan.policy === "allow"
      ? "text-success"
      : scan.policy === "ask"
        ? "text-warning"
        : "text-destructive";
  const PolicyIcon =
    scan.policy === "allow" ? CheckCircle2 : scan.policy === "ask" ? CircleAlert : Ban;

  const sevLabel = (sev: string) =>
    sev === "critical"
      ? s.sevCritical
      : sev === "high"
        ? s.sevHigh
        : sev === "medium"
          ? s.sevMedium
          : sev === "low"
            ? s.sevLow
            : sev;

  return (
    <div className={cn("mb-5 overflow-hidden rounded-lg border", v.edge)}>
      {/* Verdict + trust tier. */}
      <div className="flex items-center gap-2.5 border-b border-current/10 px-3 py-2.5">
        <v.Icon className={cn("h-5 w-5 shrink-0", v.tone)} />
        <span className={cn("type-ui font-medium", v.tone)}>{verdictLabel}</span>
        <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 type-micro text-muted-foreground">
          {trustLabel}
        </span>
      </div>

      {/* Install-policy decision + the backend's own reason for it. */}
      <div className="flex items-start gap-2 border-b border-current/10 px-3 py-2.5">
        <PolicyIcon className={cn("mt-px h-3.5 w-3.5 shrink-0", policyTone)} />
        <div className="min-w-0 flex-1">
          <span className={cn("type-ui font-medium", policyTone)}>{policyLabel}</span>
          <p className="mt-0.5 break-words font-mono text-[0.65rem] leading-relaxed text-text-tertiary">
            {scan.policy_reason}
          </p>
        </div>
      </div>

      {/* Findings — severity, category, file:line and the scanner's own text. */}
      <div className="px-3 py-2.5">
        {findings.length === 0 ? (
          <span className="type-ui text-muted-foreground">{s.noFindings}</span>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {(["critical", "high", "medium", "low"] as const)
                .filter((k) => (scan.severity_counts[k] ?? 0) > 0)
                .map((k) => (
                  <span
                    key={k}
                    className={cn(
                      "rounded-full bg-current/5 px-2 py-0.5 type-micro",
                      SEVERITY_TONE[k],
                    )}
                  >
                    {sevLabel(k)} {scan.severity_counts[k]}
                  </span>
                ))}
            </div>
            <ul className="flex flex-col gap-1.5">
              {findings.map((f, i) => (
                <li
                  key={`${f.file}-${f.line}-${i}`}
                  className="flex items-start gap-2 rounded border border-current/10 px-2.5 py-1.5"
                >
                  <span
                    className={cn(
                      "shrink-0 type-micro font-medium uppercase tracking-wide",
                      SEVERITY_TONE[f.severity] ?? "text-muted-foreground",
                    )}
                  >
                    {sevLabel(f.severity)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="type-ui text-text-secondary">{f.description}</p>
                    <p className="mt-0.5 truncate font-mono text-[0.65rem] text-text-tertiary">
                      {prettyCat(f.category, t.common.general)} · {f.file}:{f.line}
                    </p>
                    {/* The offending snippet itself — so the user can judge the
                        scanner's claim instead of taking coordinates on faith.
                        Optional: absent against pre-fly196 backends. */}
                    {f.match && (
                      <code className="mt-1 block overflow-x-auto whitespace-pre rounded bg-muted/60 px-2 py-1 font-mono text-[0.7rem] text-foreground">
                        {f.match}
                      </code>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** Marketplace mode: read a not-yet-installed catalog skill from the hub and
 *  offer the install inline. Omitted = read the INSTALLED skill from disk. */
export interface SkillDetailHubSource {
  skill: SkillHubResult;
  installed: boolean;
  installing: boolean;
  /** Reason from the failed attempt (may be ""), or undefined when none. */
  failed?: string;
  onInstall: (skill: SkillHubResult) => void;
  /** Scopes the preview to that profile's hub sources. */
  profile?: string;
}

export function SkillDetailModal({
  open,
  skillName,
  onClose,
  hub,
}: {
  open: boolean;
  skillName: string | null;
  onClose: () => void;
  hub?: SkillDetailHubSource;
}) {
  const { t } = useI18n();

  // Stable primitives — `hub` is rebuilt by the parent on every render, so the
  // loader effect must not depend on the object identity.
  const hubIdentifier = hub?.skill.identifier;
  const hubProfile = hub?.profile;

  // SKILL.md content (the primary document).
  const [skillMd, setSkillMd] = useState("");
  const [skillPath, setSkillPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // File tree (SKILL.md always present; references/ discovered via Files API).
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<TreeNode | null>(null);

  // Body currently shown (SKILL.md or a reference file's decoded text).
  const [body, setBody] = useState("");
  const [bodyLoading, setBodyLoading] = useState(false);

  // Chrome state: "..." menu open + fullscreen toggle.
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Collapsed folder labels (references/ etc.). Folders start collapsed —
  // Manus-style "> references" dropdown you click to expand.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // On-demand security scan (hub source only). Never runs on open: the
  // endpoint downloads and quarantines the whole bundle.
  const [scan, setScan] = useState<SkillHubScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  // Bumped on every new request AND on skill change, so a scan still in flight
  // for the previous skill can't land its result on this one.
  const scanReqRef = useRef(0);

  /* ---- Escape closes + scroll lock while open ---- */
  useEffect(() => {
    if (!open) return;
    // Capture phase + stopPropagation: when this modal opens ON TOP of the
    // SettingsOverlay (Skills inside Settings), both listen for Escape on the
    // document. By intercepting on capture and blocking propagation, one
    // Escape closes only the skill detail — it doesn't take Settings down too.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  /* ---- Close the "..." menu on outside click ---- */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  /* ---- Reset chrome each time a new skill opens ---- */
  useEffect(() => {
    if (open) {
      setFullscreen(false);
      setMenuOpen(false);
      setCollapsedFolders(new Set());
      // Drop the previous skill's verdict and orphan any in-flight scan — a
      // stale result shown against another skill would be a lie.
      scanReqRef.current += 1;
      setScan(null);
      setScanError(null);
      setScanning(false);
    }
  }, [open, skillName]);

  /* ---- On-demand security scan ---- */
  const runScan = useCallback(() => {
    if (!hubIdentifier) return;
    const req = ++scanReqRef.current;
    setScanning(true);
    setScanError(null);
    api
      .scanSkillFromHub(hubIdentifier, hubProfile)
      .then((s) => {
        if (scanReqRef.current === req) setScan(s);
      })
      .catch((e: unknown) => {
        if (scanReqRef.current !== req) return;
        setScan(null);
        setScanError(scanErrorText(e));
      })
      .finally(() => {
        if (scanReqRef.current === req) setScanning(false);
      });
  }, [hubIdentifier, hubProfile]);

  /* ---- Load SKILL.md + attempt the references tree on open ---- */
  useEffect(() => {
    if (!open || !skillName) return;
    let cancelled = false;
    setLoading(true);
    setSkillMd("");
    setSkillPath(null);
    setBody("");

    const skillNode: TreeNode = {
      label: "SKILL.md",
      isSkillMd: true,
      depth: 0,
    };

    // HUB source: resolve the bundle without installing. The preview returns
    // the SKILL.md text plus the manifest as names only, so the bundle is
    // listed (real data) while only SKILL.md is readable.
    if (hubIdentifier) {
      api
        .previewSkillFromHub(hubIdentifier, hubProfile)
        .then((p) => {
          if (cancelled) return;
          setSkillMd(p.skill_md);
          setBody(p.skill_md);
          setSelected(skillNode);
          setTree([
            skillNode,
            ...p.files
              .filter((f) => f.toLowerCase() !== "skill.md")
              .sort((a, b) => a.localeCompare(b))
              .map<TreeNode>((f) => ({
                label: f,
                isSkillMd: false,
                depth: 0,
                isManifest: true,
              })),
          ]);
          setCollapsedFolders(new Set());
        })
        .catch(() => {
          if (cancelled) return;
          setSkillMd("");
          setBody("");
          setTree([skillNode]);
          setSelected(skillNode);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    api
      .getSkillContent(skillName)
      .then(async (c) => {
        if (cancelled) return;
        setSkillMd(c.content);
        setSkillPath(c.path);
        setBody(c.content);
        setSelected(skillNode);

        // Best-effort references tree. The skill dir is content.path minus the
        // trailing SKILL.md. If Files API can't reach it (outside the managed
        // root) we swallow the error and keep the SKILL.md-only tree. Each
        // folder's children stay grouped RIGHT AFTER their header (so collapse
        // filtering works) — top-level files and folders are sorted among
        // themselves, never interleaved with a folder's children.
        const dir = c.path.replace(/[\\/]SKILL\.md$/i, "");
        let nodes: TreeNode[] = [skillNode];
        const folderLabels: string[] = [];
        if (dir && dir !== c.path) {
          try {
            const listing = await api.listFiles(dir);
            const topFiles: TreeNode[] = [];
            const folders: { header: TreeNode; children: TreeNode[] }[] = [];
            for (const entry of listing.entries) {
              if (entry.name.toLowerCase() === "skill.md") continue;
              if (entry.is_directory) {
                const label = `${entry.name}/`;
                const header: TreeNode = {
                  label,
                  path: entry.path,
                  isSkillMd: false,
                  depth: 0,
                  isFolder: true,
                };
                const children: TreeNode[] = [];
                // One level into references-style dirs is enough for a reader.
                try {
                  const sub = await api.listFiles(entry.path);
                  for (const f of sub.entries) {
                    if (f.is_directory) continue;
                    children.push({
                      label: f.name,
                      path: f.path,
                      isSkillMd: false,
                      depth: 1,
                      parent: label,
                    });
                  }
                } catch {
                  /* nested listing failed — show the folder header alone */
                }
                children.sort((a, b) => a.label.localeCompare(b.label));
                folders.push({ header, children });
                folderLabels.push(label);
              } else {
                topFiles.push({
                  label: entry.name,
                  path: entry.path,
                  isSkillMd: false,
                  depth: 0,
                });
              }
            }
            topFiles.sort((a, b) => a.label.localeCompare(b.label));
            folders.sort((a, b) => a.header.label.localeCompare(b.header.label));
            nodes = [skillNode, ...topFiles];
            for (const f of folders) nodes.push(f.header, ...f.children);
          } catch {
            /* listFiles unreachable — graceful fallback to SKILL.md only */
          }
        }
        if (!cancelled) {
          setTree(nodes);
          setCollapsedFolders(new Set(folderLabels)); // start collapsed
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSkillMd("");
        setBody("");
        setTree([skillNode]);
        setSelected(skillNode);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, skillName, hubIdentifier, hubProfile]);

  /* ---- Select a tree node → load its body ---- */
  const selectNode = useCallback(
    (node: TreeNode) => {
      setSelected(node);
      if (node.isSkillMd) {
        setBody(skillMd);
        return;
      }
      if (!node.path) return;
      setBodyLoading(true);
      api
        .readFile(node.path)
        .then((f) => setBody(dataUrlToText(f.data_url)))
        .catch(() => setBody(""))
        .finally(() => setBodyLoading(false));
    },
    [skillMd],
  );

  const downloadCurrent = useCallback(() => {
    setMenuOpen(false);
    if (!skillName) return;
    downloadText(`${skillName}.md`, skillMd);
  }, [skillName, skillMd]);

  const isMarkdownBody = useMemo(() => {
    if (selected?.isSkillMd) return true;
    const label = selected?.label.toLowerCase() ?? "";
    return label.endsWith(".md") || label.endsWith(".markdown");
  }, [selected]);

  const toggleFolder = useCallback((label: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  // Hide a folder's children while collapsed. Folder headers + top-level
  // entries (SKILL.md, loose files) always show — so the sidebar never
  // disappears and the layout never shifts when a skill has no references.
  const visibleTree = useMemo(
    () => tree.filter((n) => !(n.parent && collapsedFolders.has(n.parent))),
    [tree, collapsedFolders],
  );

  // For SKILL.md, peel the YAML frontmatter out to render it as a labelled
  // code block (Manus-style). Reference files render verbatim.
  const doc = useMemo(
    () =>
      selected?.isSkillMd
        ? splitFrontmatter(body)
        : { frontmatter: null as string | null, body },
    [selected, body],
  );

  const copyYaml = useCallback(() => {
    if (doc.frontmatter) navigator.clipboard?.writeText(doc.frontmatter).catch(() => {});
  }, [doc.frontmatter]);

  if (!open || !skillName) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop — click closes. */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Card. `settings-modal` activates the Title Case softening. Fullscreen
          toggles between the fixed reading size and near-viewport. */}
      <div
        className={cn(
          "settings-modal relative flex w-full flex-col overflow-hidden rounded-xl",
          "border border-current/20 bg-background-base",
          "shadow-pop",
          fullscreen
            ? "h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:h-[calc(100vh-3rem)] sm:max-w-[calc(100vw-3rem)]"
            : "h-[min(90vh,940px)] max-w-[min(1400px,94vw)]",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={skillName}
      >
        {/* Top bar: name + "..." menu (Download), fullscreen, close. */}
        <div className="flex items-center gap-2 border-b border-current/10 px-4 py-2.5">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          {/* Friendly title when there's a label; otherwise the technical name
              (mono). Download and search keep using the real skillName. The
              marketplace (hub) shows ORIGINAL names — no friendly label. */}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              !hub && t.skillLabels[skillName]?.name ? "font-medium" : "font-mono-ui",
            )}
          >
            {(!hub && t.skillLabels[skillName]?.name) || skillName}
          </span>

          {hub && (
            <button
              type="button"
              onClick={runScan}
              disabled={scanning}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5",
                "type-ui text-muted-foreground transition-colors",
                "hover:bg-current/10 hover:text-foreground disabled:opacity-60",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40",
              )}
            >
              {scanning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Shield className="h-3.5 w-3.5" />
              )}
              {scanning
                ? t.skills.scan.running
                : scan || scanError
                  ? t.skills.scan.rerun
                  : t.skills.scan.run}
            </button>
          )}

          {hub && (
            <SkillInstallControl
              skill={hub.skill}
              installed={hub.installed}
              installing={hub.installing}
              failed={hub.failed}
              onInstall={hub.onInstall}
            />
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More"
              className={cn(
                "grid h-8 w-8 place-items-center rounded text-muted-foreground/80",
                "transition-colors hover:bg-current/10 hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40",
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                className={cn(
                  "absolute right-0 top-full z-10 mt-1 min-w-[10rem] overflow-hidden rounded-md",
                  "border border-current/20 bg-background-base shadow-lg",
                )}
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={downloadCurrent}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-current/10"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t.configUser.skDownload}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={t.configUser.skFullscreen}
            title={t.configUser.skFullscreen}
            className={cn(
              "grid h-8 w-8 place-items-center rounded text-muted-foreground/80",
              "transition-colors hover:bg-current/10 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40",
            )}
          >
            {fullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            title={t.common.close}
            className={cn(
              "grid h-8 w-8 place-items-center rounded text-muted-foreground/80",
              "transition-colors hover:bg-current/10 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40",
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: file tree (left) + document (right). The sidebar is ALWAYS
            present (SKILL.md at minimum) and the modal size is fixed, so the
            layout NEVER resizes/reflows between a skill with references and one
            without — a reference-less skill simply shows no reference entries. */}
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-current/10 p-2 sm:block">
            {visibleTree.map((node, i) => {
              if (node.isFolder) {
                const collapsed = collapsedFolders.has(node.label);
                return (
                  <button
                    key={`${node.label}-${i}`}
                    type="button"
                    onClick={() => toggleFolder(node.label)}
                    style={{ paddingLeft: `${0.5 + node.depth * 0.75}rem` }}
                    className="flex w-full items-center gap-1 truncate rounded px-2 py-1 text-left text-xs font-medium text-text-tertiary hover:bg-current/10"
                  >
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 shrink-0 transition-transform",
                        !collapsed && "rotate-90",
                      )}
                    />
                    <FolderClosed className="h-3 w-3 shrink-0 opacity-60" />
                    <span className="truncate">{node.label.replace(/\/$/, "")}</span>
                  </button>
                );
              }
              // Hub preview: the bundle's file names are known but their
              // contents aren't served before install — listed, not clickable.
              if (node.isManifest) {
                return (
                  <div
                    key={`${node.label}-${i}`}
                    style={{ paddingLeft: `${0.5 + node.depth * 0.75}rem` }}
                    className="flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-xs text-text-tertiary"
                  >
                    <FileText className="h-3 w-3 shrink-0 opacity-40" />
                    <span className="truncate">{node.label}</span>
                  </div>
                );
              }
              const isActive =
                selected != null &&
                (node.isSkillMd ? selected.isSkillMd : selected.path === node.path);
              return (
                <button
                  key={`${node.label}-${i}`}
                  type="button"
                  onClick={() => selectNode(node)}
                  style={{ paddingLeft: `${0.5 + node.depth * 0.75}rem` }}
                  className={cn(
                    "flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-xs hover:bg-current/10",
                    isActive && "bg-current/10 text-foreground",
                  )}
                >
                  <FileText className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="truncate">{node.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Document pane — content sits in a centred reading column so long
              lines never stretch across the wide modal. */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto w-full max-w-[820px]">
              {/* Above the document and outside its loading branch: the scan is
                  about the bundle, not the file being read. */}
              {hub && <ScanPanel scan={scan} scanning={scanning} error={scanError} />}
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : bodyLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : body.trim() === "" ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t.skills.noDescription}
                </p>
              ) : isMarkdownBody ? (
                <>
                  {doc.frontmatter && (
                    <div className="mb-5 overflow-hidden rounded-lg border border-current/15">
                      <div className="flex items-center justify-between border-b border-current/10 bg-current/[0.03] px-3 py-1.5">
                        <span className="font-mono-ui text-[0.7rem] uppercase tracking-wide text-text-tertiary">
                          YAML
                        </span>
                        <button
                          type="button"
                          onClick={copyYaml}
                          aria-label={t.configUser.skCopy}
                          title={t.configUser.skCopy}
                          className="grid h-6 w-6 place-items-center rounded text-muted-foreground/70 transition-colors hover:bg-current/10 hover:text-foreground"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed text-text-secondary">
                        {doc.frontmatter}
                      </pre>
                    </div>
                  )}
                  <Markdown content={doc.body} />
                </>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-secondary">
                  {body}
                </pre>
              )}
              {/* Provenance: the on-disk path once installed, the hub
                  identifier while previewing. */}
              {!loading && (skillPath || hub?.skill.identifier) && (
                <p className="mt-4 truncate font-mono text-[0.65rem] text-text-tertiary">
                  {skillPath || hub?.skill.identifier}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
