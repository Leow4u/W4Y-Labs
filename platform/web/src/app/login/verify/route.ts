import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { setDevSession } from "@/lib/dev-auth";
import { isEmailAllowed } from "@/lib/allowlist";

export const dynamic = "force-dynamic";

// Porta de verificação do Identity Platform: o navegador autentica no
// Firebase Auth (Google/Microsoft/e-mail) e nos envia o ID token; aqui o
// token é verificado criptograficamente (JWKS do securetoken) — issuer e
// audience precisam bater com o projeto. Só então a sessão da plataforma
// é criada, com a allowlist como camada de autorização (porta fechada do
// MVP até o billing existir).
const PROJECT = "project-67a4bd4d-a990-406b-9e7";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export async function POST(req: NextRequest) {
  let idToken = "";
  let next = "";
  try {
    const body = await req.json();
    idToken = String(body.idToken || "");
    next = String(body.next || "");
  } catch {
    /* corpo inválido cai no missing_token abaixo */
  }
  if (!idToken) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  let email = "";
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT}`,
      audience: PROJECT,
    });
    email = String(payload.email || "").trim().toLowerCase();
    // Registro por e-mail/senha exige o clique no link de confirmação antes
    // da primeira sessão. Provedores sociais (Google) já chegam verificados.
    const signInProvider =
      (payload.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider ?? "";
    if (signInProvider === "password" && payload.email_verified !== true) {
      return NextResponse.json({ ok: false, error: "unverified" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }

  if (!email) {
    return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });
  }

  // Multi-tenant: a tabela `users` mapeia e-mail → tenant e também autoriza
  // (um e-mail provisionado entra mesmo fora da ALLOWED_EMAILS de dev).
  let tenantId: string | undefined;
  try {
    const r = await db().execute<{ tenant_id: string }>(
      sql`SELECT tenant_id FROM users WHERE email=${email}`,
    );
    tenantId = r.rows[0]?.tenant_id;
  } catch {
    /* registry indisponível — segue só com a allowlist */
  }
  if (!tenantId && !isEmailAllowed(email)) {
    return NextResponse.json({ ok: false, error: "denied" }, { status: 403 });
  }

  await setDevSession(email, tenantId);
  const target = next === "/admin" || next === "/instancias" ? next : "/login/enter";
  return NextResponse.json({ ok: true, next: target });
}
