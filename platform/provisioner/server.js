// Serviço provisionador da Work4You (Fase 3+): as "mãos no Fly" da
// plataforma. A casca (Cloud Run) não roda flyctl; este app (Fly, sempre
// aceso, org token) executa as operações de frota:
//   POST /provision  {tenantId, slug, email, plan, trialUsd}  (async → callback)
//   POST /archive    {app, tenantId}                           (snapshot+destroy)
//   POST /reconfigure{app, plan}                               (regime base/premium)
//   POST /ensure-key {app, tenantId, limitUsd}  → {hash}       (cria+injeta chave capada)
//   POST /device-key {app, tenantId, limitUsd, deviceLabel?}  (key OpenRouter
//                     por dispositivo + toolEnv plataforma: Firecrawl /
//                     Langfuse quando ops setou. Conectores não saem por aqui —
//                     ver "conectores NÃO saem por aqui" abaixo)
//   GET  /healthz
// Não toca no banco: a CASCA é dona do registry. O /provision devolve o
// resultado por callback assinado (HMAC) em CASCA_URL/onboarding/complete.
//
// Ops — secrets obrigatórios no app Fly do provisioner (shared, não per-tenant):
//   W4Y_FIRECRAWL_API_KEY, W4Y_LANGFUSE_PUBLIC_KEY, W4Y_LANGFUSE_SECRET_KEY
//   (opcional W4Y_LANGFUSE_BASE_URL). Sem eles, browser/observability ficam
//   off até ops setar — correto para cloud-first. Nunca logar os valores.
const http = require("node:http");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SECRET = process.env.PROVISIONER_SHARED_SECRET || "";
const CASCA_URL = (process.env.CASCA_URL || "https://work4you.ai").replace(/\/$/, "");
// Prefer TENANT_WAYNE_IMAGE — Fly secret WAYNE_IMAGE can stick on an old tag when
// `fly secrets set` hangs (ago/2026). Reject stale WAYNE_IMAGE below fly251.
const IMAGE_PIN = "registry.fly.io/wayne-w4y:fly251";
function resolveWayneImage() {
  const preferred = String(process.env.TENANT_WAYNE_IMAGE || "").trim();
  if (preferred) return preferred;
  const legacy = String(process.env.WAYNE_IMAGE || "").trim();
  const m = /^registry\.fly\.io\/wayne-w4y:fly(\d+)$/.exec(legacy);
  if (m && Number(m[1]) >= 251) return legacy;
  return IMAGE_PIN;
}
const IMAGE = resolveWayneImage();
const ORG = process.env.FLY_ORG || "personal";
const REGION = process.env.FLY_REGION || "gru";
const OR_PROV = process.env.OPENROUTER_PROVISIONING_KEY || "";

// Redige segredos de qualquer string (erro/log). flyctl recebe os secrets como
// `KEY=value` no argv e os ecoa em erros — sem isto, a runtime key OpenRouter (e
// senha/secret do dashboard) vazariam no callback e seriam persistidas no
// registry. Centralizado aqui p/ nenhum caller poder encaminhar cru por acidente.
function redact(s) {
  return String(s)
    .replace(/(\b[\w-]*(?:KEY|PASSWORD|SECRET|TOKEN)=)\S+/gi, "$1***")
    .replace(/sk-or-[A-Za-z0-9._-]+/g, "sk-or-***");
}

