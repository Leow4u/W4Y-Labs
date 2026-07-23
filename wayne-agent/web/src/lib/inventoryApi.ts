/**
 * inventoryApi — account-cloud dual path for ACCOUNT inventory endpoints.
 *
 * Kept out of api.ts to avoid a circular import (accountApi → fetchJSON from
 * api). Worker paths (local FS, gateway restart, local session WS) stay on
 * `api.*`.
 *
 * Product defaults (um cérebro só / PLATAFORMA.md):
 *  - Logged-in desktop → inventory on the cloud tenant via bridge
 *  - Local run history → Sessions UI reads account sessions when logged in
 *  - Project = account record (+ optional local cwd on the worker)
 *  - Connectors already account-routed; no second local inventory
 */
import {
  accountGetJson,
  accountMutateJson,
  accountPostJson,
  shouldUseAccountCloud,
} from "@/lib/accountApi";
import {
  api,
  fetchJSON,
  getManagementProfile,
  type AnalyticsResponse,
  type ProfileInfo,
  type SessionInfo,
} from "@/lib/api";
import { realAgents } from "@/lib/agents";

async function invGet<T>(path: string): Promise<T> {
  if (await shouldUseAccountCloud()) {
    const r = await accountGetJson<T>(path);
    if (r !== null) return r;
  }
  return fetchJSON<T>(path);
}

