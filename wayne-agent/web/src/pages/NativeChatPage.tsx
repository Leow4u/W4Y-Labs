/**
 * NativeChatPage — the chat surface end users see by default. Talks to the
 * SAME gateway protocol the embedded terminal (ChatTerminalPage) does, over
 * its own /api/ws connection (session.create/resume, prompt.submit,
 * approval/clarify/sudo/secret.respond, session.interrupt) — no PTY. See
 * hooks/useChatSession.ts for the wire protocol notes.
 *
 * Presentation layer faithful to the benchmark (Manus, curation screenshots):
 * "Tarefas" column on the left; centered conversation; centered hero on a new
 * conversation; ⌘K = new task; disclaimer under the composer; mode (tier)
 * badge next to the agent name. Progress lives in the AssistantTurn checklist
 * and the dock (Plano block + the header's N/M pulse) — the composer chip was
 * removed on purpose (Onda 1 curation; D2.1 undid its D2 reinstatement).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AssistantTurn, type DetailMode } from "@/components/chat/AssistantTurn";
import { Composer } from "@/components/chat/Composer";
import { ConnectorsPicker } from "@/components/chat/ConnectorsPicker";
import { ContextPicker } from "@/components/chat/ContextPicker";
import { ModePicker, type ApprovalsMode } from "@/components/chat/ModePicker";
import { RunTargetPicker } from "@/components/chat/RunTargetPicker";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { PendingPromptPanel } from "@/components/chat/PendingPromptPanel";
import { ProjectWorkspace } from "@/components/chat/ProjectWorkspace";
import { SessionSwitcher } from "@/components/chat/SessionSwitcher";
import {
  RightDock,
  GENERIC_APP_SLUG,
  type DockChange,
  type DockSource,
} from "@/components/chat/RightDock";
import { isWebSourceTool } from "@/components/chat/ToolLine";
import { extractFileRefs, type FileRef } from "@/components/chat/FileRefCard";
import { TaskHeaderActions } from "@/components/chat/TaskHeaderActions";
import { UsageFooter } from "@/components/chat/UsageFooter";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useChatSession } from "@/hooks/useChatSession";
import { useI18n } from "@/i18n";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { api } from "@/lib/api";
import { inventory } from "@/lib/inventoryApi";
import { applyChatDisplay } from "@/lib/chat-display";
import {
  cloudGetJson,
  cloudMutateAvailable,
  cloudMutateJson,
  cloudReadFile,
  cloudRunAvailable,
  setCloudSessionActive,
  type RunTarget,
} from "@/lib/cloudSession";
import { registerLocalFileReader } from "@/lib/localFile";
import { isNotifyEnabled } from "@/lib/notify-prefs";
import {
  desktopDefaultWorkspace,
  getFilesRoot,
  getLastProject,
  isLocalEngine,
  projectCwd,
  resolveDesktopLocalDefault,
  setLastProject,
} from "@/lib/projects";
import { tierFromConfig, tierLabel, type TierKey } from "@/lib/tier-presets";
import { Bot, ChevronDown, X } from "lucide-react";
import type { SessionCreateOverrides } from "@/hooks/useChatSession";
import type { ChatMessage } from "@/components/chat/types";

// Cloud-target sessions send NO per-session overrides: the local desktop's
// config (free-tier default model) must not silently downgrade the session
// born on the user's cloud computer — the cloud tenant's own config decides.
// Module-level so the hook's effect deps see ONE stable reference.
const CLOUD_NO_OVERRIDES: SessionCreateOverrides = {};

export default function NativeChatPage({ isActive = true }: { isActive?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeId = searchParams.get("resume");
  // Conversation's project (workspace) — new sessions are born with the cwd of
  // the project folder (session.create {cwd}); see lib/projects.ts.
  const project = searchParams.get("project");
  // Chat WITH a specific agent (?agent=<slug>, coming from the Team x-ray):
  // the new session is born in ITS WAYNE_HOME (session.create {profile}) —
  // the agent's OWN soul, model, skills and memory. Note: the session lives in
  // the agent's state.db, so it does NOT show up under "Recentes" (which lists
  // the main one) — its history belongs to the agent itself.
  const agentParam = searchParams.get("agent");
  const [freshNonce, setFreshNonce] = useState(0);

  // "Nova tarefa" trigger (?new=1, from the nav item): ALWAYS starts a fresh
  // conversation on the chat hero — clears resume/home from the URL, keeps the
  // LAST project as context and forces a new session.create even if the page
  // was already in a conversation without ?resume (the chat is mounted
  // persistently, so without this "going back" re-showed the previous chat).
  // Safe arbitrary folder (Phase 3 "use existing folder") — absolute cwd
  // directly, when it is not a formal projects/ project.
  const cwdParam = searchParams.get("cwd");
  const wantsNew = searchParams.get("new") !== null;
  // ?ask=<prompt> (USE card of the Plugins hub) — read early to protect the
  // param from the "last project" replace below; consumed further down.
  const wantsAsk = searchParams.get("ask");
  useEffect(() => {
    if (!wantsNew) return;
    // "Nova tarefa" = new session IN THE LAST PROJECT (not empty — decision
    // 10/07). Keeps the saved project; saved "no project" → stays empty.
    const last = getLastProject();
    const next = new URLSearchParams();
    // Desktop (DL-06): a new task defaults to the LOCAL ~/Work4You workspace, so
    // the last cloud project must NOT be re-pinned over it — otherwise the chip
    // would show the local folder while the session ran the cloud project
    // (the local×cloud contradiction). Only an explicit "Executar na nuvem"
    // (getLastProject()===null → resolveDesktopLocalDefault()===null) lets the
    // cloud through. Off the desktop resolveDesktopLocalDefault() is null, so
    // the last project is kept exactly as before.
    if (last && !resolveDesktopLocalDefault()) next.set("project", last);
    setSearchParams(next, { replace: true });
    setFreshNonce((n) => n + 1);
  }, [wantsNew, setSearchParams]);

  // Project SPACE (workspace) screen only when explicit (?home=1 — clicking
  // the project in the sidebar / "Abrir espaço" in the dock). Without it,
  // ?project=<slug> is only the chat CONTEXT: hero with the project chip,
  // Codex style — otherwise "Nova tarefa" fell back into the space screen and
  // looked like it went nowhere (report 10/07).
  const wantsHome = searchParams.get("home") !== null;

  // On opening a "raw" /chat (no resume/project/cwd/new): applies the LAST
  // project as context. Only when the saved slug exists (NONE/undefined =
  // stays without a project). isActive is mandatory: /chat stays mounted
  // hidden and sees the query of the OTHER pages — without the guard, this
  // replace would wipe e.g. the ?path= of the Files screen.
  useEffect(() => {
    if (!isActive || resumeId || project || cwdParam || wantsNew || agentParam || wantsAsk)
      return;
    // Desktop (DL-06): a blank session defaults to the LOCAL workspace — do not
    // let the last cloud project hijack the raw hero (same reasoning as the
    // "Nova tarefa" branch above). resolveDesktopLocalDefault() is null off the
    // desktop and on an explicit "Executar na nuvem", so the web is unchanged.
    if (resolveDesktopLocalDefault()) return;
    const last = getLastProject();
    if (!last) return;
    setSearchParams(new URLSearchParams({ project: last }), { replace: true });
  }, [isActive, resumeId, project, cwdParam, wantsNew, agentParam, wantsAsk, setSearchParams]);

  // Persists the active workspace (formal project) to feed the "last" one.
  useEffect(() => {
    if (project) setLastProject(project);
  }, [project]);
  // "Ramificar" trigger from the sidebar (?resume=<id>&branch=1) — consumed
  // FURTHER DOWN (after the useChatSession destructure, it needs sessionReady/
  // branchChat) to avoid TDZ.
  const wantsBranch = searchParams.get("branch") === "1";
  const { setTitle, setEnd } = usePageHeader();
  const { t } = useI18n();
  const { showToast } = useToast();

  // Current tier → agent badge AND PER-SESSION overrides of session.create
  // (desktop contract: the composer sends model/effort on every create — so
  // switching the tier applies on the NEXT task already, with no /new nor
  // reload, and without depending on the global config reloading on a cold start).
  const [modeBadge, setModeBadge] = useState<string | null>(null);
  // Global permissions mode (approvals.mode manual|smart) — Piece 7.
  // On a cloud session this mirrors the CLOUD brain (bridge), not the local
  // engine — same pattern as TaskHeaderActions rename/archive.
  const [approvalsMode, setApprovalsMode] = useState<ApprovalsMode>("manual");
  const [overrides, setOverrides] = useState<SessionCreateOverrides | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api
      .getConfig()
      .then((cfg) => {
        if (cancelled) return;
        const base = (cfg ?? {}) as Record<string, unknown>;
        const model = typeof base.model === "string" ? base.model : "";
        const provider = typeof base.provider === "string" ? base.provider : undefined;
        const agent = (base.agent as Record<string, unknown> | undefined) ?? {};
        const reasoning =
          typeof agent.reasoning_effort === "string" ? agent.reasoning_effort : "medium";
        const tier = tierFromConfig(model, reasoning) as TierKey | null;
        setModeBadge(tier ? tierLabel(t, tier) : null);
        setOverrides({ model: model || undefined, provider, reasoningEffort: reasoning });
      })
      .catch(() => {
        // Config unavailable → create without overrides (do not block the chat).
        if (!cancelled) setOverrides({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Absolute root of the managed files (memoized in lib/projects) — needed to
  // build the project cwd before opening the session.
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    void getFilesRoot().then((r) => {
      if (!cancelled) setProjectRoot(r ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [project]);

  // DL-01, local-ENGINE mode (0.3.0): a session born with no explicit context
  // (no resume/project/cwd/agent) lands in the desktop's default workspace
  // (~/Work4You) as a NATIVE cwd — the local gateway simply runs there. No
  // executor arming, no local.session.set: this is the whole point of the
  // motor-local pivot. The workspace is an EXECUTION DIRECTORY, not a chosen
  // context (pivot rule, 17/07): it is NEVER presented as a project and the
  // NONE sentinel ("sem projeto") does not opt out of it — a free chat always
  // runs here. (The sentinel used to drop the cwd, silently landing free chats
  // in the engine's own process cwd — an invisible state the chip could not
  // distinguish.) Null everywhere else: web and cloud-shell get undefined
  // here, unchanged.
  const localEngineDefaultCwd =
    isLocalEngine() && !resumeId && !cwdParam && !project && !agentParam
      ? desktopDefaultWorkspace()
      : null;

  // ── S1 mini-computer: WHERE the chat about to be born runs ──────────────
  // Local-engine desktop only (cloudRunAvailable). The choice belongs to the
  // SESSION being created — it resets with every new session context and the
  // picker locks after the first message (same contract as the cwd: decided
  // at session.create, never moved after).
  const [runTarget, setRunTarget] = useState<RunTarget>("local");
  useEffect(() => {
    setRunTarget("local");
  }, [resumeId, freshNonce]);
  // S2: a CLOUD session reopened from the merged sidebar (?resume=<id>&
  // run=cloud). S1 wired the CREATE path; resume rides the SAME WsUrlProvider
  // — session.resume, history (bridge REST) and approvals all target the
  // cloud brain. Off the local-engine desktop cloudRunAvailable() is false
  // and the param is inert, so web and cloud-shell behave byte-identically.
  const cloudResume = !!resumeId && searchParams.get("run") === "cloud" && cloudRunAvailable();
  const cloudSession =
    cloudResume || (!resumeId && runTarget === "cloud" && cloudRunAvailable());

  // ModePicker Manual/Auto: load approvals.mode from the brain that owns the
  // session (cloud bridge vs local /api/config). Re-runs when run target flips.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = cloudSession
          ? await cloudGetJson<Record<string, unknown>>("/api/config", 8000)
          : await inventory.getConfig();
        if (cancelled || !cfg) return;
        const appr = (cfg.approvals as Record<string, unknown> | undefined) ?? {};
        setApprovalsMode(appr.mode === "smart" ? "smart" : "manual");
      } catch {
        /* keep previous mode — picker still usable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudSession]);

  // cwd: absolute ?cwd (existing folder) wins; otherwise projects/<slug>.
  // A CLOUD session is born with NO cwd on purpose: every folder this page
  // can name lives on THIS machine (local projects, ~/Work4You), and shipping
  // one to the cloud gateway would promise a folder that isn't there — the
  // tenant's own default workspace applies instead.
  const cwd = cloudSession
    ? undefined
    : cwdParam
      ? cwdParam
      : project && projectRoot
        ? projectCwd(projectRoot, project)
        : localEngineDefaultCwd ?? undefined;
  // Holds the connection until we resolve: (a) the workspace root when there is a
  // project and (b) the current tier (create overrides) — else the session is born
  // wrong. A cloud session depends on NEITHER (no cwd, no local overrides).
  const sessionEnabled = cloudSession
    ? true
    : (!project || cwdParam !== null || projectRoot !== null) && overrides !== null;
  const effectiveOverrides = cloudSession ? CLOUD_NO_OVERRIDES : overrides;

  // Local-mode SUBMIT GATE (bug fix). The session is born with the CLOUD cwd and
  // only switched to Local by local.session.set — so every prompt.submit MUST be
  // preceded by that switch. handleSend already re-asserts it, but a message the
  // user sends BEFORE the session finished connecting is parked in the hook's
  // pendingSend queue and later dispatched by the hook itself, bypassing
  // handleSend — the first hero turn then raced ahead of local.session.set and
  // ran in the CLOUD (with no fail-closed, because env_type was never set). The
  // hook now awaits this gate right before EVERY prompt.submit, in both the
  // direct and the queued path, so Local is guaranteed armed first. Kept behind a
  // ref so the stable callback below always sees the live folder/session without
  // re-subscribing the hook. Idempotent; a no-op when there is no local folder.
  const armLocalRef = useRef<(() => Promise<void>) | null>(null);
  const beforeSubmit = useCallback(() => armLocalRef.current?.(), []);

  const {
    messages,
    connectionState,
    busy,
    pendingPrompt,
    title,
    error,
    progress,
    lastResult,
    liveInfo,
    notices,
    dismissNotice,
    localEnv,
    readLocalFile,
    storedSessionId,
    sessionReady,
    sendMessage,
    interrupt,
    attachImage,
    attachFile,
    steer,
    undoTurn,
    compressChat,
    branchChat,
    setSessionYolo,
    setSessionConnectorsDisabled,
    contextBreakdown,
    completeSlash,
    completePath,
    execSlash,
    respondApproval,
    respondClarify,
    respondSudo,
    respondSecret,
  } = useChatSession(
    resumeId,
    freshNonce,
    cwd,
    sessionEnabled,
    effectiveOverrides,
    agentParam,
    beforeSubmit,
    cloudSession ? "cloud" : "local",
  );

  // While THIS page owns a live CLOUD session, dock/card file reads route
  // through the shell's cloud API bridge (lib/cloudSession registry) — the
  // same registry pattern as the local-file reader below. Cleared on target
  // change/unmount so no other screen inherits the routing.
  useEffect(() => {
    setCloudSessionActive(cloudSession);
    return () => setCloudSessionActive(false);
  }, [cloudSession]);

  // Per-session connector toggles (composer "Conectores"). The OFF set lives
  // HERE (the picker remounts on hero→conversation) and is persisted per
  // stored session so a reload/resume re-arms the engine-side gate — which is
  // in-memory and dies with the engine process.
  const connectorsOffKey = storedSessionId
    ? `wayne:connectors-off:${storedSessionId}`
    : null;
  const [connectorsOff, setConnectorsOff] = useState<string[]>([]);
  useEffect(() => {
    // New chat identity → start clean; a stored one restores its saved set.
    if (!connectorsOffKey) {
      setConnectorsOff([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(connectorsOffKey);
      if (raw) setConnectorsOff(JSON.parse(raw) as string[]);
    } catch {
      /* private mode / corrupt entry — keep current state */
    }
  }, [connectorsOffKey]);
  useEffect(() => {
    if (!connectorsOffKey) return;
    try {
      if (connectorsOff.length > 0)
        window.localStorage.setItem(connectorsOffKey, JSON.stringify(connectorsOff));
      else window.localStorage.removeItem(connectorsOffKey);
    } catch {
      /* private mode */
    }
  }, [connectorsOffKey, connectorsOff]);
  useEffect(() => {
    // (Re)assert on the live session: on every change and once at ready —
    // the empty send keeps engine state consistent with a cleared UI.
    if (!sessionReady) return;
    void setSessionConnectorsDisabled(connectorsOff);
  }, [sessionReady, connectorsOff, setSessionConnectorsDisabled]);

  // Active local folder (Local desktop mode). The state lives HERE, not in the
  // ContextPicker (which remounts on hero→conversation and would lose the
  // selection) — this way the chip survives and the override is re-asserted on
  // the session that actually runs. PERSISTED on purpose: an app reload (or a
  // gateway restart, e.g. a deploy) wiped the binding and the conversation fell
  // back to the Cloud SILENTLY — writing to the WRONG machine. Now the binding
  // comes back and is re-asserted.
  const [activeLocalFolder, setActiveLocalFolder] = useState<string | null>(() => {
    // Local-engine mode: sessions are local by NATURE (native cwd on this
    // machine) — there is no executor to arm, so the Desktop-1 "local folder"
    // binding never applies. A stored binding from another era must not
    // resurrect it either.
    if (isLocalEngine()) return null;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem("wayne:local-folder");
    } catch {
      /* private mode — fall through to the desktop default */
    }
    if (stored) return stored;
    // An explicit per-session context owns the environment — a resumed chat, a
    // formal project, or an arbitrary cwd all came with their own workspace, so
    // the desktop local DEFAULT must not override them (that would flip a cloud
    // project to Local). The stored binding above still wins on reload so a Local
    // session restores itself. Only the truly blank hero falls through here.
    if (resumeId || project || cwdParam) return null;
    // DL-03/DL-01: the INVERSION. On the desktop a fresh chat with no project/
    // cwd/folder chosen defaults to the local workspace (~/Work4You) and arms the
    // executor automatically — REUSING the same activeLocalFolder path the picker's
    // chooseLocal drives (session-ready effect below + handleSend re-assert). No
    // modal. On the web this returns null, so no project still means the cloud.
    return resolveDesktopLocalDefault();
  });
  useEffect(() => {
    try {
      if (activeLocalFolder) window.localStorage.setItem("wayne:local-folder", activeLocalFolder);
      else window.localStorage.removeItem("wayne:local-folder");
    } catch {
      /* private mode */
    }
  }, [activeLocalFolder]);

  // Local-file seam for the dock: while THIS page owns the live session,
  // user-machine paths (C:\… / MSYS /c/…) in Preview/Code/Saídas read through
  // the session's desktop executor (gateway local.fs.read). Cloud paths are
  // untouched — lib/localFile only routes paths that match the local shapes,
  // and any failure resolves null so the dock falls to its clean error state.
  useEffect(() => {
    // Local-engine mode: the gateway reads this disk itself (/api/fs), so the
    // executor reader stays OFF — lib/localFile routes local paths to the
    // server directly in that mode.
    if (isLocalEngine()) return;
    registerLocalFileReader((p) => readLocalFile(p));
    return () => registerLocalFileReader(null);
  }, [readLocalFile]);

  // Session ready + active local folder → re-asserts the override AND re-registers
  // the executor under THIS session's key. Both together: the override alone would
  // leave the session marked "local" with no arm (it now fails closed, and the user
  // would be stuck).
  useEffect(() => {
    // Local-engine mode: never arm — the session is already local by nature.
    if (isLocalEngine()) return;
    if (!sessionReady || !activeLocalFolder) return;
    const desk = (
      window as unknown as {
        work4youDesktop?: { isDesktop?: boolean; setLocal?: (k: string) => Promise<unknown> };
      }
    ).work4youDesktop;
    if (!desk?.isDesktop) {
      // Plain browser: a local folder does not exist here. Marking the session as
      // local with no arm would leave it stuck — so clear the binding and stay on
      // the Cloud.
      setActiveLocalFolder(null);
      return;
    }
    void (async () => {
      try {
        if (storedSessionId) await desk.setLocal?.(storedSessionId);
        await localEnv(true, activeLocalFolder);
      } catch {
        /* the turn fails closed with a clear message if the arm does not come up */
      }
    })();
  }, [sessionReady, activeLocalFolder, localEnv, storedSessionId]);

  // Keeps the submit gate (beforeSubmit) pointed at a function that arms Local for
  // THIS session with the CURRENT folder — awaited by the hook right before every
  // prompt.submit (see the gate note above). Same wiring as the session-ready
  // effect, but reached synchronously on the send path so the queued first hero
  // message can no longer outrun local.session.set. No-op off the desktop or with
  // no active local folder (returns to the cloud unchanged).
  useEffect(() => {
    armLocalRef.current = async () => {
      // Local-engine mode: the submit gate is a no-op — nothing to arm.
      if (isLocalEngine()) return;
      if (!activeLocalFolder) return;
      const desk = (
        window as unknown as {
          work4youDesktop?: { isDesktop?: boolean; setLocal?: (k: string) => Promise<unknown> };
        }
      ).work4youDesktop;
      if (!desk?.isDesktop) return;
      if (storedSessionId) await desk.setLocal?.(storedSessionId);
      await localEnv(true, activeLocalFolder);
    };
  }, [activeLocalFolder, storedSessionId, localEnv]);

  // "Ramificar" trigger from the sidebar menu (?resume=<id>&branch=1): the
  // SidebarTasks is REST-only (no gateway connection), so it just navigates
  // here; this page resumes <id> and, once the session is connected, fires
  // session.branch and swaps the URL to the branched id (?new=1 pattern).
  //
  // GOTCHA (the cause of "it does not branch"): on the commit where resumeId
  // changes, the effects run with the OLD closure — sessionReady=true from the
  // PREVIOUS session, while sessionIdRef was already cleared by the switch.
  // branchChat() hit the early-return null and the .then wiped branch=1 from
  // the URL before the right session connected. The `storedSessionId ===
  // resumeId` guard only lets it fire when the READY session is the TARGET
  // session (on resume, the hook sets storedSessionId = resumeId); the ref
  // holds back in-flight re-fires.
  const branchingRef = useRef(false);
  useEffect(() => {
    if (!wantsBranch || !sessionReady) return;
    if (!resumeId || storedSessionId !== resumeId) return;
    if (branchingRef.current) return;
    branchingRef.current = true;
    void branchChat().then((newId) => {
      // A null newId here = a REAL RPC failure (the session was ready) — the
      // reason was already surfaced in the banner by branchChat/setError. In
      // both cases it consumes branch=1 (success navigates to the new id).
      setSearchParams(new URLSearchParams({ resume: newId ?? resumeId }), { replace: true });
      branchingRef.current = false;
    });
  }, [wantsBranch, sessionReady, storedSessionId, resumeId, branchChat, setSearchParams]);

  // ── Attachments ("+" menu, desktop style): image → upload + image.attach;
  //    other files → file.attach (data_url straight to the gateway). ──
  const [attached, setAttached] = useState<
    Array<{ name: string; rel?: string; kind: "image" | "file"; previewUrl?: string }>
  >([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  // Everything attached during THIS task (pending AND already sent) — feeds
  // the dock's "Fontes" block. `attached` alone empties on send, so the block
  // would forget the task's sources mid-conversation. Reset with the session.
  const [taskSources, setTaskSources] = useState<DockSource[]>([]);
  useEffect(() => {
    setTaskSources([]);
  }, [resumeId, freshNonce]);
  // Connected Composio apps — the KNOWN set the dock's "Fontes" tests the
  // session's tool-calls against (see usedAppSlugs). Fetched per session;
  // connectors rarely change mid-task. Queries BOTH scopes: "global" (tenant,
  // mirrors the connect submenu) AND the current agent scope when the session is
  // pinned to an agent (?agent=…) — an app connected only per-agent lives under
  // its own scope (web_server.py "composio_agente") and would otherwise be
  // invisible here. Slugs from both are merged.
  const [connectedSlugs, setConnectedSlugs] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const scopes = agentParam ? ["global", agentParam] : ["global"];
    Promise.all(scopes.map((scope) => api.getConnectorsStatus(scope).catch(() => null)))
      .then((results) => {
        if (!alive) return;
        const slugs = new Set<string>();
        for (const r of results) {
          if (!r) continue;
          for (const a of r.accounts) {
            if (a.status !== "ACTIVE") continue;
            const s = (a.toolkit || "").toLowerCase();
            if (s) slugs.add(s);
          }
        }
        setConnectedSlugs([...slugs]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [agentParam]);
  const handleAttach = useCallback(
    async (files: File[]) => {
      setAttaching(true);
      setAttachError(null);
      try {
        for (const f of files) {
          // Cloud session (S1): the image fast-path uploads to the LOCAL
          // gateway's disk and attaches by path — a path the cloud gateway
          // cannot see. Route EVERYTHING through file.attach instead: the
          // bytes ride the WS as a data_url and materialize on the cloud
          // computer (its designed remote case). Degrade: the image lands as
          // a readable file, not a vision attachment.
          if (f.type.startsWith("image/") && !cloudSession) {
            const root = await getFilesRoot();
            if (!root) throw new Error("files root unavailable");
            await api.createDirectory("uploads").catch(() => {});
            const rel = `uploads/${Date.now()}-${f.name}`;
            await api.uploadFile(rel, f, true);
            const ok = await attachImage(`${root}/${rel}`);
            if (!ok) throw new Error(f.name);
            // REAL thumbnail on the chip (Onda 4) — local object URL, revoked
            // when the attachment is removed/consumed.
            setAttached((prev) => [
              ...prev,
              { name: f.name, rel, kind: "image", previewUrl: URL.createObjectURL(f) },
            ]);
            setTaskSources((prev) => [...prev, { name: f.name, kind: "image" }]);
          } else {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result));
              r.onerror = () => reject(new Error(f.name));
              r.readAsDataURL(f);
            });
            const ok = await attachFile(f.name, dataUrl);
            if (!ok) throw new Error(f.name);
            setAttached((prev) => [...prev, { name: f.name, kind: "file" }]);
            setTaskSources((prev) => [...prev, { name: f.name, kind: "file" }]);
          }
        }
      } catch (e) {
        setAttachError(`${t.status.error}: ${e instanceof Error ? e.message : e}`);
      } finally {
        setAttaching(false);
      }
    },
    [attachImage, attachFile, cloudSession, t.status.error],
  );

  // Pasting a workspace PATH into the field → attaches (Onda 4). Images use
  // image.attach straight on the server path (thumbnail via files/read);
  // the rest are read through /api/files/read → file.attach (data_url).
  // Cloud session: the pasted path lives on the CLOUD computer — image.attach
  // already resolves there (it rides the session's WS); the byte reads go
  // through the shell's cloud bridge instead of the local gateway.
  const handleAttachPath = useCallback(
    async (path: string) => {
      setAttaching(true);
      setAttachError(null);
      const name = path.split(/[/\\]/).pop() || path;
      const readManaged = async (p: string) =>
        cloudSession ? await cloudReadFile(p) : await api.readFile(p);
      try {
        if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(path)) {
          const ok = await attachImage(path);
          if (!ok) throw new Error(name);
          const preview = await readManaged(path).catch(() => null);
          setAttached((prev) => [
            ...prev,
            { name, kind: "image", previewUrl: preview?.data_url },
          ]);
          setTaskSources((prev) => [...prev, { name, kind: "image" }]);
        } else {
          const res = await readManaged(path);
          if (!res) throw new Error(name);
          const ok = await attachFile(res.name || name, res.data_url);
          if (!ok) throw new Error(name);
          setAttached((prev) => [...prev, { name: res.name || name, kind: "file" }]);
          setTaskSources((prev) => [...prev, { name: res.name || name, kind: "file" }]);
        }
      } catch (e) {
        setAttachError(`${t.status.error}: ${e instanceof Error ? e.message : e}`);
      } finally {
        setAttaching(false);
      }
    },
    [attachImage, attachFile, cloudSession, t.status.error],
  );

  const handleSend = useCallback(
    async (text: string) => {
      // Local mode: RE-ASSERTS the override on the CURRENT session before
      // submitting. env_type/cwd may have been reset (hero→conversation session
      // switch, or a previous turn's _register_session_cwd) — without this the
      // turn falls back to the Cloud. Idempotent; it only costs one RPC when
      // there is an active local folder.
      if (activeLocalFolder) {
        try {
          await localEnv(true, activeLocalFolder);
        } catch {
          /* carry on anyway */
        }
      }
      // The attached images are consumed by this prompt — they go into the
      // user bubble (thumbs via /api/files/read).
      sendMessage(
        text,
        attached.filter((a) => a.kind === "image" && a.rel).map((a) => a.rel as string),
      );
      setAttached((prev) => { prev.forEach((a) => { if (a.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(a.previewUrl); }); return []; });
      setAttachError(null);
    },
    [sendMessage, attached, activeLocalFolder, localEnv],
  );

  // ── Onda 1: grouping into TURNS ──────────────────────────────────────
  // Consecutive assistant messages = one turn (one header, one activity, one
  // reply). User/system/orphan tool become single-message turns.
  const turns = useMemo(() => {
    type Turn = {
      key: string;
      kind: "assistant" | "other";
      messages: ChatMessage[];
      isLast: boolean;
    };
    const out: Turn[] = [];
    for (const m of messages) {
      const last = out[out.length - 1];
      if (m.role === "assistant") {
        if (last && last.kind === "assistant") last.messages.push(m);
        else out.push({ key: m.id, kind: "assistant", messages: [m], isLast: false });
      } else {
        out.push({ key: m.id, kind: "other", messages: [m], isLast: false });
      }
    }
    if (out.length) out[out.length - 1].isLast = true;
    return out;
  }, [messages]);

  // Work detail mode (hidden/collapsed/expanded) — default "collapsed" (shows
  // it happening, shrinks at the end), persisted locally.
  const [detailMode, setDetailMode] = useState<DetailMode>(() => {
    try {
      const v = window.localStorage.getItem("wayne:detail-mode");
      return v === "hidden" || v === "expanded" ? v : "collapsed";
    } catch {
      return "collapsed";
    }
  });
  const setDetailModePersist = useCallback((m: DetailMode) => {
    setDetailMode(m);
    try {
      window.localStorage.setItem("wayne:detail-mode", m);
    } catch {
      /* private mode — it just does not persist */
    }
  }, []);

  // Last assistant reply — feeds voice mode (speaks what arrived) and
  // auto-speak (reads every finished reply). `content` accumulates live via
  // message.delta, so it serves both the in-progress turn (pending=true) and
  // the already-closed history.
  const lastAssistantReply = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    const text = last?.content?.trim();
    if (!last || !text) return null;
    return { id: last.id, text, pending: !!last.streaming };
  }, [messages]);

  // ── Onda 2: data for the "Ambiente" card ─────────────────────────────
  // PURE derivation from what already arrives over the session: URLs from the
  // web tools, +N −M from the inline_diff. Zero new backend.
  const envData = useMemo(() => {
    const urls: Array<{ url: string; domain: string; title?: string; shot?: string }> = [];
    const seenUrl = new Set<string>();
    const filesMap = new Map<string, { added: number; removed: number }>();
    const URL_RE = /https?:\/\/[^\s"'`<>)\]}]+/;
    const WEBBY = /browser|web|fetch|http|url|navigate|visit|search|request/i;
    // The agent's browser returns a title and saves a PNG screenshot in the
    // cache — we fish both out of the raw result for the Browser card (title +
    // thumbnail).
    const TITLE_RE = /"title"\s*:\s*"([^"]{1,160})"|\bTitle:\s*([^\n]{1,160})/;
    const SHOT_RE = /[\w~/\\.-]*screenshots[\w/\\.-]*\.png/;
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const tc of m.toolCalls) {
        const hay = tc.argsPreview ?? "";
        if (WEBBY.test(tc.name)) {
          const u = hay.match(URL_RE)?.[0];
          if (u && !seenUrl.has(u)) {
            seenUrl.add(u);
            try {
              const res = tc.result ?? "";
              const tm = res.match(TITLE_RE);
              urls.push({
                url: u,
                domain: new URL(u).hostname.replace(/^www\./, ""),
                title: (tm?.[1] ?? tm?.[2])?.trim() || undefined,
                shot: res.match(SHOT_RE)?.[0] || undefined,
              });
            } catch {
              /* malformed URL in the preview — ignore */
            }
          }
        }
        if (tc.inlineDiff) {
          let added = 0;
          let removed = 0;
          for (const l of tc.inlineDiff.split("\n")) {
            if (l.startsWith("+") && !l.startsWith("+++")) added++;
            else if (l.startsWith("-") && !l.startsWith("---")) removed++;
          }
          const pm =
            tc.inlineDiff.match(/^\+\+\+ b\/(.+)$/m) ?? tc.inlineDiff.match(/^--- a\/(.+)$/m);
          const path = (pm?.[1] ?? hay.split("\n")[0]?.trim()) || tc.name;
          const prev = filesMap.get(path) ?? { added: 0, removed: 0 };
          filesMap.set(path, { added: prev.added + added, removed: prev.removed + removed });
        }
      }
    }
    const files = [...filesMap.entries()].map(([path, v]) => ({ path, ...v }));
    return {
      urls,
      files,
      added: files.reduce((a, f) => a + f.added, 0),
      removed: files.reduce((a, f) => a + f.removed, 0),
    };
  }, [messages]);

  // Onda 5: full per-file diffs for the "Alterações" dock.
  const dockChanges = useMemo<DockChange[]>(() => {
    const map = new Map<string, string>();
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const tc of m.toolCalls) {
        if (!tc.inlineDiff) continue;
        const pm =
          tc.inlineDiff.match(/^\+\+\+ b\/(.+)$/m) ?? tc.inlineDiff.match(/^--- a\/(.+)$/m);
        const path = (pm?.[1] ?? tc.argsPreview?.split("\n")[0]?.trim()) || tc.name;
        map.set(path, (map.get(path) ? map.get(path) + "\n" : "") + tc.inlineDiff);
      }
    }
    return [...map.entries()].map(([path, diff]) => ({ path, diff }));
  }, [messages]);

  // ── Onda D1: "Saídas" — every file the agent produced this task. Same
  // parser the chat cards already use (MEDIA:/@session/bare-path tokens in
  // FileRefCard), aggregated across assistant messages, deduped. ──
  const dockOutputs = useMemo<FileRef[]>(() => {
    const out: FileRef[] = [];
    const seen = new Set<string>();
    for (const m of messages) {
      if (m.role !== "assistant" || !m.content) continue;
      for (const f of extractFileRefs(m.content).files) {
        const key = f.path ?? f.url ?? f.name;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(f);
      }
    }
    return out;
  }, [messages]);

  // Onda D2.2: connected apps the agent used, recognized by INVERSION. Composio
  // enters the agent as an MCP server (entry "composio" global / "composio_agente"
  // per-agent — wayne_cli/web_server.py:2001-2002) and every MCP tool is
  // registered as mcp_<server>_<tool> (tools/mcp_tool.py:3941, case-preserved) —
  // so a connector action arrives in tool.start/history verbatim as e.g.
  // mcp_composio_GMAIL_FETCH_EMAILS (useChatSession.ts:757 sets tc.name raw).
  // Earlier waves tried to PARSE that unknown <TOOLKIT>_<ACTION> shape with a
  // regex and failed (multi-word slugs, ambiguous word boundaries). Instead we
  // test the KNOWN, small set of connected slugs against the tool names: a slug
  // that appears as a substring of any mcp_composio* tool-call was used. Robust
  // because we never guess the format — we match against what we know. Each slug
  // becomes a chip; RightDock resolves its logo via the catalog. COMPOSIO_* are
  // meta tools (search/execute), not an app — the "composio" slug is skipped.
  const usedAppSlugs = useMemo<string[]>(() => {
    // Any tool named mcp_composio* (covers mcp_composio_ and mcp_composio_agente_,
    // case-insensitive) means a connected app WAS used — guaranteed by contract,
    // never a guess. Collect those names first.
    const names: string[] = [];
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const tc of m.toolCalls) {
        const n = tc.name.toLowerCase();
        if (n.startsWith("mcp_composio")) names.push(n);
      }
    }
    if (names.length === 0) return [];
    // Match the KNOWN connected slugs against the (unknown-format) tool names —
    // the only reliable mapping to a logo. COMPOSIO_* meta tools aren't an app.
    const used = new Set<string>();
    for (const slug of connectedSlugs) {
      if (slug === "composio") continue;
      if (names.some((n) => n.includes(slug))) used.add(slug);
    }
    const out = [...used];
    // Never silent: a mcp_composio* ran, so if NO known slug matched (connectors
    // fetch failed, per-agent-only connection, or an unrecognized toolkit name)
    // still surface a generic "Connected app" chip rather than showing nothing.
    if (out.length === 0) out.push(GENERIC_APP_SLUG);
    return out;
  }, [messages, connectedSlugs]);

  // Onda D2.2: "Internet" as a Fonte — external context, distinct from a
  // connected app. Reuses ToolLine's proven `toolWeb` category (web_search /
  // web_extract / browser_* / WebFetch …). Composio tool-calls are excluded:
  // an action like GMAIL_FETCH_EMAILS contains "fetch" (a web token) but is a
  // connected app, already covered above — not the open internet.
  const usedWeb = useMemo<boolean>(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const tc of m.toolCalls) {
        if (tc.name.toLowerCase().startsWith("mcp_composio")) continue;
        if (isWebSourceTool(tc.name)) return true;
      }
    }
    return false;
  }, [messages]);

  // Onda D1: "Fontes" — the task's attachments. taskSources covers what was
  // attached in THIS pageview; user-message images cover a resumed live turn.
  // Uploaded images gain a `<timestamp>-` basename prefix — strip it so the
  // same attachment doesn't show twice under two names.
  const dockSources = useMemo<DockSource[]>(() => {
    const out: DockSource[] = [];
    // Internet chip first — external context sits with the connected apps, ahead
    // of the task's file attachments.
    if (usedWeb) out.push({ name: "internet", kind: "web" });
    out.push(...taskSources);
    const seen = new Set(out.map((s) => s.name));
    for (const m of messages) {
      if (m.role !== "user" || !m.images) continue;
      for (const rel of m.images) {
        const name = (rel.split(/[/\\]/).pop() || rel).replace(/^\d{10,}-/, "");
        if (seen.has(name)) continue;
        seen.add(name);
        out.push({ name, kind: "image" });
      }
    }
    return out;
  }, [taskSources, messages, usedWeb]);

  // ── Signals for the dock: auto-preview of generated .html + git refresh ──
  // (Manus benchmark: the page Wayne creates opens by itself in the panel).
  const [dockSignal, setDockSignal] = useState<{
    tab: "env" | "plan" | "preview" | "code" | "files" | "changes" | "project";
    path?: string;
    nonce: number;
  } | null>(null);
  const [gitTick, setGitTick] = useState(0);
  const lastHtmlRef = useRef<string | null>(null);
  const dockBusyRef = useRef(false);
  useEffect(() => {
    const was = dockBusyRef.current;
    dockBusyRef.current = busy;
    if (was && !busy) {
      // End of turn: re-queries git and, if the turn produced a NEW .html,
      // opens the Preview with it. Two sources, same dedupe: dockChanges
      // (inline_diff — cloud file tools) and, when no diff carried it, the
      // parsed Saídas cards (dockOutputs). Local (desktop) mode writes via
      // the shell executor and produces NO inline_diff, so the Saídas parse
      // is the only trace of the generated page there — and it also catches
      // cloud files announced in prose only.
      setGitTick((n) => n + 1);
      const html =
        [...dockChanges].reverse().find((c) => /\.html?$/i.test(c.path))?.path ??
        [...dockOutputs].reverse().find((f) => !f.url && f.path && /\.html?$/i.test(f.path))
          ?.path;
      if (html && html !== lastHtmlRef.current) {
        lastHtmlRef.current = html;
        // The agent writes absolute paths (/opt/data/… or C:\… / /c/… in
        // Local mode) — the dock readers resolve both; pass it through as-is.
        setDockSignal((s) => ({ tab: "preview", path: html, nonce: (s?.nonce ?? 0) + 1 }));
      }
    }
  }, [busy, dockChanges, dockOutputs]);

  // ── "Code" piece: permissions mode + automatic repo clone ───────────
  // Cloud session → PUT /api/config on the cloud brain via bridge (TaskHeader
  // pattern). Local → same-origin api.saveConfig as before.
  const handleSetApprovalsMode = useCallback(
    (m: ApprovalsMode) => {
      setApprovalsMode(m);
      void (async () => {
        if (cloudSession) {
          if (!cloudMutateAvailable()) {
            showToast(t.cron.cloudUnavailable, "error");
            return;
          }
          const r = await cloudMutateJson<{ ok?: boolean }>(
            "/api/config",
            "PUT",
            { config: { approvals: { mode: m } } },
            8000,
          );
          if (!r) showToast(t.cron.cloudUnavailable, "error");
          return;
        }
        try {
          await inventory.saveConfig({ approvals: { mode: m } });
        } catch {
          /* local save best-effort — same as before */
        }
      })();
    },
    [cloudSession, showToast, t.cron.cloudUnavailable],
  );

  // ?clone=<url> (coming from "Selecionar repo…"): once the project session is
  // ready, fires the clone prompt ONCE and clears the parameter.
  const wantsClone = searchParams.get("clone");
  const cloneFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!wantsClone || !sessionReady || cloneFiredRef.current === wantsClone) return;
    cloneFiredRef.current = wantsClone;
    sendMessage(t.chat.repoClonePrompt.replace("{url}", wantsClone));
    const next = new URLSearchParams(searchParams);
    next.delete("clone");
    setSearchParams(next, { replace: true });
  }, [wantsClone, sessionReady, sendMessage, searchParams, setSearchParams, t]);

  // ?ask=<prompt> (coming from the USE card of the Plugins hub): once the
  // session is ready, fires the pre-built task ONCE and clears the parameter.
  // If the app is not connected, the agent itself drives the connect-by-chat.
  const askFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!wantsAsk || !sessionReady || askFiredRef.current === wantsAsk) return;
    askFiredRef.current = wantsAsk;
    sendMessage(wantsAsk);
    const next = new URLSearchParams(searchParams);
    next.delete("ask");
    setSearchParams(next, { replace: true });
  }, [wantsAsk, sessionReady, sendMessage, searchParams, setSearchParams]);

  // ── Browser notification (claude.ai parity, feedback 09/07) ─────────
  // While the permission is "default", a nudge above the composer offers to
  // enable it; once granted, the END of the turn with the tab in the
  // background becomes a native notification (clicking brings the tab back).
  const [, setNotifyTick] = useState(0);
  // Display preferences (transcript size/width) — stamps the CSS vars on boot;
  // Settings changes them live through the same lib.
  useEffect(() => {
    applyChatDisplay();
  }, []);
  const notifyBusyRef = useRef(false);
  useEffect(() => {
    const was = notifyBusyRef.current;
    notifyBusyRef.current = busy;
    if (!was || busy) return; // only on the working → done transition
    if (!isNotifyEnabled("turnDone")) return; // Settings toggle
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!document.hidden) return; // the user is already looking — do not bother
    const body =
      (lastAssistantReply?.text ?? "").trim().slice(0, 140) || t.chat.notifyDone;
    try {
      const n = new Notification("Work4You", {
        body,
        icon: "/brand/work4you-favicon.svg",
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* browser without support — silent */
    }
  }, [busy, lastAssistantReply, t]);

  // "Precisando de você" — Wayne asked for approval/an answer and the tab is in
  // the background (its own toggle in Settings; Claude Code pattern).
  const notifyPromptRef = useRef(false);
  useEffect(() => {
    const had = notifyPromptRef.current;
    notifyPromptRef.current = !!pendingPrompt;
    if (had || !pendingPrompt) return; // only when a NEW prompt shows up
    if (!isNotifyEnabled("needsYou")) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!document.hidden) return;
    try {
      const n = new Notification("Work4You", {
        body: t.chat.notifyNeedsYouBody,
        icon: "/brand/work4you-favicon.svg",
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* no support — silent */
    }
  }, [pendingPrompt, t]);

  // Steer without interrupting (session.steer) — explicit button during the turn.
  const handleSteer = useCallback(
    async (text: string) => {
      const ok = await steer(text);
      if (!ok) setAttachError(t.status.error);
    },
    [steer, t.status.error],
  );

  // Prompt queue: typing while the agent works queues the next message, sent
  // FIFO once the turn ends (parity: queue-panel).
  //
  // KEYED BY SESSION on purpose. The chat stays mounted across conversation
  // switches (App.tsx hides it with CSS instead of unmounting), so a queue held
  // in a plain array would survive the switch and fire the text into whatever
  // conversation the user moved to — delivering a message to the WRONG chat.
  // Each conversation now owns its queue; switching swaps it, never leaks it.
  const queuesRef = useRef<Map<string, string[]>>(new Map());
  const queueSid = storedSessionId ?? "";
  const [queue, setQueue] = useState<string[]>([]);

  // Conversation changed → show that conversation's own queue.
  useEffect(() => {
    setQueue(queuesRef.current.get(queueSid) ?? []);
  }, [queueSid]);

  const writeQueue = useCallback(
    (next: string[]) => {
      setQueue(next);
      if (!queueSid) return;
      if (next.length) queuesRef.current.set(queueSid, next);
      else queuesRef.current.delete(queueSid);
    },
    [queueSid],
  );
  const enqueue = useCallback(
    (text: string) => writeQueue([...(queuesRef.current.get(queueSid) ?? []), text]),
    [writeQueue, queueSid],
  );
  const removeQueued = useCallback(
    (i: number) =>
      writeQueue((queuesRef.current.get(queueSid) ?? []).filter((_, idx) => idx !== i)),
    [writeQueue, queueSid],
  );

  const prevBusyForQueue = useRef(busy);
  useEffect(() => {
    // Turn ended, queue is non-empty and nothing is blocking → send the next.
    // `queue` always mirrors the CURRENT conversation, so this can only ever
    // dispatch into the chat the text was typed in.
    if (prevBusyForQueue.current && !busy && queue.length && !pendingPrompt) {
      const [next, ...rest] = queue;
      writeQueue(rest);
      void handleSend(next);
    }
    prevBusyForQueue.current = busy;
  }, [busy, queue, pendingPrompt, handleSend, writeQueue]);

  // Remove a specific attachment before sending.
  const removeAttachment = useCallback((i: number) => {
    setAttached((prev) => { const gone = prev[i]; if (gone?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(gone.previewUrl); return prev.filter((_, idx) => idx !== i); });
  }, []);

  // Drag-drop of files onto the conversation (parity: ChatDropOverlay).
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    dragDepth.current += 1;
    setDragging(true);
  }, []);
  const onDragLeave = useCallback(() => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) void handleAttach(files);
    },
    [handleAttach],
  );

  // Branch → navigates to the new session.
  const handleBranch = useCallback(async () => {
    const id = await branchChat();
    if (id) setSearchParams(new URLSearchParams({ resume: id }), { replace: false });
    return !!id;
  }, [branchChat, setSearchParams]);

  // Regenerate the last reply: undoes the turn and resends the user's last
  // prompt (parity: ActionBarPrimitive.Reload).
  const handleRegenerate = useCallback(async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content;
    if (!text) return;
    const ok = await undoTurn();
    if (ok) sendMessage(text);
  }, [messages, undoTurn, sendMessage]);

  // Local title after renaming (the API does not re-emit session.info).
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  useEffect(() => {
    setTitleOverride(null);
  }, [resumeId, freshNonce]);

  useEffect(() => {
    // HIDDEN (/chat stays mounted behind the other screens): do NOT touch the
    // global title — not even with null. The connected session keeps receiving
    // session.info in the background; every re-run from here wiped the title
    // the VISIBLE page had just set (seen in the quick Start: the header fell
    // back to the raw path). The cleanup below already clears it ONCE on the
    // active→hidden transition; from then on the title belongs to the current page.
    if (!isActive) return;
    setTitle(titleOverride ?? title);
    return () => setTitle(null);
  }, [isActive, title, titleOverride, setTitle]);

  // Reflects the model/tier switch LIVE (session.info) on the agent badge —
  // without waiting for the next /new (parity with the desktop).
  useEffect(() => {
    if (!liveInfo?.model) return;
    const tier = tierFromConfig(
      liveInfo.model,
      liveInfo.reasoningEffort ?? "medium",
    ) as TierKey | null;
    if (tier) setModeBadge(tierLabel(t, tier));
  }, [liveInfo]);

  // SMART auto-scroll: sticks to the bottom while the user is near it; if they
  // scrolled up to read, new deltas do not yank the screen — and a floating ↓
  // button shows up to get back to the end with one click.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, pendingPrompt]);
  const onTranscriptScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const stick = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickRef.current = stick;
    setShowJump(!stick);
  }, []);
  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  // Gives focus back to the composer when the turn ends.
  const [focusKey, setFocusKey] = useState(0);
  const prevBusyRef = useRef(busy);
  useEffect(() => {
    if (prevBusyRef.current && !busy) setFocusKey((k) => k + 1);
    prevBusyRef.current = busy;
  }, [busy]);

  // Seeds the composer with a sentence start (the dock's Saídas "+" shortcuts)
  // — the user completes and sends; nothing is fired on their behalf.
  const [composerDraft, setComposerDraft] = useState<{ text: string; nonce: number } | null>(null);
  const seedComposer = useCallback((text: string) => {
    setComposerDraft((d) => ({ text, nonce: (d?.nonce ?? 0) + 1 }));
  }, []);

  // ⌘K / Ctrl+K — session SWITCHER (Onda 4; its row 1 is "+ Nova tarefa", so
  // the old shortcut is still one Enter away).
  const [switcherOpen, setSwitcherOpen] = useState(false);
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSwitcherOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive]);

  const emptyHero = messages.length === 0 && !busy;

  // Task actions in the header's TOP RIGHT corner (usage / folder / "…" menu)
  // — only when there is a real conversation on screen.
  // Cloud session: same menu, but REST mutates go through the shell bridge
  // (TaskHeaderActions cloud=true) so we never hit the local gateway.
  useEffect(() => {
    if (!isActive || emptyHero) {
      setEnd(null);
      return;
    }
    setEnd(
      <TaskHeaderActions
        storedId={storedSessionId}
        project={cloudSession ? null : project}
        cloud={cloudSession}
        busy={busy}
        schedulePrompt={
          [...messages].reverse().find((m) => m.role === "user")?.content ?? null
        }
        scheduleProfile={agentParam}
        onRenamed={setTitleOverride}
        onUndo={undoTurn}
        onCompress={compressChat}
        onBranch={handleBranch}
      />,
    );
    return () => setEnd(null);
  }, [
    isActive,
    emptyHero,
    cloudSession,
    storedSessionId,
    project,
    busy,
    messages,
    agentParam,
    undoTurn,
    compressChat,
    handleBranch,
    setEnd,
  ]);

  // Notification nudge: only with an active conversation, permission still
  // undecided and not dismissed before (localStorage). Read on every render —
  // the tick forces a re-render after granting/dismissing.
  const notifyNudgeOff = (() => {
    try {
      return window.localStorage.getItem("wayne:notify-nudge") === "off";
    } catch {
      return true;
    }
  })();
  const showNotifyNudge =
    !emptyHero &&
    typeof Notification !== "undefined" &&
    Notification.permission === "default" &&
    !notifyNudgeOff;

  const composerStack = (
    <div className="w-full">
      {/* Notification nudge (claude.ai parity). */}
      {showNotifyNudge && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-card">
          <span className="min-w-0 flex-1 type-ui text-foreground">{t.chat.notifyAsk}</span>
          <button
            type="button"
            onClick={() => {
              void Notification.requestPermission().finally(() =>
                setNotifyTick((n) => n + 1),
              );
            }}
            className="shrink-0 rounded-lg bg-foreground px-3.5 py-1.5 type-ui font-medium text-background transition-opacity hover:opacity-90"
          >
            {t.chat.notifyEnable}
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                window.localStorage.setItem("wayne:notify-nudge", "off");
              } catch {
                /* private mode */
              }
              setNotifyTick((n) => n + 1);
            }}
            aria-label={t.common.close}
            className="shrink-0 rounded p-1 text-text-tertiary transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Connection dropped (deploy/restart): the hook reconnects on its own with
          backoff — this notice only says "I'm on it" while it recovers. */}
      {!emptyHero && connectionState === "closed" && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-card">
          <span className="relative grid h-3 w-3 shrink-0 place-items-center">
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-live/40" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
          </span>
          <span className="text-shimmer type-ui font-medium">{t.chat.reconnecting}</span>
        </div>
      )}

      {/* Server notices (notification.show — credits/operational). */}
      {notices.map((n) => (
        <div
          key={n.key}
          className={`mb-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
            n.level === "error"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : n.level === "warn"
                ? "border-warning/40 bg-warning/5 text-warning"
                : "border-border bg-muted/40 text-foreground"
          }`}
        >
          <span className="min-w-0 flex-1">{n.text}</span>
          <button
            type="button"
            onClick={() => dismissNotice(n.key)}
            aria-label={t.common.close}
            className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {(error ?? attachError) && (
        <div className="mb-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error ?? attachError}
        </div>
      )}

      {pendingPrompt && (
        <div className="mb-2">
          <PendingPromptPanel
            prompt={pendingPrompt}
            onRespondApproval={respondApproval}
            onRespondClarify={respondClarify}
            onRespondSudo={respondSudo}
            onRespondSecret={respondSecret}
          />
        </div>
      )}

      {/* Prompt queue (queued while the turn runs). */}
      {queue.length > 0 && (
        <div className="mb-2 space-y-1">
          {queue.map((q, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
            >
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide">
                {t.chat.queuedLabel}
              </span>
              <span className="min-w-0 flex-1 truncate">{q}</span>
              <button
                type="button"
                onClick={() => removeQueued(i)}
                aria-label={t.common.close}
                className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* NO overflow-hidden on the card — otherwise it CLIPS the menus that open
          upwards (model, "+", autocomplete). No progress chip here (Onda 1
          curation, re-asserted in D2.1): the in-turn checklist (AssistantTurn)
          narrates the work inline and the dock owns the plan (Plano block +
          the N/M pulse in its header). */}
      <div className="rounded-[24px] border border-border bg-card shadow-card transition-colors focus-within:border-foreground/25">
        <Composer
          disabled={!!pendingPrompt}
          busy={busy}
          onSend={handleSend}
          onQueue={enqueue}
          onSteer={(text) => void handleSteer(text)}
          onSlashSubmit={(cmd) => void execSlash(cmd)}
          onCompleteSlash={completeSlash}
          onCompletePath={completePath}
          onTranscribe={async (dataUrl, mime) => {
            const r = await api.transcribeAudio(dataUrl, mime);
            return r?.transcript ?? "";
          }}
          onInterrupt={interrupt}
          modePicker={
            <ModePicker
              approvalsMode={approvalsMode}
              yoloLive={liveInfo?.yolo ?? false}
              onSetApprovalsMode={handleSetApprovalsMode}
              onSetSessionYolo={(on) => void setSessionYolo(on)}
            />
          }
          onAttach={(files) => void handleAttach(files)}
          onAttachPath={(p) => void handleAttachPath(p)}
          onRemoveAttachment={removeAttachment}
          attachments={attached.map((a) => ({ name: a.name, kind: a.kind }))}
          attaching={attaching}
          focusKey={focusKey}
          draft={composerDraft}
          placeholder={
            emptyHero && project ? t.chat.projectStartTask : undefined
          }
          lastReply={lastAssistantReply}
          sessionKey={resumeId ?? `new-${freshNonce}`}
        />
      </div>

      {/* Attached bar BELOW the card (hero mockup 19/07): project + connector
          toggles on the left, the S1 run-target mini-computer on the right. */}
      <div className="mt-2 flex items-center gap-1.5">
        {/* The project/folder chip names places on THIS machine — for a chat
            running on the cloud computer it would promise folders that are
            not there, so it yields to the run-target chip alone (S1; the
            cloud session runs in the tenant's default workspace). */}
        {!cloudSession && (
          <ContextPicker
            // The folder is chosen when the conversation STARTS, and then it is
            // settled — same as Codex/Cursor. The backend already works this way:
            // the cwd ships in session.create and is IGNORED on resume, so a
            // mid-conversation switch changed the chip and moved nothing. Locking
            // the picker stops the screen from promising what the server won't do.
            locked={messages.length > 0}
            project={project}
            cwd={cwd ?? null}
            storedSessionId={storedSessionId}
            activeLocal={activeLocalFolder}
            onActiveLocalChange={setActiveLocalFolder}
            onLocalEnv={localEnv}
            onSendPrompt={(text) => handleSend(text)}
            onOpenProjectSettings={() =>
              setDockSignal((sig) => ({ tab: "project", nonce: (sig?.nonce ?? 0) + 1 }))
            }
          />
        )}
        {/* Connected apps with per-SESSION on/off switches — live for the
            whole conversation (like the yolo toggle), not settled at start. */}
        <ConnectorsPicker disabled={connectorsOff} onChange={setConnectorsOff} />
        <div className="min-w-0 flex-1" />
        {/* S1 mini-computer: where this chat runs (local-engine desktop). New
            sessions choose; a resumed CLOUD session (S2) shows the settled
            fact as a locked label — same contract as the folder chip. */}
        {(!resumeId || cloudResume) && cloudRunAvailable() && (
          <RunTargetPicker
            value={cloudSession ? "cloud" : runTarget}
            locked={cloudResume || messages.length > 0}
            onChange={setRunTarget}
          />
        )}
      </div>

      <UsageFooter
        sessionActive={!emptyHero}
        onContextBreakdown={contextBreakdown}
      />

      <p className="pt-2.5 text-center text-xs text-text-tertiary">
        {t.chat.disclaimer}
      </p>
    </div>
  );

  return (
    <div
      className="relative flex min-h-0 flex-1"
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-live bg-live/5">
          <span className="rounded-full bg-card px-4 py-2 text-sm font-medium text-foreground shadow-lg">
            {t.chat.dropHere}
          </span>
        </div>
      )}
      {/* Onda 4: quick session switcher (Ctrl+K). */}
      <SessionSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        currentId={storedSessionId}
        modeBadge={modeBadge}
      />
      {/* The floating Ambiente card was MERGED into the dock (v2) — see RightDock. */}
      {/* The Tasks history moved out of here — it lives in the GLOBAL SIDEBAR
          (components/SidebarTasks.tsx), as in the benchmark. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {emptyHero && project && wantsHome ? (
          // PROJECT screen (workspace, ?home=1) — folder header, "start a task"
          // composer, project tasks and panels (instructions/files/scheduled).
          // See components/chat/ProjectWorkspace.tsx.
          <ProjectWorkspace project={project} composer={composerStack} />
        ) : emptyHero ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-16">
            <div className="w-full max-w-[720px]">
              {/* Chatting WITH a specific agent (?agent=): identifies the
                  employee who owns this session (x-ray → Chat). */}
              {agentParam && (
                <div className="mb-4 flex justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-live/40 bg-live/10 px-3 py-1 text-xs font-medium text-live">
                    <Bot className="h-3.5 w-3.5" />
                    {t.chat.agentChip.replace(
                      "{name}",
                      agentParam
                        .replace(/[-_]+/g, " ")
                        .trim()
                        .replace(/\b\w/g, (c) => c.toUpperCase()),
                    )}
                  </span>
                </div>
              )}
              <h1
                className="mb-7 text-center text-[2.2rem] font-medium tracking-tight text-foreground"
                style={{ fontFamily: "var(--theme-font-serif)", textWrap: "balance" }}
              >
                {t.chat.emptyTitle}
              </h1>
              {connectionState !== "open" && (
                <p className="mb-4 text-center text-sm text-muted-foreground">
                  {t.chat.connecting}
                </p>
              )}
              {composerStack}
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={onTranscriptScroll}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <div
                className="mx-auto flex w-full flex-col gap-7 px-4 py-8"
                style={{ maxWidth: "var(--chat-max-w, 840px)" }}
              >
                {/* Onda 1: CONSECUTIVE assistant messages become ONE turn
                    (one header, auto-collapsible activity, serif reply).
                    User/system stay on the MessageBubble. */}
                {turns.map((turn) =>
                  turn.kind === "assistant" ? (
                    <AssistantTurn
                      key={turn.key}
                      messages={turn.messages}
                      isLast={turn.isLast}
                      busy={busy}
                      detailMode={detailMode}
                      onDetailModeChange={setDetailModePersist}
                      steps={turn.isLast && busy ? progress.steps : []}
                      statusText={turn.isLast && busy ? progress.statusText : null}
                      sessionId={storedSessionId}
                      onRegenerate={busy ? undefined : () => void handleRegenerate()}
                      onBranch={() => void handleBranch()}
                    />
                  ) : (
                    <MessageBubble
                      key={turn.key}
                      msg={turn.messages[0]}
                      variant="chat"
                      steps={progress.steps}
                      badge={modeBadge ?? undefined}
                      isLast={turn.isLast}
                    />
                  ),
                )}
                {/* Sent and the assistant has not even opened the 1st bubble: shimmer. */}
                {busy && turns[turns.length - 1]?.kind !== "assistant" && (
                  <div className="chat-msg-in flex items-center gap-2">
                    <img
                      src="/brand/work4you-favicon.svg"
                      alt=""
                      className="h-[18px] w-[18px] rounded"
                    />
                    <span className="text-shimmer type-ui font-medium">
                      {progress.statusText || `${t.chat.thinking}…`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div
              className="relative mx-auto w-full shrink-0 px-4 pb-2"
              style={{ maxWidth: "var(--chat-max-w, 840px)" }}
            >
              {showJump && (
                <button
                  type="button"
                  onClick={jumpToBottom}
                  aria-label={t.chat.jumpToBottom}
                  title={t.chat.jumpToBottom}
                  className="absolute -top-12 left-1/2 z-10 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-border bg-card text-foreground shadow-pop transition-transform hover:scale-105 active:scale-95"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              )}
              {composerStack}
            </div>
          </>
        )}
      </div>
      {/* Dock v3 — the "Computador do Wayne" as a reactive block stack
          (Fontes · Saídas · condicionais). Present from the HERO on; only the
          project-space screen (?home=1) keeps its own panels instead. */}
      {!(emptyHero && project && wantsHome) && (
        <RightDock
          busy={busy}
          steps={progress.steps}
          subagents={progress.subagents}
          urls={envData.urls}
          added={envData.added}
          removed={envData.removed}
          changes={dockChanges}
          cwd={cwd ?? null}
          // Cloud session: the project panels (files/git) are REST against the
          // LOCAL gateway — no project context is offered there in S1.
          project={cloudSession ? null : project}
          openSignal={dockSignal}
          refreshTick={gitTick}
          hero={emptyHero}
          outputs={dockOutputs}
          sources={dockSources}
          usedApps={usedAppSlugs}
          result={lastResult}
          sessionId={storedSessionId}
          onAttachFiles={(files) => void handleAttach(files)}
          onSendPrompt={(text) => void handleSend(text)}
          onSeedComposer={seedComposer}
        />
      )}
    </div>
  );
}
