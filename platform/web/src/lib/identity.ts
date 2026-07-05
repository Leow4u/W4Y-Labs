import "server-only";

// Verificação server-side de existência de conta no Identity Platform.
// O client não consegue saber (proteção contra enumeração de e-mails faz o
// fetchSignInMethodsForEmail sempre voltar vazio); aqui usamos a credencial
// da própria casca (metadata server do Cloud Run → token da service account
// com firebaseauth.viewer) para consultar accounts:lookup.
const PROJECT = "project-67a4bd4d-a990-406b-9e7";

type TokenResp = { access_token?: string };
type LookupResp = { users?: unknown[] };

async function adminToken(): Promise<string | null> {
  try {
    const r = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3000) },
    );
    if (!r.ok) return null;
    const d = (await r.json()) as TokenResp;
    return d.access_token ?? null;
  } catch {
    return null; // fora do Cloud Run (dev local) — sem metadata server
  }
}

// true = já existe conta; false = não existe; null = não deu para saber
// (fallback seguro: o client trata null como "tela de entrar").
export async function accountExists(email: string): Promise<boolean | null> {
  const token = await adminToken();
  if (!token) return null;
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: [email] }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!r.ok) return null;
    const d = (await r.json()) as LookupResp;
    return Array.isArray(d.users) && d.users.length > 0;
  } catch {
    return null;
  }
}
