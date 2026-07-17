/**
 * Per-project DISPLAY metadata (name + emoji + color).
 *
 * SOURCE OF TRUTH (Onda 1, 16/07): the project ROW in projects_db — the
 * `name`/`icon`/`color` columns already existed and GET /api/projects returns
 * them, so this module is now a thin cache over those rows. The old sidecar
 * file (`projects/<slug>/.w4y-project.json`) is LEGACY, read-only: when a row
 * is missing icon/color that the sidecar has, we PATCH the row once
 * (best-effort, silent) so nobody loses the emoji they already picked. No new
 * writes ever go to the sidecar.
 *
 * The public surface (cache reads + pub-sub, same shape as
 * lib/pinned-sessions.ts) is unchanged — call sites don't know the storage
 * moved.
 */
import { api } from "@/lib/api";
import { PROJECTS_DIR, prettifyProject } from "@/lib/projects";

export const PROJECT_META_FILE = ".w4y-project.json";

export interface ProjectMeta {
  /** Display name (overrides the slug's prettify). */
  name?: string;
  /** Single emoji (the folder's icon). */
  icon?: string;
  /** Curated palette key (PROJECT_COLORS) — NOT free-form hex, so it matches the DS. */
  color?: string;
}

/**
 * Curated palette — mid tones that work as a DOT/icon on both cream and dark
 * (never as a background, so they don't fight the warm Editorial look).
 * We store the KEY (not the hex) so we can retheme later.
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

/** Grid of suggested emojis (the client picks one; "sem ícone" clears it). */
export const PROJECT_ICONS = [
  "📁", "🗂️", "🚀", "💼", "🧪", "🎯", "📊", "🛠️",
  "💡", "🧭", "🔭", "🏷️", "📦", "🌱", "🔧", "🖥️",
  "📝", "🎨", "🏗️", "🔬", "🗺️", "⚙️", "📚", "🧩",
  "🏦", "🛰️", "🌐", "✳️",
];

