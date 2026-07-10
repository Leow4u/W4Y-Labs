/**
 * NativeChatPage — the chat surface end users see by default. Talks to the
 * SAME gateway protocol the embedded terminal (ChatTerminalPage) does, over
 * its own /api/ws connection (session.create/resume, prompt.submit,
 * approval/clarify/sudo/secret.respond, session.interrupt) — no PTY. See
 * hooks/useChatSession.ts for the wire protocol notes.
 *
 * Camada de apresentação fiel ao benchmark (Manus, prints da curadoria):
 * coluna "Tarefas" à esquerda; conversa centrada; cartão do composer com o
 * chip de progresso INTEGRADO no topo (expande num cartão "Progresso da
 * tarefa"); hero centralizado em conversa nova; ⌘K = nova tarefa; disclaimer
 * sob o composer; badge do modo (tier) junto ao nome do agente.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AssistantTurn, type DetailMode } from "@/components/chat/AssistantTurn";
import { Composer } from "@/components/chat/Composer";
import { EnvironmentChip } from "@/components/chat/EnvironmentChip";
import { ModePicker, type ApprovalsMode } from "@/components/chat/ModePicker";
import { ProjectPicker } from "@/components/chat/ProjectPicker";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { PendingPromptPanel } from "@/components/chat/PendingPromptPanel";
import { ProjectWorkspace } from "@/components/chat/ProjectWorkspace";
import { SessionSwitcher } from "@/components/chat/SessionSwitcher";
import { RightDock, type DockChange } from "@/components/chat/RightDock";
import { TaskHeaderActions } from "@/components/chat/TaskHeaderActions";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useChatSession } from "@/hooks/useChatSession";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { applyChatDisplay } from "@/lib/chat-display";
import { isNotifyEnabled } from "@/lib/notify-prefs";
import { getFilesRoot, getLastProject, projectCwd, setLastProject } from "@/lib/projects";
import { TIER_PRESETS, tierFromConfig, type TierKey } from "@/lib/tier-presets";
import { Bot, ChevronDown, X } from "lucide-react";
import type { SessionCreateOverrides } from "@/hooks/useChatSession";
import type { ChatMessage } from "@/components/chat/types";

export default function NativeChatPage({ isActive = true }: { isActive?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeId = searchParams.get("resume");
  // Projeto (workspace) da conversa — novas sessões nascem com o cwd da pasta
  // do projeto (session.create {cwd}); ver lib/projects.ts.
  const project = searchParams.get("project");
  // Conversar COM um agente específico (?agent=<slug>, vindo do raio-X da
  // Equipe): a sessão nova nasce no WAYNE_HOME dele (session.create {profile})
  // — alma, modelo, skills e memória DO agente. Obs.: a sessão vive no
  // state.db do agente, então não aparece em "Recentes" (que lista o
  // principal) — o histórico dela é do próprio agente.
  const agentParam = searchParams.get("agent");
  const [freshNonce, setFreshNonce] = useState(0);

  // Gatilho "Nova tarefa" (?new=1, vindo do item de nav): SEMPRE começa uma
  // conversa fresca no hero do chat — limpa resume/home da URL, mantém o
  // ÚLTIMO projeto como contexto e força um session.create novo mesmo que a
  // página já estivesse numa conversa sem ?resume (o chat é montado
  // persistente, então sem isto "voltar" reapresentava a conversa anterior).
  // Pasta arbitrária segura (Fase 3 "usar pasta existente") — cwd absoluto
  // direto, quando não é um projeto formal de projects/.
  const cwdParam = searchParams.get("cwd");
  const wantsNew = searchParams.get("new") !== null;
  useEffect(() => {
    if (!wantsNew) return;
    // "Nova tarefa" = nova sessão NO ÚLTIMO PROJETO (não vazia — decisão
    // 10/07). Preserva o projeto salvo; "sem projeto" salvo → fica vazio.
    const last = getLastProject();
    const next = new URLSearchParams();
    if (last) next.set("project", last);
    setSearchParams(next, { replace: true });
    setFreshNonce((n) => n + 1);
  }, [wantsNew, setSearchParams]);

  // Tela do ESPAÇO do projeto (workspace) só quando explícito (?home=1 —
  // clique no projeto na sidebar / "Abrir espaço" do dock). Sem ele,
  // ?project=<slug> é só o CONTEXTO do chat: hero com o chip do projeto,
  // estilo Codex — senão "Nova tarefa" caía de volta na tela do espaço e
  // parecia não sair do lugar (report 10/07).
  const wantsHome = searchParams.get("home") !== null;

  // Ao abrir /chat "cru" (sem resume/project/cwd/new): aplica o ÚLTIMO
  // projeto como contexto. Só quando o slug salvo existe (NONE/undefined =
  // fica sem projeto). isActive é obrigatório: o /chat fica montado
  // escondido e enxerga a query das OUTRAS páginas — sem a guarda, este
  // replace apagaria p. ex. o ?path= da tela Arquivos.
  useEffect(() => {
    if (!isActive || resumeId || project || cwdParam || wantsNew || agentParam) return;
    const last = getLastProject();
    if (!last) return;
    setSearchParams(new URLSearchParams({ project: last }), { replace: true });
  }, [isActive, resumeId, project, cwdParam, wantsNew, agentParam, setSearchParams]);

  // Persiste o workspace ativo (projeto formal) pra alimentar o "último".
  useEffect(() => {
    if (project) setLastProject(project);
  }, [project]);
  // Gatilho "Ramificar" da sidebar (?resume=<id>&branch=1) — consumido MAIS
  // ABAIXO (depois do destructure de useChatSession, precisa de sessionReady/
  // branchChat) pra evitar TDZ.
  const wantsBranch = searchParams.get("branch") === "1";
  const { setTitle, setEnd } = usePageHeader();
  const { t } = useI18n();

  // Tier atual → badge do agente E overrides POR SESSÃO do session.create
  // (contrato do desktop: o composer manda model/effort a cada create — assim
  // trocar o tier vale já na PRÓXIMA tarefa, sem /new nem reload, e sem
  // depender do config global recarregar num cold start).
  const [modeBadge, setModeBadge] = useState<string | null>(null);
  // Modo de permissões global (approvals.mode manual|smart) — Peça 7.
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
        const appr = (base.approvals as Record<string, unknown> | undefined) ?? {};
        setApprovalsMode(appr.mode === "smart" ? "smart" : "manual");
        const tier = tierFromConfig(model, reasoning) as TierKey | null;
        setModeBadge(tier ? TIER_PRESETS[tier].label : null);
        setOverrides({ model: model || undefined, provider, reasoningEffort: reasoning });
      })
      .catch(() => {
        // Config indisponível → cria sem overrides (não bloquear o chat).
        if (!cancelled) setOverrides({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Root absoluto dos arquivos gerenciados (memoizado em lib/projects) —
  // necessário pra montar o cwd do projeto antes de abrir a sessão.
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

  // cwd: ?cwd absoluto (pasta existente) tem prioridade; senão projects/<slug>.
  const cwd = cwdParam
    ? cwdParam
    : project && projectRoot
      ? projectCwd(projectRoot, project)
      : undefined;
  // Segura a conexão até resolver: (a) o root do workspace quando há projeto
  // e (b) o tier atual (overrides do create) — senão a sessão nasceria errada.
  const sessionEnabled = (!project || cwdParam !== null || projectRoot !== null) && overrides !== null;

  const {
    messages,
    connectionState,
    busy,
    pendingPrompt,
    title,
    error,
    progress,
    usage,
    liveInfo,
    notices,
    dismissNotice,
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
    contextBreakdown,
    completeSlash,
    completePath,
    execSlash,
    respondApproval,
    respondClarify,
    respondSudo,
    respondSecret,
  } = useChatSession(resumeId, freshNonce, cwd, sessionEnabled, overrides, agentParam);

  // Gatilho "Ramificar" do menu da sidebar (?resume=<id>&branch=1): a
  // SidebarTasks é REST-only (sem conexão de gateway), então ela só navega
  // pra cá; esta página resume <id> e, com a sessão conectada, dispara
  // session.branch e troca a URL pro id ramificado (padrão do ?new=1).
  //
  // GOTCHA (a causa do "não ramifica"): no commit em que resumeId muda, os
  // efeitos rodam com o closure ANTIGO — sessionReady=true da sessão
  // ANTERIOR, enquanto sessionIdRef já foi limpo pela troca. branchChat()
  // caía no early-return null e o .then apagava o branch=1 da URL antes de a
  // sessão certa conectar. A guarda `storedSessionId === resumeId` só deixa
  // disparar quando a sessão PRONTA é a sessão ALVO (no resume, o hook seta
  // storedSessionId = resumeId); o ref segura re-disparos em voo.
  const branchingRef = useRef(false);
  useEffect(() => {
    if (!wantsBranch || !sessionReady) return;
    if (!resumeId || storedSessionId !== resumeId) return;
    if (branchingRef.current) return;
    branchingRef.current = true;
    void branchChat().then((newId) => {
      // newId nulo aqui = falha REAL da RPC (a sessão estava pronta) — o
      // motivo já foi surfaçado no banner por branchChat/setError. Nos dois
      // casos consome o branch=1 (sucesso navega pro id novo).
      setSearchParams(new URLSearchParams({ resume: newId ?? resumeId }), { replace: true });
      branchingRef.current = false;
    });
  }, [wantsBranch, sessionReady, storedSessionId, resumeId, branchChat, setSearchParams]);

  // ── Anexos (menu "+" estilo desktop): imagem → upload + image.attach;
  //    demais arquivos → file.attach (data_url direto ao gateway). ──
  const [attached, setAttached] = useState<
    Array<{ name: string; rel?: string; kind: "image" | "file"; previewUrl?: string }>
  >([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const handleAttach = useCallback(
    async (files: File[]) => {
      setAttaching(true);
      setAttachError(null);
      try {
        for (const f of files) {
          if (f.type.startsWith("image/")) {
            const root = await getFilesRoot();
            if (!root) throw new Error("files root unavailable");
            await api.createDirectory("uploads").catch(() => {});
            const rel = `uploads/${Date.now()}-${f.name}`;
            await api.uploadFile(rel, f, true);
            const ok = await attachImage(`${root}/${rel}`);
            if (!ok) throw new Error(f.name);
            // Miniatura REAL no chip (Onda 4) — object URL local, revogado
            // ao remover/consumir o anexo.
            setAttached((prev) => [
              ...prev,
              { name: f.name, rel, kind: "image", previewUrl: URL.createObjectURL(f) },
            ]);
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
          }
        }
      } catch (e) {
        setAttachError(`${t.status.error}: ${e instanceof Error ? e.message : e}`);
      } finally {
        setAttaching(false);
      }
    },
    [attachImage, attachFile, t.status.error],
  );

  // Colar um CAMINHO do workspace no campo → anexa (Onda 4). Imagem usa
  // image.attach direto no caminho do servidor (miniatura via files/read);
  // demais leem via /api/files/read → file.attach (data_url).
  const handleAttachPath = useCallback(
    async (path: string) => {
      setAttaching(true);
      setAttachError(null);
      const name = path.split(/[/\\]/).pop() || path;
      try {
        if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(path)) {
          const ok = await attachImage(path);
          if (!ok) throw new Error(name);
          const preview = await api.readFile(path).catch(() => null);
          setAttached((prev) => [
            ...prev,
            { name, kind: "image", previewUrl: preview?.data_url },
          ]);
        } else {
          const res = await api.readFile(path);
          const ok = await attachFile(res.name || name, res.data_url);
          if (!ok) throw new Error(name);
          setAttached((prev) => [...prev, { name: res.name || name, kind: "file" }]);
        }
      } catch (e) {
        setAttachError(`${t.status.error}: ${e instanceof Error ? e.message : e}`);
      } finally {
        setAttaching(false);
      }
    },
    [attachImage, attachFile, t.status.error],
  );

  const handleSend = useCallback(
    (text: string) => {
      // As imagens anexadas são consumidas por este prompt — entram na bolha
      // do usuário (thumbs via /api/files/read).
      sendMessage(
        text,
        attached.filter((a) => a.kind === "image" && a.rel).map((a) => a.rel as string),
      );
      setAttached((prev) => { prev.forEach((a) => { if (a.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(a.previewUrl); }); return []; });
      setAttachError(null);
    },
    [sendMessage, attached],
  );

  // ── Onda 1: agrupamento em TURNOS ────────────────────────────────────
  // Mensagens assistant consecutivas = um turno (um header, uma atividade,
  // uma resposta). User/system/tool órfão viram turnos unitários.
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

  // Modo de detalhe do trabalho (escondido/recolhido/expandido) — padrão
  // "recolhido" (mostra acontecendo, encolhe no final), persistido local.
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
      /* modo privado — só não persiste */
    }
  }, []);

  // Última resposta do assistente — alimenta o modo de voz (fala o que chegou)
  // e o auto-fala (lê cada resposta pronta). `content` acumula ao vivo via
  // message.delta, então serve tanto pro turno em andamento (pending=true)
  // quanto pro histórico já fechado.
  const lastAssistantReply = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    const text = last?.content?.trim();
    if (!last || !text) return null;
    return { id: last.id, text, pending: !!last.streaming };
  }, [messages]);

  // ── Onda 2: dados do card "Ambiente" ─────────────────────────────────
  // Derivação PURA do que já chega pela sessão: URLs das ferramentas web,
  // +N −M dos inline_diff. Zero backend novo.
  const envData = useMemo(() => {
    const urls: Array<{ url: string; domain: string; title?: string; shot?: string }> = [];
    const seenUrl = new Set<string>();
    const filesMap = new Map<string, { added: number; removed: number }>();
    const URL_RE = /https?:\/\/[^\s"'`<>)\]}]+/;
    const WEBBY = /browser|web|fetch|http|url|navigate|visit|search|request/i;
    // O browser do agente devolve título e salva screenshot PNG no cache —
    // pescamos ambos do result cru pro card Navegador (título + miniatura).
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
              /* URL malformada no preview — ignora */
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

  // Onda 5: diffs completos por arquivo pro dock "Alterações".
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

  // ── Sinais pro dock: auto-preview de .html gerado + refresh do git ───
  // (benchmark Manus: a página que o Wayne cria abre sozinha no painel).
  const [dockSignal, setDockSignal] = useState<{
    tab: "env" | "preview" | "code" | "files" | "changes" | "project";
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
      // Fim de turno: re-consulta o git e, se o turno produziu um .html
      // NOVO, abre a Pré-visualização com ele.
      setGitTick((n) => n + 1);
      const html = [...dockChanges].reverse().find((c) => /\.html?$/i.test(c.path))?.path;
      if (html && html !== lastHtmlRef.current) {
        lastHtmlRef.current = html;
        // O agente grava caminhos absolutos (/opt/data/…) — o files API
        // resolve ambos; passa como veio.
        setDockSignal((s) => ({ tab: "preview", path: html, nonce: (s?.nonce ?? 0) + 1 }));
      }
    }
  }, [busy, dockChanges]);

  // ── Peça "Code": modo de permissões + clone automático de repo ──────
  const handleSetApprovalsMode = useCallback((m: ApprovalsMode) => {
    setApprovalsMode(m);
    void api.saveConfig({ approvals: { mode: m } }).catch(() => {});
  }, []);

  // ?clone=<url> (vindo do "Selecionar repo…"): com a sessão do projeto
  // pronta, dispara UMA vez o prompt de clone e limpa o parâmetro.
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

  // ── Notificação do navegador (paridade claude.ai, feedback 09/07) ────
  // Enquanto a permissão está "default", um nudge acima do composer oferece
  // ativar; concedida, o FIM do turno com a aba em segundo plano vira uma
  // notificação nativa (clique traz a aba de volta).
  const [, setNotifyTick] = useState(0);
  // Preferências de exibição (tamanho/largura da transcrição) — estampa as
  // CSS vars no boot; as Configurações mudam ao vivo via a mesma lib.
  useEffect(() => {
    applyChatDisplay();
  }, []);
  const notifyBusyRef = useRef(false);
  useEffect(() => {
    const was = notifyBusyRef.current;
    notifyBusyRef.current = busy;
    if (!was || busy) return; // só na transição trabalhando → pronto
    if (!isNotifyEnabled("turnDone")) return; // toggle das Configurações
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!document.hidden) return; // usuário já está olhando — não incomoda
    const body =
      (lastAssistantReply?.text ?? "").trim().slice(0, 140) || t.chat.notifyDone;
    try {
      const n = new Notification("Wayne", {
        body,
        icon: "/brand/work4you-favicon.svg",
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* navegador sem suporte — silencioso */
    }
  }, [busy, lastAssistantReply, t]);

  // "Precisando de você" — o Wayne pediu aprovação/resposta e a aba está em
  // segundo plano (toggle próprio nas Configurações; padrão do Claude Code).
  const notifyPromptRef = useRef(false);
  useEffect(() => {
    const had = notifyPromptRef.current;
    notifyPromptRef.current = !!pendingPrompt;
    if (had || !pendingPrompt) return; // só quando um prompt NOVO aparece
    if (!isNotifyEnabled("needsYou")) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!document.hidden) return;
    try {
      const n = new Notification("Wayne", {
        body: t.chat.notifyNeedsYouBody,
        icon: "/brand/work4you-favicon.svg",
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* sem suporte — silencioso */
    }
  }, [pendingPrompt, t]);

  // Orientar sem interromper (session.steer) — botão explícito durante o turno.
  const handleSteer = useCallback(
    async (text: string) => {
      const ok = await steer(text);
      if (!ok) setAttachError(t.status.error);
    },
    [steer, t.status.error],
  );

  // Fila de prompts: digitar enquanto o Wayne trabalha enfileira a próxima
  // mensagem, enviada FIFO quando o turno acaba (paridade: queue-panel).
  const [queue, setQueue] = useState<string[]>([]);
  const enqueue = useCallback((text: string) => {
    setQueue((q) => [...q, text]);
  }, []);
  const removeQueued = useCallback((i: number) => {
    setQueue((q) => q.filter((_, idx) => idx !== i));
  }, []);
  const prevBusyForQueue = useRef(busy);
  useEffect(() => {
    // Turno acabou e há fila + sem prompt bloqueante → dispara a próxima.
    if (prevBusyForQueue.current && !busy && queue.length && !pendingPrompt) {
      const [next, ...rest] = queue;
      setQueue(rest);
      handleSend(next);
    }
    prevBusyForQueue.current = busy;
  }, [busy, queue, pendingPrompt, handleSend]);

  // Remover um anexo específico antes de enviar.
  const removeAttachment = useCallback((i: number) => {
    setAttached((prev) => { const gone = prev[i]; if (gone?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(gone.previewUrl); return prev.filter((_, idx) => idx !== i); });
  }, []);

  // Drag-drop de arquivos sobre a conversa (paridade: ChatDropOverlay).
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

  // Ramificar → navega pra sessão nova.
  const handleBranch = useCallback(async () => {
    const id = await branchChat();
    if (id) setSearchParams(new URLSearchParams({ resume: id }), { replace: false });
    return !!id;
  }, [branchChat, setSearchParams]);

  // Regenerar a última resposta: desfaz o turno e reenvia o último prompt do
  // usuário (paridade: ActionBarPrimitive.Reload).
  const handleRegenerate = useCallback(async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content;
    if (!text) return;
    const ok = await undoTurn();
    if (ok) sendMessage(text);
  }, [messages, undoTurn, sendMessage]);

  // Título local pós-renomear (a API não re-emite session.info).
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  useEffect(() => {
    setTitleOverride(null);
  }, [resumeId, freshNonce]);

  useEffect(() => {
    // OCULTO (o /chat fica montado atrás das outras telas): NÃO tocar no
    // título global — nem com null. A sessão conectada segue recebendo
    // session.info em segundo plano; cada re-run daqui apagava o título
    // que a página VISÍVEL tinha acabado de setar (visto no Início rápido:
    // header regredia pro path cru). O cleanup abaixo já limpa UMA vez na
    // transição ativa→oculta; daí em diante o título é da página da vez.
    if (!isActive) return;
    setTitle(titleOverride ?? title);
    return () => setTitle(null);
  }, [isActive, title, titleOverride, setTitle]);

  // Reflete a troca de modelo/tier AO VIVO (session.info) no badge do agente —
  // sem esperar o próximo /new (paridade com o desktop).
  useEffect(() => {
    if (!liveInfo?.model) return;
    const tier = tierFromConfig(
      liveInfo.model,
      liveInfo.reasoningEffort ?? "medium",
    ) as TierKey | null;
    if (tier) setModeBadge(TIER_PRESETS[tier].label);
  }, [liveInfo]);

  // Auto-scroll INTELIGENTE: gruda no fundo enquanto o usuário está perto
  // dele; se rolou pra cima pra ler, novos deltas não puxam a tela — e um
  // botão ↓ flutuante aparece pra voltar ao fim com um clique.
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

  // Devolve o foco ao composer quando o turno termina.
  const [focusKey, setFocusKey] = useState(0);
  const prevBusyRef = useRef(busy);
  useEffect(() => {
    if (prevBusyRef.current && !busy) setFocusKey((k) => k + 1);
    prevBusyRef.current = busy;
  }, [busy]);

  // ⌘K / Ctrl+K — TROCADOR de sessões (Onda 4; a linha 1 dele é "+ Nova
  // tarefa", então o atalho antigo continua a um Enter de distância).
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

  // Ações da tarefa no CANTO SUPERIOR DIREITO do header (utilização / pasta /
  // menu "…") — só quando há conversa de verdade na tela.
  useEffect(() => {
    if (!isActive || emptyHero) {
      setEnd(null);
      return;
    }
    setEnd(
      <TaskHeaderActions
        storedId={storedSessionId}
        project={project}
        usage={usage}
        busy={busy}
        onRenamed={setTitleOverride}
        onUndo={undoTurn}
        onCompress={compressChat}
        onBranch={handleBranch}
        onContext={contextBreakdown}
      />,
    );
    return () => setEnd(null);
  }, [
    isActive,
    emptyHero,
    storedSessionId,
    project,
    usage,
    busy,
    undoTurn,
    compressChat,
    handleBranch,
    contextBreakdown,
    setEnd,
  ]);

  // Nudge de notificação: só com conversa ativa, permissão ainda não decidida
  // e não dispensado antes (localStorage). Lido a cada render — o tick força
  // re-render após conceder/dispensar.
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
      {/* Peça "Code": ambiente (nuvem do tenant) + selecionar repo. */}
      <div className="mb-2 flex items-center gap-1.5">
        <EnvironmentChip
          onOpenProjectSettings={() =>
            setDockSignal((sig) => ({ tab: "project", nonce: (sig?.nonce ?? 0) + 1 }))
          }
        />
        <ProjectPicker
          project={project}
          cwd={cwd ?? null}
          onSendPrompt={(text) => handleSend(text)}
        />
      </div>

      {/* Nudge de notificação (paridade claude.ai). */}
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
                /* modo privado */
              }
              setNotifyTick((n) => n + 1);
            }}
            aria-label={t.common.close}
            className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Conexão caiu (deploy/restart): o hook reconecta sozinho com backoff —
          este aviso só dá o "estou cuidando disso" enquanto retoma. */}
      {!emptyHero && connectionState === "closed" && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-card">
          <span className="relative grid h-3 w-3 shrink-0 place-items-center">
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-live/40" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
          </span>
          <span className="text-shimmer type-ui font-medium">{t.chat.reconnecting}</span>
        </div>
      )}

      {/* Avisos do servidor (notification.show — créditos/operacional). */}
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

      {/* Fila de prompts (enfileirados enquanto o turno roda). */}
      {queue.length > 0 && (
        <div className="mb-2 space-y-1">
          {queue.map((q, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
            >
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
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

      {/* SEM overflow-hidden no cartão — senão ele RECORTA os menus que abrem
          pra cima (modelo, "+", autocomplete). Onda 1: o progresso saiu daqui —
          agora vive DENTRO do turno (AssistantTurn), onde o trabalho acontece. */}
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
          placeholder={
            emptyHero && project ? t.chat.projectStartTask : undefined
          }
          lastReply={lastAssistantReply}
          sessionKey={resumeId ?? `new-${freshNonce}`}
        />
      </div>

      <p className="pt-2.5 text-center text-xs text-muted-foreground/60">
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
      {/* Onda 4: trocador rápido de sessões (Ctrl+K). */}
      <SessionSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        currentId={storedSessionId}
        modeBadge={modeBadge}
      />
      {/* O card Ambiente flutuante FUNDIU no dock (v2) — ver RightDock. */}
      {/* O histórico de Tarefas saiu daqui — vive na SIDEBAR GLOBAL
          (components/SidebarTasks.tsx), como no benchmark. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {emptyHero && project && wantsHome ? (
          // Tela do PROJETO (workspace, ?home=1) — header da pasta, composer
          // "inicie uma tarefa", tarefas do projeto e painéis (instruções/
          // arquivos/agendadas). Ver components/chat/ProjectWorkspace.tsx.
          <ProjectWorkspace project={project} composer={composerStack} />
        ) : emptyHero ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-16">
            <div className="w-full max-w-[720px]">
              {/* Conversando COM um agente específico (?agent=): identifica
                  o funcionário dono desta sessão (raio-X → Conversar). */}
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
                {/* Onda 1: mensagens assistant CONSECUTIVAS viram UM turno
                    (um header, atividade auto-recolhível, resposta serifada).
                    User/system continuam no MessageBubble. */}
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
                {/* Enviou e o assistant ainda nem abriu a 1ª bolha: shimmer. */}
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
      {/* Dock v2 — o "Computador do Wayne" (Ambiente · Preview · Código ·
          Arquivos · Alterações-git · Projeto). Só em conversa. */}
      {!emptyHero && (
        <RightDock
          busy={busy}
          steps={progress.steps}
          subagents={progress.subagents}
          urls={envData.urls}
          envFiles={envData.files}
          added={envData.added}
          removed={envData.removed}
          changes={dockChanges}
          cwd={cwd ?? null}
          project={project}
          openSignal={dockSignal}
          refreshTick={gitTick}
        />
      )}
    </div>
  );
}
