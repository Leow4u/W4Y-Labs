/**
 * ProjectWorkspace — a tela do projeto (benchmark Manus: manus.im/app/project),
 * renderizada pelo NativeChatPage em `/chat?project=<slug>&home=1` (clique no
 * projeto na sidebar / "Abrir espaço") antes da primeira mensagem — sem o
 * ?home, ?project é só contexto do chat (hero + chip, estilo Codex). TUDO
 * sobre backend existente, nada inventado:
 *
 *   Header          nome da pasta + mtime (listFiles(projects/))
 *   Composer        vem do NativeChatPage — session.create {cwd} (fly62)
 *   Tarefas         GET /api/sessions?cwd_prefix=<pasta>
 *   Instruções      projects/<slug>/AGENTS.md — o agente JÁ injeta AGENTS.md
 *                   do cwd em toda sessão (agent/agent_init.py:281; cron idem,
 *                   cron/scheduler.py:2825). Ler: /api/files/read (data_url →
 *                   texto). Salvar: /api/files/upload-stream (File de texto).
 *   Arquivos        listFiles(pasta) + upload + download; "Ver todos" abre a
 *                   pasta na tela Arquivos (deep-link ?path=).
 *   Agendadas       GET /api/cron/jobs filtrado por job.workdir == pasta.
 *
 * Conectores/Habilidades do benchmark ficam FORA: no nosso backend são
 * globais/por-agente, não por pasta — sem fingir vínculo que não existe.
 */
import {
  CalendarClock,
  Check,
  Download,
  FileText,
  FolderClosed,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useI18n } from "@/i18n";
import { api, type CronJob, type ManagedFileEntry, type SessionInfo } from "@/lib/api";
import { PROJECTS_DIR, getFilesRoot, projectCwd } from "@/lib/projects";
import {
  PROJECT_META_FILE,
  getProjectMetaCached,
  loadProjectMeta,
  onProjectMetaChange,
  projectColorHex,
  projectDisplayName,
} from "@/lib/project-meta";
import { timeAgo } from "@/lib/utils";

const INSTRUCTIONS_FILE = "AGENTS.md";

