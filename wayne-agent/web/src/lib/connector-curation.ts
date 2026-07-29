/**
 * connector-curation — featured BR marketplace layer for Conectores (PR-7 C4).
 *
 * The Composio catalog exposes ~1,047 toolkits; users get a curated
 * default (~24) with slug/name resolution + optional dev subsection. Full
 * catalog stays behind ?catalog=1 on ConnectorsPage.
 */
import type { ConnectorAccount, ConnectorToolkit } from "@/lib/api";
import { stateOf } from "@/hooks/useConnectors";

/** Productivity + comms + CRM + finance + social (audit §7). */
export const FEATURED_CONNECTOR_SLUGS = [
  "gmail",
  "googlecalendar",
  "google_calendar",
  "googledrive",
  "google_drive",
  "googlesheets",
  "google_sheets",
  "outlook",
  "microsoft_outlook",
  "notion",
  "slack",
  "discord",
  "telegram",
  "microsoft_teams",
  "teams",
  "hubspot",
  "salesforce",
  "pipedrive",
  "rdstation",
  "rd_station",
  "stripe",
  "mercadopago",
  "mercado_pago",
  "instagram",
  "linkedin",
  "meta_ads",
  "facebook",
] as const;

/** Collapsed dev tools at the end of the featured grid. */
export const FEATURED_DEV_CONNECTOR_SLUGS = ["github", "jira", "linear"] as const;

export function normalizeConnectorKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function indexToolkits(toolkits: ConnectorToolkit[]): Map<string, ConnectorToolkit> {
  const m = new Map<string, ConnectorToolkit>();
  for (const tk of toolkits) {
    m.set(normalizeConnectorKey(tk.slug), tk);
    m.set(normalizeConnectorKey(tk.name), tk);
  }
  return m;
}

function pickBySlugs(
  toolkits: ConnectorToolkit[],
  slugs: readonly string[],
): ConnectorToolkit[] {
  const byKey = indexToolkits(toolkits);
  const out: ConnectorToolkit[] = [];
  const seen = new Set<string>();
  for (const raw of slugs) {
    const tk = byKey.get(normalizeConnectorKey(raw));
    if (!tk || seen.has(tk.slug)) continue;
    seen.add(tk.slug);
    out.push(tk);
  }
  return out;
}

/** Curated featured list in audit order (deduped, excludes dev subsection). */
export function resolveFeaturedConnectors(toolkits: ConnectorToolkit[]): ConnectorToolkit[] {
  return pickBySlugs(toolkits, FEATURED_CONNECTOR_SLUGS);
}

export function resolveFeaturedDevConnectors(toolkits: ConnectorToolkit[]): ConnectorToolkit[] {
  return pickBySlugs(toolkits, FEATURED_DEV_CONNECTOR_SLUGS);
}

/** Connected accounts whose toolkit is not already in the featured strip. */
export function pickConnectedExtra(
  toolkits: ConnectorToolkit[],
  featured: ConnectorToolkit[],
  byToolkit: Map<string, ConnectorAccount[]>,
): ConnectorToolkit[] {
  const featuredSlugs = new Set(featured.map((t) => t.slug.toLowerCase()));
  return toolkits.filter((tk) => {
    if (featuredSlugs.has(tk.slug.toLowerCase())) return false;
    return stateOf(byToolkit.get(tk.slug.toLowerCase()) || []) === "connected";
  });
}
