import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * The Work4You home directory, as reported by the running agent.
 *
 * UI copy must never spell this path out. It is profile-scoped, it is
 * `%LOCALAPPDATA%\work4you` on native Windows, it can be relocated with
 * `WORK4YOU_HOME`, and the brand migration moved the default from
 * `~/.wayne` to `~/.work4you` — every hard-coded spelling is wrong for
 * someone. Translations carry a `{home}` placeholder instead, and
 * {@link withHome} fills it with the value this hook resolves.
 */

/** Resolved once per page load — the agent's home cannot move under us. */
let cachedHome: string | null = null;

export function useHomePath(): string {
  const [home, setHome] = useState<string>(cachedHome ?? "");

  useEffect(() => {
    if (cachedHome !== null) return;
    let alive = true;
    api
      .getStatus()
      .then((resp) => {
        cachedHome = resp.wayne_home || "";
        if (alive && cachedHome) setHome(cachedHome);
      })
      .catch(() => {
        /* keep the placeholder fallback — a hint is not worth a toast */
      });
    return () => {
      alive = false;
    };
  }, []);

  return home;
}

/**
 * Substitute `{home}` in a translated string with the real home path.
 *
 * Falls back to the POSIX default only while /api/status is still in
 * flight (or unreachable); the resolved value replaces it as soon as it
 * lands.
 */
export function withHome(text: string, home: string): string {
  return text.replace(/\{home\}/g, home || "~/.work4you");
}

/** Test seam: drop the module-level cache. */
export function __resetHomePathCache(): void {
  cachedHome = null;
}