/** data:…;base64,xxx → texto UTF-8. */
function dataUrlToText(dataUrl: string): string {
  const b64 = dataUrl.split(",")[1] ?? "";
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    );
  } catch {
    return "";
  }
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ProjectWorkspace({
  project,
  composer,
}: {
  project: string;
  /** O cartão do composer do NativeChatPage (já ligado ao cwd do projeto). */
  composer: ReactNode;
}) {
  const { t } = useI18n();
  const { toast, showToast } = useToast();
  const navigate = useNavigate();

  const [mtime, setMtime] = useState<number | null>(null);
  // Workspace absoluto do projeto (root + projects/<slug>) — usado no
  // deep-link do cron (?workdir=) pra agendar DENTRO do projeto.
  const [cwdAbs, setCwdAbs] = useState<string | null>(null);
  const [tasks, setTasks] = useState<SessionInfo[] | null>(null);
  const [files, setFiles] = useState<ManagedFileEntry[] | null>(null);
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  const [instructions, setInstructions] = useState<string>("");
  const [editingInstr, setEditingInstr] = useState(false);
  const [instrDraft, setInstrDraft] = useState("");
  const [savingInstr, setSavingInstr] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Metadados de exibição (nome/emoji/cor) do sidecar — carrega e re-renderiza
  // o header quando chegam/mudam (edição na sidebar reflete aqui na hora).
  const [, setMetaTick] = useState(0);
  useEffect(() => onProjectMetaChange(() => setMetaTick((n) => n + 1)), []);
  useEffect(() => {
    void loadProjectMeta(project);
  }, [project]);

  const projectPath = `${PROJECTS_DIR}/${project}`;
  const instructionsPath = `${projectPath}/${INSTRUCTIONS_FILE}`;

  const loadFiles = useCallback(() => {
    api
      .listFiles(projectPath)
      .then((res) =>
        setFiles(
          res.entries.filter(
            // Esconde os arquivos de sistema do projeto (instruções + sidecar
            // de metadados) — são curados pela UI, não conteúdo do usuário.
            (e) =>
              !e.is_directory &&
              e.name !== INSTRUCTIONS_FILE &&
              e.name !== PROJECT_META_FILE,
          ),
        ),
      )
      .catch(() => setFiles([]));
  }, [projectPath]);

  useEffect(() => {
    let cancelled = false;

    // Header: mtime da pasta (vem da listagem do diretório-pai).
    api
      .listFiles(PROJECTS_DIR)
      .then((res) => {
        if (cancelled) return;
        const entry = res.entries.find((e) => e.is_directory && e.name === project);
        setMtime(entry?.mtime ?? null);
      })
      .catch(() => {});

    // Tarefas do projeto (workspace scoping real).
    void getFilesRoot().then((root) => {
      if (cancelled || !root) return;
      setCwdAbs(projectCwd(root, project));
      api
        .getSessions(10, 0, "", "recent", { cwdPrefix: projectCwd(root, project) })
        .then((res) => {
          if (!cancelled) setTasks(res.sessions);
        })
        .catch(() => {
          if (!cancelled) setTasks([]);
        });

      // Agendadas do projeto: jobs cujo workdir É a pasta.
      api
        .getCronJobs("all")
        .then((all) => {
          if (cancelled) return;
          const cwd = projectCwd(root, project);
          setJobs(all.filter((j) => j.workdir === cwd || j.workdir?.startsWith(`${cwd}/`)));
        })
        .catch(() => {
          if (!cancelled) setJobs([]);
        });
    });

    loadFiles();

    // Instruções (AGENTS.md da pasta) — 404 = sem instruções ainda.
    api
      .readFile(instructionsPath)
      .then((res) => {
        if (!cancelled) setInstructions(dataUrlToText(res.data_url));
      })
      .catch(() => {
        if (!cancelled) setInstructions("");
      });

    return () => {
      cancelled = true;
    };
  }, [project, projectPath, instructionsPath, loadFiles]);

  const saveInstructions = useCallback(async () => {
    setSavingInstr(true);
    try {
      const file = new File([instrDraft], INSTRUCTIONS_FILE, {
        type: "text/markdown",
      });
      await api.uploadFile(instructionsPath, file, true);
      setInstructions(instrDraft);
      setEditingInstr(false);
      showToast(t.chat.instructionsSaved, "success");
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    } finally {
      setSavingInstr(false);
    }
  }, [instrDraft, instructionsPath, showToast, t.chat.instructionsSaved, t.status.error]);

  const onUpload = useCallback(
    async (list: FileList | null) => {
      if (!list || list.length === 0) return;
      setUploading(true);
      try {
        for (const f of Array.from(list)) {
          await api.uploadFile(`${projectPath}/${f.name}`, f, true);
        }
        loadFiles();
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [projectPath, loadFiles, showToast, t.status.error],
  );

  const downloadFile = useCallback(
    async (entry: ManagedFileEntry) => {
      try {
        const res = await api.readFile(entry.path);
        const a = document.createElement("a");
        a.href = res.data_url;
        a.download = res.name || entry.name;
        a.click();
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      }
    },
    [showToast, t.status.error],
  );

  const openTask = useCallback(
    (id: string) => {
      navigate(
        `/chat?project=${encodeURIComponent(project)}&resume=${encodeURIComponent(id)}`,
      );
    },
    [navigate, project],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-[1100px] gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Coluna principal ── */}
        <div className="min-w-0">
          <header className="mb-6 flex items-center gap-4">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-2xl"
              style={projectColorHex(project) ? { borderColor: projectColorHex(project)! } : undefined}
            >
              {getProjectMetaCached(project).icon ?? (
                <FolderClosed
                  className="h-5 w-5 text-muted-foreground"
                  style={projectColorHex(project) ? { color: projectColorHex(project)! } : undefined}
                />
              )}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[1.7rem] font-medium tracking-tight text-foreground" style={{ fontFamily: "var(--theme-font-serif)" }}>
                {projectDisplayName(project)}
              </h1>
              {mtime != null && (
                <p className="text-xs text-muted-foreground">
                  {t.chat.projectUpdated} {timeAgo(mtime)}
                </p>
              )}
            </div>
          </header>

          {composer}

          <section className="mt-8">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              {t.chat.tasks}
            </h2>
            {tasks === null ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                {t.chat.projectTasksEmpty}
              </p>
            ) : (
              <div>
                {tasks.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openTask(s.id)}
                    className="flex w-full items-center gap-3 border-b border-border/60 px-1 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {s.title?.trim() && s.title !== "Untitled"
                        ? s.title
                        : s.preview?.trim() || t.sessions.untitledSession}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                      {timeAgo(s.last_active)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Painéis laterais ── */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title={t.chat.instructions}
            action={
              !editingInstr && (
                <button
                  type="button"
                  aria-label={t.common.expand}
                  onClick={() => {
                    setInstrDraft(instructions);
                    setEditingInstr(true);
                  }}
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )
            }
          >
            {editingInstr ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  value={instrDraft}
                  onChange={(e) => setInstrDraft(e.target.value)}
                  placeholder={t.chat.instructionsPlaceholder}
                  className="min-h-[120px] w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/30"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingInstr(false)}
                    disabled={savingInstr}
                    aria-label={t.common.cancel}
                    className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveInstructions()}
                    disabled={savingInstr}
                    aria-label={t.common.save}
                    className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
                  >
                    {savingInstr ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ) : instructions ? (
              <button
                type="button"
                onClick={() => {
                  setInstrDraft(instructions);
                  setEditingInstr(true);
                }}
                className="w-full text-left"
              >
                <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                  {instructions}
                </p>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setInstrDraft("");
                  setEditingInstr(true);
                }}
                className="text-sm text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                + {t.chat.instructionsPlaceholder}
              </button>
            )}
            <p className="mt-2 text-xs text-muted-foreground/60">
              {t.chat.instructionsHint}
            </p>
          </Panel>

          <Panel
            title={t.app.nav.files}
            action={
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label={t.chat.add}
                  title={t.chat.add}
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/files?path=${encodeURIComponent(projectPath)}`)
                  }
                  className="rounded px-1 py-0.5 text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  {t.chat.viewAll}
                </button>
              </span>
            }
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => void onUpload(e.target.files)}
            />
            {files === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : files.length === 0 ? (
              <p className="text-sm text-muted-foreground/60">{t.common.none}</p>
            ) : (
              <ul className="space-y-0.5">
                {files.slice(0, 6).map((f) => (
                  <li key={f.path}>
                    <button
                      type="button"
                      onClick={() => void downloadFile(f)}
                      title={f.name}
                      className="group flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/50"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {f.name}
                      </span>
                      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={t.chat.scheduledTasks}
            action={
              <button
                type="button"
                onClick={() =>
                  navigate(
                    cwdAbs
                      ? `/cron?workdir=${encodeURIComponent(cwdAbs)}`
                      : "/cron",
                  )
                }
                className="rounded px-1 py-0.5 text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                + {t.chat.add}
              </button>
            }
          >
            {jobs === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : jobs.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">{t.chat.scheduledHint}</p>
            ) : (
              <ul className="space-y-1.5">
                {jobs.map((j) => (
                  <li key={j.id} className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {j.name || j.prompt || j.id}
                    </span>
                    {j.schedule_display && (
                      <span className="shrink-0 text-xs text-muted-foreground/70">
                        {j.schedule_display}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