/** data:…;base64,xxx → UTF-8 text (same helper as ProjectWorkspace). */
function dataUrlToText(dataUrl: string): string {
  const b64 = dataUrl.split(",")[1] ?? "";
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

const metaPath = (slug: string) => `${PROJECTS_DIR}/${slug}/${PROJECT_META_FILE}`;

// Cache per slug. Absent = not loaded yet; an object (possibly empty) =
// already resolved (covers "project has no display fields", no refetch).
const cache = new Map<string, ProjectMeta>();
// Row ids by slug — PATCH targets (the endpoint also accepts the slug, but
// the id is exact and survives a slug/name divergence).
const rowIds = new Map<string, string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function onProjectMetaChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Already-cached metadata (or {} if not loaded yet / none set). */
export function getProjectMetaCached(slug: string): ProjectMeta {
  return cache.get(slug) ?? {};
}

/** Display name: row name or the slug's prettify. */
export function projectDisplayName(slug: string): string {
  return getProjectMetaCached(slug).name?.trim() || prettifyProject(slug);
}

/** Hex of the chosen color (or null if no color / invalid key). */
export function projectColorHex(slug: string): string | null {
  const c = getProjectMetaCached(slug).color;
  return (c && PROJECT_COLORS[c]?.hex) || null;
}

function metaFromRow(row: { name: string; icon: string | null; color: string | null }): ProjectMeta {
  return {
    name: row.name?.trim() || undefined,
    icon: row.icon || undefined,
    color: row.color || undefined,
  };
}

// One in-flight fetch of the whole row list serves every caller (the list is
// small and the sidebar asks for all slugs at once anyway).
let inflightRows: Promise<void> | null = null;

function fetchRowsIntoCache(): Promise<void> {
  if (inflightRows) return inflightRows;
  inflightRows = api
    .listProjects()
    .then((res) => {
      for (const row of res.projects) {
        rowIds.set(row.slug, row.id);
        cache.set(row.slug, metaFromRow(row));
      }
    })
    .catch(() => {
      /* offline/error → keep whatever the cache already has */
    })
    .finally(() => {
      inflightRows = null;
    });
  return inflightRows;
}

/** LEGACY read of the old sidecar file (missing/invalid → {}). Never written. */
async function readLegacySidecar(slug: string): Promise<ProjectMeta> {
  try {
    const res = await api.readFile(metaPath(slug));
    const raw = JSON.parse(dataUrlToText(res.data_url)) as ProjectMeta;
    return {
      name: typeof raw.name === "string" ? raw.name : undefined,
      icon: typeof raw.icon === "string" ? raw.icon : undefined,
      color: typeof raw.color === "string" ? raw.color : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * One-time, best-effort migration: rows born before display fields moved to
 * the DB have NULL icon/color while the old sidecar still holds the user's
 * choice. PATCH the row once so the choice survives; from then on the row
 * wins and the sidecar is never consulted again for this project.
 */
async function backfillFromLegacySidecar(slug: string): Promise<void> {
  const current = cache.get(slug) ?? {};
  if (current.icon && current.color) return;
  const legacy = await readLegacySidecar(slug);
  const patch: { name?: string; icon?: string; color?: string } = {};
  if (!current.icon && legacy.icon) patch.icon = legacy.icon;
  if (!current.color && legacy.color) patch.color = legacy.color;
  // A custom sidecar name only wins over a row name that is still the
  // auto-generated prettify default — never over a name set on the row.
  if (
    legacy.name?.trim() &&
    (!current.name || current.name === prettifyProject(slug)) &&
    legacy.name.trim() !== current.name
  ) {
    patch.name = legacy.name.trim();
  }
  if (Object.keys(patch).length === 0) return;
  try {
    const res = await api.updateProject(rowIds.get(slug) ?? slug, patch);
    cache.set(slug, metaFromRow(res.project));
    notify();
  } catch {
    /* silent: migration must never surface as an error to the user */
  }
}

/** Loads a project's display meta (row-backed; cached). */
export function loadProjectMeta(slug: string, force = false): Promise<ProjectMeta> {
  if (!force && cache.has(slug)) return Promise.resolve(cache.get(slug)!);
  return fetchRowsIntoCache().then(async () => {
    if (!cache.has(slug)) {
      // No row for this slug (deleted / not registered yet) — cache the miss
      // so we don't refetch on every render, same as the old 404 handling.
      cache.set(slug, {});
    } else {
      await backfillFromLegacySidecar(slug);
    }
    return cache.get(slug) ?? {};
  });
}

/** Preloads several (single row-list fetch) and notifies when done. */
export async function loadAllProjectMeta(slugs: string[]): Promise<void> {
  const missing = slugs.filter((s) => !cache.has(s));
  if (missing.length === 0) return;
  await fetchRowsIntoCache();
  for (const slug of missing) if (!cache.has(slug)) cache.set(slug, {});
  notify();
  // Legacy migration runs after the first paint — it PATCHes rows that still
  // miss icon/color but have an old sidecar, then notifies again.
  void Promise.all(missing.map((s) => backfillFromLegacySidecar(s)));
}

/**
 * Saves display fields to the project ROW (PATCH /api/projects/{id}) and
 * updates cache + subscribers. A key present in ``patch`` with ``undefined``
 * clears that field (same contract the sidecar version had).
 */
export async function saveProjectMeta(slug: string, patch: ProjectMeta): Promise<void> {
  const body: { name?: string; icon?: string; color?: string } = {};
  // The row's name column is NOT NULL — "clearing" the name means falling
  // back to the slug's prettify, which is exactly what the display fallback
  // rendered before.
  if ("name" in patch) body.name = patch.name?.trim() || prettifyProject(slug);
  // "" clears icon/color on the backend (update_project stores NULL).
  if ("icon" in patch) body.icon = patch.icon ?? "";
  if ("color" in patch) body.color = patch.color ?? "";
  const res = await api.updateProject(rowIds.get(slug) ?? slug, body);
  rowIds.set(slug, res.project.id);
  cache.set(slug, metaFromRow(res.project));
  notify();
}
