import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { setDevSession } from "@/lib/dev-auth";
import { isEmailAllowed } from "@/lib/allowlist";
import { requestProvision, slugFor } from "@/lib/provisioner";
import { FREE_ALLOWANCE_USD } from "@/lib/billing";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const LOGIN_RATE = { limit: 20, windowMs: 60_000 };

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
  let captcha = "";
  try {
    const body = await req.json();
    idToken = String(body.idToken || "");
    next = String(body.next || "");
    captcha = String(body.captcha || "");
  } catch {
    /* corpo inválido cai no missing_token abaixo */
  }
  if (!idToken) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`login:${ip}`, LOGIN_RATE.limit, LOGIN_RATE.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
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

  // FREE ABERTO: usuário verificado sem tenant → auto-provisiona uma
  // instância Free e cai numa tela de preparação enquanto o app Fly sobe.
  const freeOpen = (process.env.FREE_OPEN ?? "1") === "1";
  if (!tenantId && freeOpen) {
    // Gate anti-robô no ponto caro (provisiona um app Fly de verdade). Só
    // exige o token quando o Turnstile está configurado (secret presente).
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (!(await verifyTurnstile(captcha, ip))) {
      return NextResponse.json({ ok: false, error: "captcha" }, { status: 403 });
    }
    const created = await autoProvision(email);
    if (created) {
      try {
        await setDevSession(email, created);
      } catch {
        return NextResponse.json({ ok: false, error: "session_unavailable" }, { status: 503 });
      }
      return NextResponse.json({ ok: true, next: "/onboarding" });
    }
    // provisionamento não pôde iniciar (registry/serviço fora) → nega educado
    return NextResponse.json({ ok: false, error: "provision_failed" }, { status: 503 });
  }

  if (!tenantId && !isEmailAllowed(email)) {
    return NextResponse.json({ ok: false, error: "denied" }, { status: 403 });
  }

  try {
    await setDevSession(email, tenantId);
  } catch {
    return NextResponse.json({ ok: false, error: "session_unavailable" }, { status: 503 });
  }
  // Whitelist de destinos pós-login: /admin, /instancias, ou /planos* (retoma o
  // checkout do funil público de preços — só paths relativos, sem open redirect);
  // qualquer outro cai no SSO do Wayne (/login/enter → /chat).
  const target =
    next === "/admin" || next === "/instancias" || next.startsWith("/planos")
      ? next
      : "/login/enter";
  return NextResponse.json({ ok: true, next: target });
}

// Cria o registro do tenant Free (status=provisioning) e dispara o serviço
// provisionador. Retorna o tenantId novo, ou null se não pôde iniciar.
async function autoProvision(email: string): Promise<string | null> {
  try {
    const database = db();
    const slug = slugFor(email);
    const tenantId = `t-${slug}`;
    const trialCredits = FREE_ALLOWANCE_USD; // allowance Relay 2.5 Fast (Free)
    await database.execute(sql`INSERT INTO users (email, tenant_id, role) VALUES (${email}, ${tenantId}, 'admin') ON CONFLICT (email) DO NOTHING`);
    await database.execute(sql`
      INSERT INTO instances (tenant_id, name, url, fly_app, status, notes)
      VALUES (${tenantId}, ${"Work4You — " + slug}, '', ${"wayne-" + slug}, 'provisioning', 'Free · auto-provisionado')
    `);
    await database.execute(sql`
      INSERT INTO billing (tenant_id, plan, status, monthly_credits_usd)
      VALUES (${tenantId}, 'free', 'active', ${trialCredits}) ON CONFLICT (tenant_id) DO NOTHING
    `);
    const started = await requestProvision({ tenantId, slug, email, plan: "base", trialUsd: trialCredits });
    if (!started) {
      await database.execute(sql`UPDATE instances SET status='failed' WHERE tenant_id=${tenantId}`);
      return null;
    }
    return tenantId;
  } catch {
    return null;
  }
}
