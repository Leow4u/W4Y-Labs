/**
 * The Files screen shows more than one SURFACE, and they do not support the
 * same gestures. This module is where that difference is declared once, as
 * data, instead of being re-derived by every button.
 *
 * A surface = a browsable root with its own listing contract + a capability
 * descriptor. The grid/list/menu read `caps` and simply do not render what the
 * backend cannot do — the old `muted` prop only dimmed the buttons (opacity),
 * so a disabled-looking "Renomear" still fired a request that 404'd.
 *
 * Two surfaces today:
 *   cloud      — the managed root (/api/files). Everything is allowed.
 *   knowledge  — an agent's documents (/api/knowledge). Upload + delete only:
 *                there is no read/download/rename/move endpoint for them.
 *
 * Deliberately NOT a surface: the user's own disk. On the local-engine desktop
 * the managed root ALREADY is ~/Work4You (same folder, listing it twice), and
 * in a plain browser it does not exist at all — half the beta testers would
 * see a different screen than the other half.
 */
import type { KnowledgeDoc, ManagedFileEntry } from "@/lib/api";

export type FileSourceId = "cloud" | "knowledge";

export interface FileCaps {
  /** Folders can be entered (the row gets a chevron / double-click). */
  navigate: boolean;
  upload: boolean;
  mkdir: boolean;
  move: boolean;
  rename: boolean;
  delete: boolean;
  download: boolean;
  /** The row opens a preview panel. */
  preview: boolean;
  /** The row can be pinned to Favoritos. */
  pin: boolean;
}

export const CLOUD_CAPS: FileCaps = {
  navigate: true,
  upload: true,
  mkdir: true,
  move: true,
  rename: true,
  delete: true,
  download: true,
  preview: true,
  pin: true,
};

/**
 * Knowledge documents are flat and write-mostly: the REST surface is
 * list + upload + delete (see /api/knowledge). No read endpoint exists, so
 * download/preview would be a button that cannot work. `pin: false` is also
 * what keeps Favoritos honest — a pinned `knowledge://` path could never be
 * re-opened, so the star never appears in the first place.
 */
export const KNOWLEDGE_CAPS: FileCaps = {
  navigate: false,
  upload: true,
  mkdir: false,
  move: false,
  rename: false,
  delete: true,
  download: false,
  preview: false,
  pin: false,
};

export function capsFor(source: FileSourceId): FileCaps {
  return source === "knowledge" ? KNOWLEDGE_CAPS : CLOUD_CAPS;
}

/** Synthetic scheme for knowledge rows. NEVER sent to /api/files. */
const KNOWLEDGE_SCHEME = "knowledge://";

export function knowledgePath(slug: string, name: string): string {
  return `${KNOWLEDGE_SCHEME}${slug}/${name}`;
}

export function parseKnowledgePath(
  path: string,
): { slug: string; name: string } | null {
  if (!path.startsWith(KNOWLEDGE_SCHEME)) return null;
  const rest = path.slice(KNOWLEDGE_SCHEME.length);
  const cut = rest.indexOf("/");
  if (cut <= 0) return null;
  return { slug: rest.slice(0, cut), name: rest.slice(cut + 1) };
}

/**
 * Adapt a knowledge document to the SAME row shape the explorer already
 * renders, so the four columns (name / size / modified / actions) stay filled
 * and true instead of showing blanks that read as "broken".
 */
export function knowledgeToEntry(
  doc: KnowledgeDoc,
  slug: string,
): ManagedFileEntry {
  const ingested = doc.ingested_at ? Date.parse(doc.ingested_at) : NaN;
  return {
    name: doc.name,
    path: knowledgePath(slug, doc.name),
    is_directory: false,
    size: doc.size ?? null,
    mtime: Number.isNaN(ingested) ? 0 : Math.floor(ingested / 1000),
    mime_type: null,
  };
}

export interface CrumbSpec {
  label: string;
  /** Relative path to navigate to; null = not clickable (leaf / surface head). */
  path: string | null;
}

/**
 * The trail, per surface. Cloud walks the real relative path; knowledge is
 * always exactly two levels (home › agent) because there is no tree.
 */
export function buildCrumbs(
  source: FileSourceId,
  opts: { homeLabel: string; path?: string; agentName?: string | null },
): CrumbSpec[] {
  if (source === "knowledge") {
    return [
      { label: opts.homeLabel, path: "" },
      { label: opts.agentName ?? "", path: null },
    ];
  }
  const crumbs: CrumbSpec[] = [{ label: opts.homeLabel, path: "" }];
  const segments = (opts.path ?? "").split("/").filter(Boolean);
  let acc = "";
  segments.forEach((seg, i) => {
    acc = acc ? `${acc}/${seg}` : seg;
    crumbs.push({ label: seg, path: i === segments.length - 1 ? null : acc });
  });
  return crumbs;
}
