import { tenantWakeUrl } from "@/lib/wake-tenants";

/** Acorda uma máquina Fly suspensa antes do SSO (login/enter). */
export async function pokeTenantWake(
  flyApp: string,
  baseUrl?: string | null,
  opts?: { maxWaitMs?: number; pokeIntervalMs?: number },
): Promise<boolean> {
  const fly = flyApp.trim();
  if (!fly) return false;

  const maxWait = opts?.maxWaitMs ?? 25_000;
  const interval = opts?.pokeIntervalMs ?? 2_500;
  const wakeUrl = tenantWakeUrl(fly, baseUrl);
  const deadline = Date.now() + maxWait;

  while (Date.now() < deadline) {
    try {
      const r = await fetch(wakeUrl, {
        method: "GET",
        headers: { "User-Agent": "Work4You-LoginWake/1" },
        cache: "no-store",
        signal: AbortSignal.timeout(18_000),
      });
      if (r.ok || r.status === 401 || r.status === 403) return true;
    } catch {
      /* máquina a acordar */
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}