function sh(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 300000, maxBuffer: 1 << 24, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(redact(`${cmd} ${args.join(" ")} → ${stderr || err.message}`)));
      resolve(stdout.toString());
    });
  });
}
const fly = (...args) => sh("flyctl", args);
function token(n) {
  return crypto.randomBytes(n).toString("base64").replace(/[/+=]/g, "").slice(0, 2 * n);
}
function sign(body) {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

async function createOpenRouterKey(name, limitUsd) {
  const res = await fetch("https://openrouter.ai/api/v1/keys", {
    method: "POST",
    headers: { Authorization: `Bearer ${OR_PROV}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, limit: limitUsd }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`openrouter: ${JSON.stringify(j).slice(0, 200)}`);
  return { key: j.key, hash: (j.data ?? j).hash };
}

// ── Pivô desktop · chave de modelo POR DISPOSITIVO ────────────────────────
// Cria uma runtime key OpenRouter NOVA e SEPARADA da key do Fly, com o mesmo
// limite do plano do tenant (limitUsd vem da casca, dona do registry). É a
// ÚNICA rota onde a chave CRUA sai deste serviço — por design: ela vai para
// o dispositivo do dono gravar em ~/.wayne/.env (motor local). Uma key por
// dispositivo = revogação granular sem tocar na key da nuvem.
// ATENÇÃO: nunca logar a key nem o corpo da resposta desta rota.
async function createDeviceKey({ tenantId, limitUsd }) {
  const suffix = crypto.randomBytes(3).toString("hex"); // 6 chars fixos
  const safeTenant = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  const name = `w4y-${safeTenant}-device-${suffix}`;
  const { key, hash } = await createOpenRouterKey(name, limitUsd);
  return { key, hash, name };
}

// ── Conectores · Composio, opção A (projeto DEDICADO por tenant) ──────────
// Isolamento FÍSICO: cada tenant tem seu próprio projeto Composio + chave.
// A org-admin key (COMPOSIO_ORG_KEY) vive SÓ aqui no control-plane — NUNCA no
// VM do tenant (lá vai só a chave do projeto dele). Fecha o resíduo do modelo
// compartilhado (opção B): um VM comprometido só alcança o próprio projeto.
const COMPOSIO_BASE = (process.env.COMPOSIO_BASE || "https://backend.composio.dev").replace(/\/$/, "");
const COMPOSIO_ORG_KEY = process.env.COMPOSIO_ORG_KEY || "";
const COMPOSIO_LOGO_URL = process.env.COMPOSIO_LOGO_URL || "";

// Shared platform tool secrets (Firecrawl + Langfuse). Read once at boot;
// empty → omit from Fly secrets / device toolEnv (features stay off).
function platformToolEnv() {
  const env = {};
  const firecrawl = String(process.env.W4Y_FIRECRAWL_API_KEY || "").trim();
  const lfPub = String(process.env.W4Y_LANGFUSE_PUBLIC_KEY || "").trim();
  const lfSec = String(process.env.W4Y_LANGFUSE_SECRET_KEY || "").trim();
  const lfBase = String(process.env.W4Y_LANGFUSE_BASE_URL || "").trim();
  if (firecrawl) env.FIRECRAWL_API_KEY = firecrawl;
  if (lfPub) env.WAYNE_LANGFUSE_PUBLIC_KEY = lfPub;
  if (lfSec) env.WAYNE_LANGFUSE_SECRET_KEY = lfSec;
  if (lfBase) env.WAYNE_LANGFUSE_BASE_URL = lfBase;
  return env;
}

function platformToolSecretArgs() {
  return Object.entries(platformToolEnv()).map(([k, v]) => `${k}=${v}`);
}

async function composioOrg(method, pathname, body) {
  const res = await fetch(COMPOSIO_BASE + pathname, {
    method,
    // Org-owner endpoints exigem x-org-api-key (não x-api-key, que é a project
    // key). A chave de PROJETO devolvida vai como x-api-key no tenant.
    headers: { "x-org-api-key": COMPOSIO_ORG_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* corpo não-JSON */ }
  if (!res.ok) throw new Error(`composio ${res.status}: ${text.slice(0, 200)}`);
  return j;
}

// Garante o projeto Composio do tenant (nome = app Fly). White-label embutido
// na criação. Devolve {projectId, apiKey}.
// ⚠️ Só o caminho de CRIAÇÃO devolve chave de facto. Para um projeto que já
// existe a chave é irrecuperável (a lista e o GET vêm mascarados) e o
// regenerate_api_key responde 403 "API key regeneration is not enabled for this
// organization" — provado ao vivo. Portanto re-provisionar um tenant que já tem
// projeto sai daqui por excepção e o chamador segue sem conectores. Reparar isto
// é onda C do docs/PLANO-CREDENCIAIS-E-GATEWAY.md (projeto por tenant + chave
// entregue pelo tenant-runtime).
async function ensureComposioProject(app) {
  const name = app.slice(0, 75).replace(/[^a-zA-Z0-9_-]/g, "-");
  const list = await composioOrg("GET", "/api/v3/org/owner/project/list");
  const existing = (list?.data || []).find((p) => p.name === name);
  if (existing) {
    const r = await composioOrg(
      "POST", `/api/v3/org/owner/project/${existing.id}/regenerate_api_key`,
    );
    return { projectId: existing.id, apiKey: r?.api_key ?? r?.key };
  }
  const created = await composioOrg("POST", "/api/v3/org/owner/project/new", {
    name,
    should_create_api_key: true,
    config: {
      is_2FA_enabled: false,
      mask_secret_keys_in_connected_account: true,
      log_visibility_setting: "show_all",
      display_name: "Work4You",
      ...(COMPOSIO_LOGO_URL ? { logo_url: COMPOSIO_LOGO_URL } : {}),
    },
  });
  return { projectId: created.id, apiKey: created.api_key };
}

// ── Pivô desktop · conectores NÃO saem por aqui ────────────────────────────
// Houve aqui um `createComposioDeviceKey` que tentava dar ao motor local a
// COMPOSIO_API_KEY do projeto do tenant. As duas portas estão fechadas do lado
// da Composio, ambas provadas ao vivo por sondas de dentro deste serviço:
//   • key ADICIONAL (POST /api/v3/org/project/{id}/api_keys/create) → 404 sob
//     org-key, nas quatro variantes de path (a do dashboard exige sessão de
//     navegador);
//   • regenerate_api_key → 403 "API key regeneration is not enabled for this
//     organization".
// Ou seja, a função nunca devolvia chave: gastava duas chamadas e devolvia erro
// a cada login. Removida em vez de mantida como tentativa, porque descrevia um
// comportamento que não existe.
// O caminho que serve o desktop é o BROKER DO TENANT: o motor local pede
// GET /api/device/connector-bootstrap ao tenant, atrás do auth do dashboard, e
// recebe a chave que já está no Fly dele. Ver docs/BACKEND-MAP.md, "Duas
// paredes do Composio".

// Apaga o projeto Composio do tenant no teardown (para custo + limpa dados).
async function deprovisionComposioProject(app) {
  if (!COMPOSIO_ORG_KEY) return;
  try {
    const list = await composioOrg("GET", "/api/v3/org/owner/project/list");
    const p = (list?.data || []).find((x) => x.name === app);
    if (p) await composioOrg("DELETE", `/api/v3/org/owner/project/${p.id}`);
  } catch (e) {
    console.error("[provisioner] composio deprovision:", e.message);
  }
}

// Executa o provisionamento completo e chama de volta a casca ao terminar.
async function provision({ tenantId, slug, email, plan, trialUsd, wayneImage }) {
  const app = `wayne-${slug}`;
  const image = (wayneImage && String(wayneImage).trim()) || IMAGE;
  const result = { tenantId, ok: false };
  try {
    await fly("apps", "create", app, "--org", ORG);
    await fly("volumes", "create", "wayne_data", "--region", REGION, "--size", "3", "-a", app, "--yes");
    await fly("storage", "create", "-a", app, "-n", `${app}-state`, "--yes");

    const dashUser = `w4y-${slug}`;
    const dashPass = token(24);
    const dashSecret = token(32);
    const apiKey = token(24);
    const or = await createOpenRouterKey(`tenant:${tenantId}`, trialUsd);

    const secrets = [
      `OPENROUTER_API_KEY=${or.key}`,
      `API_SERVER_KEY=${apiKey}`,
      `WAYNE_DASHBOARD_BASIC_AUTH_USERNAME=${dashUser}`,
      `WAYNE_DASHBOARD_BASIC_AUTH_PASSWORD=${dashPass}`,
      `WAYNE_DASHBOARD_BASIC_AUTH_SECRET=${dashSecret}`,
      `W4Y_TENANT_ID=${tenantId}`,
      `W4Y_PLATFORM_SSO_SECRET=${SECRET}`,
      `W4Y_PLATFORM_ORIGIN=${CASCA_URL}`,
    ];
    // Conectores (Composio). Opção A (COMPOSIO_ORG_KEY presente): projeto
    // DEDICADO por tenant — isolamento físico; injeta SÓ a chave do projeto
    // dele. Senão, opção B (COMPOSIO_API_KEY): chave compartilhada, isolamento
    // por prefixo de user_id (feito no backend do Wayne). Fail-open: sem
    // nenhuma das duas, o tenant nasce sem conectores e nada mais quebra.
    if (COMPOSIO_ORG_KEY) {
      try {
        const proj = await ensureComposioProject(app);
        secrets.push(`COMPOSIO_API_KEY=${proj.apiKey}`);
        result.composioProjectId = proj.projectId;
      } catch (e) {
        console.error("[provisioner] composio project falhou:", e.message);
      }
    } else if (process.env.COMPOSIO_API_KEY) {
      secrets.push(`COMPOSIO_API_KEY=${process.env.COMPOSIO_API_KEY}`);
    }
    secrets.push(...platformToolSecretArgs());
    const regime = regimeEnvSecrets(plan, app);
    secrets.push(...regime.set);
    await fly("secrets", "set", "-a", app, "--stage", ...secrets);

    const tomlPath = path.join(os.tmpdir(), `fly.${app}.toml`);
    writeFileSync(tomlPath, tenantToml(app, plan, image));
    await fly("deploy", "-c", tomlPath, "-a", app, "--image", image, "--ha=false", "--regions", REGION);

    Object.assign(result, {
      ok: true, app, url: `https://${app}.fly.dev`,
      dashboardUsername: dashUser, dashboardPassword: dashPass, openrouterKeyHash: or.hash,
    });
  } catch (e) {
    result.error = String(e.message || e).slice(0, 500);
  }
  // callback assinado para a casca persistir (ou marcar falha)
  try {
    const body = JSON.stringify(result);
    await fetch(`${CASCA_URL}/onboarding/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-provisioner-sig": sign(body) },
      body,
    });
  } catch (e) {
    console.error("[provisioner] callback falhou:", e.message);
  }
}

// Gera o fly.toml de um tenant conforme o regime do plano.
function tenantWakeUrl(app) {
  return `https://${app}.fly.dev/api/auth/providers`;
}

// H3: wake URL per tenant — relay/scale-to-zero poke + cron HTTP wake (same path).
function regimeEnvSecrets(plan, app) {
  const secrets = [`GATEWAY_RELAY_WAKE_URL=${tenantWakeUrl(app)}`];
  if (plan === "premium") {
    // Premium: always-on; scale-to-zero off (unset if present from prior base).
    return { set: secrets, unset: ["WAYNE_SCALE_TO_ZERO"] };
  }
  secrets.push("WAYNE_SCALE_TO_ZERO=1");
  return { set: secrets, unset: [] };
}

async function applyRegimeSecrets(app, plan) {
  const { set, unset } = regimeEnvSecrets(plan, app);
  if (unset.length) {
    await fly("secrets", "unset", "-a", app, ...unset).catch(() => {});
  }
  if (set.length) {
    await fly("secrets", "set", "-a", app, ...set);
  }
}

function tenantToml(app, plan, image) {
  const autostop = plan === "premium" ? '"off"' : '"suspend"';
  const minRun = plan === "premium" ? 1 : 0;
  return `app = "${app}"
primary_region = "${REGION}"
[build]
  image = "${image}"
[processes]
  app = "gateway run"
[env]
  WAYNE_DASHBOARD = "1"
  WAYNE_DASHBOARD_HOST = "0.0.0.0"
  WAYNE_DASHBOARD_PORT = "8080"
  FORWARDED_ALLOW_IPS = "*"
[mounts]
  source = "wayne_data"
  destination = "/opt/data"
[http_service]
  processes = ["app"]
  internal_port = 8080
  force_https = true
  auto_stop_machines = ${autostop}
  auto_start_machines = true
  min_machines_running = ${minRun}
[[vm]]
  size = "shared-cpu-2x"
  memory = "2048mb"
`;
}

// Troca o regime da máquina de um tenant (upgrade/downgrade de plano):
// re-deploya o app com o novo autostop/min_machines. Estado no volume
// persiste; downtime ~segundos.
async function reconfigure({ app, plan, wayneImage }) {
  const image = (wayneImage && String(wayneImage).trim()) || IMAGE;
  const tomlPath = path.join(os.tmpdir(), `fly.${app}.toml`);
  writeFileSync(tomlPath, tenantToml(app, plan, image));
  await fly("deploy", "-c", tomlPath, "-a", app, "--image", image, "--ha=false", "--regions", REGION);
  await applyRegimeSecrets(app, plan);
}

// Seta o secret OPENROUTER_API_KEY (+ toolEnv plataforma quando ops setou) na
// máquina Fly do tenant. Sem --stage: aplica de imediato e reinicia a máquina,
// então o agente sobe usando a chave capada. A redação de segredos é global
// (sh()) — o erro nunca traz a key crua.
async function injectKey(app, key) {
  const extras = platformToolSecretArgs();
  await fly("secrets", "set", "-a", app, `OPENROUTER_API_KEY=${key}`, ...extras);
}

// Fonte ÚNICA da chave capada: cria a runtime key OpenRouter (limite = teto) E a
// injeta no app, atomicamente; devolve só o hash. A key crua NUNCA sai daqui (a
// casca não a vê) — elimina o transporte da key pela rede. Idempotente o
// bastante p/ retry: repetir cria uma chave nova e re-seta o secret (a anterior,
// que nunca foi usada, fica órfã e inofensiva).
async function ensureKey({ app, tenantId, limitUsd }) {
  if (!app || !tenantId) throw new Error("app e tenantId obrigatorios");
  // Convenção de nome preservada pós-generalização de createOpenRouterKey:
  // key da NUVEM = `tenant:<id>` (device keys usam `w4y-<id>-device-<sufixo>`).
  const or = await createOpenRouterKey(`tenant:${tenantId}`, limitUsd);
  await injectKey(app, or.key);
  return or.hash;
}

async function archive({ app }) {
  // Snapshot de segurança (retenção padrão do Fly) e destruição total do app
  // (para todo custo: máquina + volume + Tigris). Restaurável do snapshot.
  try {
    const vols = await fly("volumes", "list", "-a", app, "--json").catch(() => "[]");
    for (const v of JSON.parse(vols || "[]")) {
      await fly("volumes", "snapshots", "create", v.id, "-a", app).catch(() => {});
    }
  } catch { /* sem volume — segue para destruir */ }
  await deprovisionComposioProject(app);
  await fly("apps", "destroy", app, "--yes");
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      ok: true,
      wayneImage: IMAGE,
      routes: ["/provision", "/archive", "/reconfigure", "/ensure-key", "/device-key"],
      ensureKey: true,
      relayWake: true,
      ts: new Date().toISOString(),
    }));
  }
  if (req.method !== "POST") { res.writeHead(405); return res.end(); }
  const raw = await readBody(req);
  // auth: assinatura HMAC do corpo (mesma chave que a casca usa). Comparação
  // constant-time (espelha verifyProvisionerSig do cliente) — evita timing
  // side-channel na verificação da assinatura que libera /ensure-key.
  const sig = String(req.headers["x-provisioner-sig"] || "");
  const expected = SECRET ? sign(raw) : "";
  const sigOk = !!SECRET && sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  if (!sigOk) { res.writeHead(401); return res.end("bad_sig"); }
  let body;
  try { body = JSON.parse(raw); } catch { res.writeHead(400); return res.end("bad_json"); }

  if (req.url === "/provision") {
    // async: aceita já e trabalha em background (deploy leva minutos).
    res.writeHead(202); res.end(JSON.stringify({ accepted: true }));
    provision(body).catch((e) => console.error("[provision]", e));
    return;
  }
  if (req.url === "/archive") {
    try { await archive(body); res.writeHead(200); res.end(JSON.stringify({ ok: true })); }
    catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e.message) })); }
    return;
  }
  if (req.url === "/reconfigure") {
    try { await reconfigure(body); res.writeHead(200); res.end(JSON.stringify({ ok: true })); }
    catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e.message) })); }
    return;
  }
  if (req.url === "/ensure-key") {
    // sh() redige segredos do erro; seguro ecoar e.message aqui.
    try { const hash = await ensureKey(body); res.writeHead(200); res.end(JSON.stringify({ ok: true, hash })); }
    catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e.message) })); }
    return;
  }
  if (req.url === "/device-key") {
    // Pivô desktop: runtime key OpenRouter por DISPOSITIVO, mesma auth HMAC
    // das demais rotas. Síncrono (uma chamada REST). A resposta carrega a
    // chave crua — vai direto para o dispositivo do dono; NUNCA logar.
    const limitUsd = Number(body.limitUsd);
    if (!body.tenantId || !Number.isFinite(limitUsd) || limitUsd <= 0) {
      res.writeHead(400); return res.end(JSON.stringify({ error: "bad_request" }));
    }
    try {
      const dk = await createDeviceKey({ tenantId: body.tenantId, limitUsd });
      // Platform tool secrets (Firecrawl / Langfuse) — shared org keys for the
      // desktop .env. Never log values; only whether the bag is non-empty.
      const toolEnv = platformToolEnv();
      const toolEnvKeys = Object.keys(toolEnv);
      // log de auditoria sem segredo: só nome/hash identificam a key
      console.log(
        `[provisioner] device-key tenant=${body.tenantId} app=${body.app || "?"} name=${dk.name} limit=${limitUsd}` +
        ` toolEnv=${toolEnvKeys.length ? toolEnvKeys.join(",") : "none"}`,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        ok: true, key: dk.key, hash: dk.hash, limitUsd, name: dk.name,
        ...(toolEnvKeys.length ? { toolEnv } : {}),
      }));
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "openrouter_failed", detail: String(e.message || e).slice(0, 300) }));
    }
  }
  res.writeHead(404); res.end();
});

server.listen(process.env.PORT || 8080, "0.0.0.0", () => console.log("[provisioner] pronto"));
