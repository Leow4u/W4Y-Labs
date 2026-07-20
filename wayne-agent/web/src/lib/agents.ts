/**
 * The single answer to "is this a real agent?".
 *
 * `default` is NOT an agent — it is the installation (the pre-profile
 * WAYNE_HOME that owns the model, skills, MCP and channels every agent
 * inherits). Product rule (Leonardo, 20/07): it must never appear anywhere a
 * user could select it, edit it, or assign work to it — if each tenant
 * rewrote it, the product we ship would stop being the same product.
 *
 * Before this module the rule was re-implemented (or forgotten) per screen:
 * the audit found it leaking into nine surfaces, PRE-SELECTED in two of them.
 * Every list, picker, table and roster now goes through here.
 */
import type { ProfileInfo } from "@/lib/api";

/** The installation's on-disk name. */
export const INSTALLATION_PROFILE = "default";

export function isInstallation(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === INSTALLATION_PROFILE;
}

/** A profile the user may pick, edit or assign work to. */
export function isRealAgent(p: Pick<ProfileInfo, "name" | "is_default">): boolean {
  return !p.is_default && !isInstallation(p.name);
}

/** The agents of a profile list — the ONLY list any picker should render. */
export function realAgents<T extends Pick<ProfileInfo, "name" | "is_default">>(
  profiles: T[] | null | undefined,
): T[] {
  return (profiles ?? []).filter(isRealAgent);
}

/**
 * Display name for a profile slug. Falls back to a readable form of the slug
 * ONLY when no display name was stored — and never mangles the installation,
 * which the product calls "Assistente Work4You" wherever its activity must be
 * shown (spend, approvals) without offering it as a target.
 */
export function agentLabel(
  name: string,
  displayName?: string | null,
  installationLabel = "Assistente Work4You",
): string {
  if (isInstallation(name)) return installationLabel;
  const stored = (displayName ?? "").trim();
  if (stored) return stored;
  return prettifySlug(name);
}

/**
 * "esquadrao-de-marketing" → "Esquadrão de Marketing" is IMPOSSIBLE from the
 * slug (the accent is gone), so this only tidies: it capitalises the first
 * word and leaves connectors lowercase instead of Title Casing Every Word.
 * Screens that have the real name must pass it as `displayName`.
 */
const LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "para", "por", "com", "em", "a", "o"]);
export function prettifySlug(name: string): string {
  const words = name.replace(/[-_]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && LOWER_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Initials for avatars, derived from the DISPLAY name when available. */
export function agentMonogram(name: string, displayName?: string | null): string {
  const label = displayName?.trim() || prettifySlug(name);
  const parts = label.split(/\s+/).filter((w) => !LOWER_WORDS.has(w.toLowerCase()));
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}
