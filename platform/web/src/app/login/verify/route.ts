import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
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
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }

  if (!email) {
    return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });
  }
  if (!isEmailAllowed(email)) {
    return NextResponse.json({ ok: false, error: "denied" }, { status: 403 });
  }

  await setDevSession(email);
  const target = next === "/admin" || next === "/instancias" ? next : "/login/enter";
  return NextResponse.json({ ok: true, next: target });
}
