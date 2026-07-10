/**
 * Projetos (curadoria estilo Manus) = WORKSPACES reais do backend, zero
 * endpoint novo:
 *   - um projeto é uma PASTA em `projects/<slug>` sob o root de arquivos
 *     gerenciados (criada via POST /api/files/mkdir);
 *   - novas tarefas do projeto nascem com `session.create {cwd}` — o gateway
 *     já persiste o cwd explícito como o workspace da sessão
 *     (tui_gateway/server.py, session.create);
 *   - a lista de tarefas do projeto usa o filtro `cwd_prefix` que o
 *     GET /api/sessions já aceita.
 * Arquivos do projeto ficam juntos na pasta — visíveis na tela Arquivos.
 */
import { api } from "@/lib/api";

export const PROJECTS_DIR = "projects";

/** "Cliente Itaú" → "cliente-itau" (nome de pasta seguro). */
export function slugifyProject(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** "cliente-itau" → "Cliente Itau" (exibição). */
export function prettifyProject(name: string): string {
  const s = name.replace(/[-_]+/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Root absoluto dos arquivos gerenciados (ex.: /opt/data) — vem na resposta
// da listagem; memoizado por sessão de página (não muda em runtime).
let cachedRoot: string | null = null;

export async function getFilesRoot(): Promise<string | null> {
  if (cachedRoot) return cachedRoot;
  try {
    const res = await api.listFiles("");
    cachedRoot = res.root ?? res.locked_root ?? null;
  } catch {
    cachedRoot = null;
  }
  return cachedRoot;
}

/** Caminho absoluto (no servidor) do workspace de um projeto. */
export function projectCwd(root: string, project: string): string {
  const base = root.endsWith("/") ? root.slice(0, -1) : root;
  return `${base}/${PROJECTS_DIR}/${project}`;
}

// ── Último projeto (Fase 1 do project picker, decisão 10/07) ───────────
// Todo chat novo abre no ÚLTIMO projeto trabalhado (não vazio), como o
// Codex/Claude. localStorage guarda: um slug, ou o sentinela NONE quando o
// usuário escolheu "trabalhar sem projeto" (distinto de "nunca escolheu").
const LAST_PROJECT_KEY = "wayne:last-project";
const NONE = "__none__";

/** slug (projeto) · null ("sem projeto" explícito) · undefined (nunca escolheu). */
export function getLastProject(): string | null | undefined {
  try {
    const v = window.localStorage.getItem(LAST_PROJECT_KEY);
    if (v === null) return undefined;
    return v === NONE ? null : v;
  } catch {
    return undefined;
  }
}

export function setLastProject(project: string | null): void {
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, project ?? NONE);
  } catch {
    /* modo privado */
  }
}
