/**
 * useSkillHub — the SINGLE source of data+action for the Official Skills catalog
 * (the ~102 optional-skills the backend reads from optional-skills/). Extracted
 * from SkillMarketplace so it can be shared by it AND by PluginsHub, without
 * duplicating the install + the action polling.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { SkillHubInstalledEntry, SkillHubResult } from "@/lib/api";

/** Internal/support view flag — mirrors SettingsOverlay's `?full=1` hatch,
 *  inlined here (like SkillsPage's isInternalView) to keep the hook free of a
 *  UI import. When set, the marketplace requests the WHOLE optional-skills
 *  catalog instead of just the curated ~10 featured skills. */
function isFullCatalogRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("full") === "1";
  } catch {
    return false;
  }
}

/** Client-side filter by search (name/description/tags) + category. */
export function filterSkills(
  skills: SkillHubResult[],
  search: string,
  activeCat: string | null,
): SkillHubResult[] {
  const lower = search.trim().toLowerCase();
  return skills.filter((s) => {
    if (activeCat && (s.category || "general") !== activeCat) return false;
    if (!lower) return true;
    return (
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      (s.tags || []).some((tag) => tag.toLowerCase().includes(lower))
    );
  });
}

/** Last meaningful line of an action log tail — the REAL reason an install
 *  failed, straight from the CLI output. The `=== <action> started/completed`
 *  banners `_spawn_wayne_action` writes are skipped; nothing is synthesized. */
function lastLogLine(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] || "").trim();
    if (line && !/^=== .+ (started|completed) /.test(line)) return line;
  }
  return "";
}

export function useSkillHub(profile?: string, full?: boolean) {
  // The user marketplace shows the curated set; the internal ?full=1 hatch
  // shows the whole catalog. Callers can force it, else we read the hatch.
  const showFull = full ?? isFullCatalogRequested();
  const [skills, setSkills] = useState<SkillHubResult[]>([]);
  const [installed, setInstalled] = useState<Record<string, SkillHubInstalledEntry>>({});
  const [loading, setLoading] = useState(true);
  // identifier -> in-flight operation (only "install"; remove was left out).
  const [busy, setBusy] = useState<Record<string, "install">>({});
  // identifier -> failure reason for the last install attempt. Populated only
  // from a non-zero `exit_code` (or a failed spawn), never guessed.
  const [failed, setFailed] = useState<Record<string, string>>({});
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .getSkillHubCatalog(profile, showFull)
      .then((r) => {
        if (!aliveRef.current) return;
        setSkills(r.skills);
        setInstalled(r.installed);
      })
      .catch(() => {})
      .finally(() => aliveRef.current && setLoading(false));
  }, [profile, showFull]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetchInstalled = () => {
    api
      .getSkillHubCatalog(profile, showFull)
      .then((r) => aliveRef.current && setInstalled(r.installed))
      .catch(() => {});
  };

  const clearBusy = (id: string) =>
    setBusy((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });

  const clearFailure = (id: string) =>
    setFailed((p) => {
      if (!(id in p)) return p;
      const n = { ...p };
      delete n[id];
      return n;
    });

  // Poll the install action until the process exits, then refresh "installed".
  //
  // GET /api/actions/<name>/status reports {running, exit_code, pid, lines} —
  // there is NO percentage/progress in the payload, so the UI states are just
  // "installing" (running) and the terminal outcome read off `exit_code`.
  // A non-zero exit is surfaced with the log tail as the reason.
  const pollAction = (name: string, id: string) => {
    let tries = 0;
    const tick = async () => {
      try {
        const st = await api.getActionStatus(name, 40);
        if (!aliveRef.current) return;
        if (st.running && tries++ < 400) {
          setTimeout(tick, 1500);
          return;
        }
        if (!st.running && st.exit_code !== null && st.exit_code !== 0) {
          setFailed((p) => ({ ...p, [id]: lastLogLine(st.lines) }));
        }
      } catch {
        /* ignore — falls through to the refetch below */
      }
      refetchInstalled();
      clearBusy(id);
    };
    setTimeout(tick, 1200);
  };

  const install = (r: SkillHubResult) => {
    setBusy((p) => ({ ...p, [r.identifier]: "install" }));
    clearFailure(r.identifier);
    api
      .installSkillFromHub(r.identifier, profile)
      .then((res) => pollAction(res.name, r.identifier))
      .catch((e: unknown) => {
        // The spawn itself failed (the POST never started an action).
        if (!aliveRef.current) return;
        setFailed((p) => ({ ...p, [r.identifier]: e instanceof Error ? e.message : String(e) }));
        clearBusy(r.identifier);
      });
  };

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of skills) {
      const c = s.category || "general";
      m.set(c, (m.get(c) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills]);

  return { skills, installed, loading, busy, failed, install, categories, reload: load };
}
