/**
 * Metadados de EXIBIÇÃO por projeto (Estratégia A, decisão 10/07): nome
 * amigável + emoji + cor, guardados num arquivo sidecar DENTRO da pasta do
 * projeto — `projects/<slug>/.w4y-project.json`. A pasta continua sendo a
 * identidade (o slug nunca muda); isto é só a camada de aparência por cima.
 *
 * Por que sidecar e não banco/localStorage (ver memória code-platform-plan):
 *   - fonte ÚNICA de verdade = a pasta (nada pra sincronizar);
 *   - VIAJA com o `git clone` e pro futuro modo Local (o banco do tenant não);
 *   - zero endpoint novo — usa readFile/uploadFile que já existem.
 *
 * Cache + pub-sub no mesmo formato de lib/pinned-sessions.ts: os componentes
 * (sidebar, picker, workspace) leem do cache e se inscrevem pra re-render.
 */
import { api } from "@/lib/api";
import { PROJECTS_DIR, prettifyProject } from "@/lib/projects";

export const PROJECT_META_FILE = ".w4y-project.json";

export interface ProjectMeta {
  /** Nome de exibição (sobrepõe o prettify do slug). */
  name?: string;
  /** Emoji único (ícone da pasta). */
  icon?: string;
  /** Chave da paleta curada (PROJECT_COLORS) — NÃO hex livre, pra casar com o DS. */
  color?: string;
}

/**
 * Paleta curada — tons médios que funcionam como PONTO/ícone tanto no creme
 * quanto no escuro (nunca como fundo, pra não brigar com o Editorial quente).
 * Guardamos a CHAVE (não o hex) pra poder retematizar depois.
 */
export const PROJECT_COLORS: Record<string, { hex: string }> = {
  terracota: { hex: "#c15f3c" },
  ambar: { hex: "#b8863b" },
  oliva: { hex: "#7d8b4e" },
  verdemar: { hex: "#4f8a7b" },
  azul: { hex: "#4a72a8" },
  ardosia: { hex: "#6b6f80" },
  ameixa: { hex: "#8a5a7d" },
  rosa: { hex: "#bd6b6b" },
};

/** Grade de emojis sugeridos (o cliente escolhe um; "sem ícone" limpa). */
export const PROJECT_ICONS = [
  "📁", "🗂️", "🚀", "💼", "🧪", "🎯", "📊", "🛠️",
  "💡", "🧭", "🔭", "🏷️", "📦", "🌱", "🔧", "🖥️",
  "📝", "🎨", "🏗️", "🔬", "🗺️", "⚙️", "📚", "🧩",
  "🏦", "🛰️", "🌐", "✳️",
];

/** data:…;base64,xxx → texto UTF-8 (mesmo helper do ProjectWorkspace). */
function dataUrlToText(dataUrl: string): string {
  const b64 = dataUrl.split(",")[1] ?? "";
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

const metaPath = (slug: string) => `${PROJECTS_DIR}/${slug}/${PROJECT_META_FILE}`;

// Cache por slug. `undefined` = ainda não carregado; um objeto (possivelmente
// vazio) = já resolvido (inclui o caso "sem sidecar", pra não refazer o 404).
const cache = new Map<string, ProjectMeta>();
const inflight = new Map<string, Promise<ProjectMeta>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function onProjectMetaChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Metadado já em cache (ou {} se ainda não carregou / sem sidecar). */
export function getProjectMetaCached(slug: string): ProjectMeta {
  return cache.get(slug) ?? {};
}

/** Nome de exibição: sidecar.name ou o prettify do slug. */
export function projectDisplayName(slug: string): string {
  return getProjectMetaCached(slug).name?.trim() || prettifyProject(slug);
}

/** Hex da cor escolhida (ou null se sem cor / chave inválida). */
export function projectColorHex(slug: string): string | null {
  const c = getProjectMetaCached(slug).color;
  return (c && PROJECT_COLORS[c]?.hex) || null;
}

/** Carrega o sidecar de um projeto (cacheado; 404/parse-erro = {}). */
export function loadProjectMeta(slug: string, force = false): Promise<ProjectMeta> {
  if (!force && cache.has(slug)) return Promise.resolve(cache.get(slug)!);
  const existing = inflight.get(slug);
  if (existing && !force) return existing;
  const p = api
    .readFile(metaPath(slug))
    .then((res) => {
      let meta: ProjectMeta = {};
      try {
        const raw = JSON.parse(dataUrlToText(res.data_url)) as ProjectMeta;
        meta = {
          name: typeof raw.name === "string" ? raw.name : undefined,
          icon: typeof raw.icon === "string" ? raw.icon : undefined,
          color: typeof raw.color === "string" ? raw.color : undefined,
        };
      } catch {
        /* json inválido → trata como vazio */
      }
      cache.set(slug, meta);
      return meta;
    })
    .catch(() => {
      // 404 (sem sidecar) e afins → vazio, mas CACHEIA pra não repetir.
      cache.set(slug, {});
      return {};
    })
    .finally(() => inflight.delete(slug));
  inflight.set(slug, p);
  return p;
}

/** Pré-carrega vários (só os que faltam) e notifica quando termina. */
export async function loadAllProjectMeta(slugs: string[]): Promise<void> {
  const missing = slugs.filter((s) => !cache.has(s));
  if (missing.length === 0) return;
  await Promise.all(missing.map((s) => loadProjectMeta(s)));
  notify();
}

/** Grava o sidecar (merge com o cache atual) e atualiza cache + assinantes. */
export async function saveProjectMeta(slug: string, patch: ProjectMeta): Promise<void> {
  const next: ProjectMeta = { ...getProjectMetaCached(slug), ...patch };
  // Remove chaves vazias pra manter o arquivo enxuto.
  (Object.keys(next) as (keyof ProjectMeta)[]).forEach((k) => {
    if (!next[k]) delete next[k];
  });
  const body = `${JSON.stringify(next, null, 2)}\n`;
  const file = new File([new Blob([body], { type: "application/json" })], PROJECT_META_FILE, {
    type: "application/json",
  });
  await api.uploadFile(metaPath(slug), file, true);
  cache.set(slug, next);
  notify();
}
