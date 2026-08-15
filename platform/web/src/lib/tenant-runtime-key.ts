import { FREE_ALLOWANCE_USD } from "@/lib/billing";

/** Tudo o que resolver a chave de um tenant precisa de tocar (injectado p/ teste). */
export interface TenantKeyDeps {
  /** Chave já guardada no Secret Manager, ou null. */
  load: (tenantId: string) => Promise<string | null>;
  /** Persiste a chave. False = não conseguimos guardar. */
  store: (tenantId: string, key: string) => Promise<boolean>;
  /** Cunha uma runtime key OpenRouter com o tecto do plano. */
  mint: (tenantId: string, limitUsd: number) => Promise<{ key: string; hash: string }>;
  /** Regista o hash (auditoria e re-limite). Best-effort. */
  recordHash: (tenantId: string, hash: string) => Promise<void>;
  /** False em dev: sem cofre, cunhar seria queimar chaves. */
  secretsEnabled: () => boolean;
  log?: (message: string) => void;
}

// Uma cunhagem de cada vez por tenant. O motor partilhado faz bootstrap no
// primeiro pedido, portanto abrir a app em três separadores cunharia três
// chaves e guardaria só o hash da última.
const minting = new Map<string, Promise<string>>();

/** Chave do tenant, cunhando e persistindo uma se ainda não existir.
 *
 * Tenants criados antes do motor partilhado nunca ficaram com cópia da chave
 * no Secret Manager (só o signup escreve uma), por isso o motor arrancava o
 * home deles sem `.env` e toda a chamada de modelo falhava. Reparar aqui
 * mantém a chave a viver apenas na nuvem.
 */
export async function resolveTenantKey(
  tenantId: string,
  creditsUsd: number,
  deps: TenantKeyDeps,
): Promise<string> {
  const stored = (await deps.load(tenantId))?.trim();
  if (stored) return stored;
  // Sem cofre podíamos cunhar uma chave e nunca mais a encontrar — cada
  // bootstrap queimaria outra.
  if (!deps.secretsEnabled()) return "";

  const inflight = minting.get(tenantId);
  if (inflight) return inflight;

  const job = (async () => {
    // Uma chave com tecto zero é recusada pela OpenRouter e deixaria o tenant
    // preso; o crédito grátis é o mínimo a que todo o plano tem direito.
    const limitUsd = creditsUsd > 0 ? creditsUsd : FREE_ALLOWANCE_USD;
    let key = "";
    let hash = "";
    try {
      ({ key, hash } = await deps.mint(tenantId, limitUsd));
    } catch (err) {
      deps.log?.(`[tenant-runtime] key mint failed tenant=${tenantId}: ${String(err)}`);
      return "";
    }
    if (!key) return "";
    if (!(await deps.store(tenantId, key))) {
      // Devolvê-la à mesma daria ao motor uma chave que nunca mais
      // conseguiríamos procurar — o bootstrap seguinte cunharia outra.
      deps.log?.(`[tenant-runtime] key store failed tenant=${tenantId}`);
      return "";
    }
    if (hash) await deps.recordHash(tenantId, hash);
    return key;
  })().finally(() => minting.delete(tenantId));

  minting.set(tenantId, job);
  return job;
}
