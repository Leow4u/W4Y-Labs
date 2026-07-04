// Sonda de saúde de uma instância Wayne (casca fina — server-only).
// O /health do dashboard fica atrás do gate de auth e o runtime não deve ser
// alterado, então sondamos /api/auth/providers — rota pública de bootstrap
// que responde 200 JSON quando o serviço está de pé.
import "server-only";

export interface InstanceHealth {
  healthy: boolean;
  latencyMs: number | null;
}

export async function probeInstance(baseUrl: string, timeoutMs = 5000): Promise<InstanceHealth> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/auth/providers`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { healthy: res.ok, latencyMs: Date.now() - t0 };
  } catch {
    return { healthy: false, latencyMs: null };
  }
}