async function invPut<T>(path: string, body: unknown): Promise<T> {
  if (await shouldUseAccountCloud()) {
    const r = await accountMutateJson<T>(path, "PUT", body);
    if (r !== null) return r;
  }
  return fetchJSON<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function invPost<T>(path: string, body?: unknown): Promise<T> {
  if (await shouldUseAccountCloud()) {
    const r = await accountPostJson<T>(path, body);
    if (r !== null) return r;
  }
  return fetchJSON<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

async function invPatch<T>(path: string, body: unknown): Promise<T> {
  if (await shouldUseAccountCloud()) {
    const r = await accountMutateJson<T>(path, "PATCH", body);
    if (r !== null) return r;
  }
  return fetchJSON<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function invDelete<T>(path: string): Promise<T> {
  if (await shouldUseAccountCloud()) {
    const r = await accountMutateJson<T>(path, "DELETE");
    if (r !== null) return r;
  }
  return fetchJSON<T>(path, { method: "DELETE" });
}

function pq(profile?: string): string {
  return profile ? `?profile=${encodeURIComponent(profile)}` : "";
}

/** Profiles with installation/default filtered (user-facing lists). */
export async function inventoryProfiles(): Promise<ProfileInfo[]> {
  const data = await invGet<{ profiles: ProfileInfo[] }>("/api/profiles");
  return realAgents(data.profiles || []);
}

export const inventory = {
  getConfig: (profile?: string) =>
    invGet<Record<string, unknown>>(`/api/config${pq(profile)}`),
  saveConfig: (config: Record<string, unknown>, profile?: string) =>
    invPut<{ ok: boolean }>(`/api/config${pq(profile)}`, { config }),
  getSchema: () =>
    invGet<{ fields: Record<string, unknown>; category_order: string[] }>(
      "/api/config/schema",
    ),
  getDefaults: () => invGet<Record<string, unknown>>("/api/config/defaults"),
  getConfigRaw: () => invGet<{ yaml: string; path?: string }>("/api/config/raw"),
  saveConfigRaw: (yaml_text: string) =>
    invPut<{ ok: boolean }>("/api/config/raw", { yaml_text }),

  getProfiles: () => invGet<{ profiles: ProfileInfo[] }>("/api/profiles"),
  getProfilesFiltered: inventoryProfiles,
  getProfilesPulse: () => invGet<unknown>("/api/profiles/pulse"),
  getAnalytics: (days: number, profile?: string) => {
    const q = new URLSearchParams({ days: String(days) });
    if (profile) q.set("profile", profile);
    return invGet<AnalyticsResponse>(`/api/analytics/usage?${q.toString()}`);
  },

  getMessagingPlatforms: (profile?: string) =>
    invGet<{
      platforms: Array<{
        name: string;
        configured?: boolean;
        enabled?: boolean;
      }>;
    }>(`/api/messaging/platforms${pq(profile)}`),
  updateMessagingPlatform: (id: string, body: unknown) =>
    invPut<{ ok: boolean; platform: string }>(
      `/api/messaging/platforms/${encodeURIComponent(id)}`,
      body,
    ),

  getKnowledge: (profile?: string) =>
    invGet<{
      documents: unknown[];
      files?: unknown[];
      content?: string;
    }>(`/api/knowledge${pq(profile)}`),
  deleteKnowledge: (name: string, profile?: string) =>
    invDelete(`/api/knowledge/${encodeURIComponent(name)}${pq(profile)}`),

  getApprovalsInbox: () =>
    invGet<{ items: unknown[] }>("/api/approvals/pending"),
  respondApprovalInbox: (body: unknown) =>
    invPost("/api/approvals/respond", body),

  /** Prefer account sessions when logged in (histórico na conta). */
  getSessions: (...args: Parameters<typeof api.getSessions>) => {
    return (async (): Promise<{ sessions: SessionInfo[]; total: number }> => {
      if (!(await shouldUseAccountCloud())) return api.getSessions(...args);
      const [limit = 20, offset = 0, profile, order = "created", opts] = args;
      const p = profile ?? getManagementProfile();
      const q = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        order: String(order),
      });
      if (opts?.minMessages) q.set("min_messages", String(opts.minMessages));
      if (opts?.source) q.set("source", opts.source);
      if (opts?.excludeSources) q.set("exclude_sources", opts.excludeSources);
      if (opts?.archived) q.set("archived", opts.archived);
      if (opts?.cwdPrefix) q.set("cwd_prefix", opts.cwdPrefix);
      if (p) q.set("profile", p);
      return invGet<{ sessions: SessionInfo[]; total: number }>(
        `/api/sessions?${q.toString()}`,
      );
    })();
  },

  deleteSession: (id: string, profile?: string) => {
    return (async () => {
      if (!(await shouldUseAccountCloud())) {
        return api.deleteSession(id, profile);
      }
      const p = profile ?? getManagementProfile();
      return invDelete(
        `/api/sessions/${encodeURIComponent(id)}${pq(p)}`,
      );
    })();
  },

  bulkDeleteSessions: (ids: string[], profile?: string) => {
    return (async () => {
      if (!(await shouldUseAccountCloud())) {
        return api.bulkDeleteSessions(ids, profile);
      }
      const p = profile ?? getManagementProfile();
      return invPost<{ ok: boolean; deleted: number }>(
        "/api/sessions/bulk-delete",
        { ids, profile: p || undefined },
      );
    })();
  },

  setSessionArchived: (
    id: string,
    archived: boolean,
    profile?: string,
  ) => {
    return (async () => {
      if (!(await shouldUseAccountCloud())) {
        return api.setSessionArchived(id, archived, profile);
      }
      const p = profile ?? getManagementProfile();
      return invPatch<{ ok: boolean; archived?: boolean }>(
        `/api/sessions/${encodeURIComponent(id)}`,
        { archived, profile: p || undefined },
      );
    })();
  },

  renameSession: (id: string, title: string, profile?: string) => {
    return (async () => {
      if (!(await shouldUseAccountCloud())) {
        return api.renameSession(id, title, profile);
      }
      const p = profile ?? getManagementProfile();
      return invPatch<{ ok: boolean }>(
        `/api/sessions/${encodeURIComponent(id)}`,
        { title, profile: p || undefined },
      );
    })();
  },

  deleteEmptySessions: (profile?: string) => {
    return (async () => {
      if (!(await shouldUseAccountCloud())) {
        return api.deleteEmptySessions(profile);
      }
      const p = profile ?? getManagementProfile();
      return invDelete<{ ok: boolean; deleted: number }>(
        `/api/sessions/empty${pq(p)}`,
      );
    })();
  },

  pruneSessions: (
    older_than_days: number,
    source?: string,
    profile?: string,
  ) => {
    return (async () => {
      if (!(await shouldUseAccountCloud())) {
        return api.pruneSessions(older_than_days, source, profile);
      }
      const p = profile ?? getManagementProfile();
      return invPost<{ ok: boolean; removed: number }>("/api/sessions/prune", {
        older_than_days,
        source,
        profile: p || undefined,
      });
    })();
  },
};

export { shouldUseAccountCloud };
