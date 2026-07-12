// Serviço provisionador da Work4You (Fase 3+): as "mãos no Fly" da
// plataforma. A casca (Cloud Run) não roda flyctl; este app (Fly, sempre
// aceso, org token) executa as operações de frota:
//   POST /provision {tenantId, slug, email, plan, trialUsd}  (async → callback)
//   POST /archive   {app, tenantId}                          (snapshot+destroy)
//   GET  /healthz
// Não toca no banco: a CASCA é dona do registry. O /provision devolve o
// resultado por callback assinado (HMAC) em CASCA_URL/onboarding/complete.
const http = require("node:http");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SECRET = process.env.PROVISIONER_SHARED_SECRET || "";
const CASCA_URL = (process.env.CASCA_URL || "https://work4you.ai").replace(/\/$/, "");
const IMAGE = process.env.WAYNE_IMAGE || "registry.fly.io/wayne-w4y:fly2";
const ORG = process.env.FLY_ORG || "personal";
const REGION = process.env.FLY_REGION || "gru";
const OR_PROV = process.env.OPENROUTER_PROVISIONING_KEY || "";

function sh(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 300000, maxBuffer: 1 << 24, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${cmd} ${args.join(" ")} → ${stderr || err.message}`));
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

async function createOpenRouterKey(tenantId, limitUsd) {
  const res = await fetch("https://openrouter.ai/api/v1/keys", {
    method: "POST",
    headers: { Authorization: `Bearer ${OR_PROV}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `tenant:${tenantId}`, limit: limitUsd }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`openrouter: ${JSON.stringify(j).slice(0, 200)}`);
  return { key: j.key, hash: (j.data ?? j).hash };
}

// ── Conectores · Composio, opção A (projeto DEDICADO por tenant) ──────────
// Isolamento FÍSICO: cada tenant tem seu próprio projeto Composio + chave.
// A org-admin key (COMPOSIO_ORG_KEY) vive SÓ aqui no control-plane — NUNCA no
// VM do tenant (lá vai só a chave do projeto dele). Fecha o resíduo do modelo
// compartilhado (opção B): um VM comprometido só alcança o próprio projeto.
const COMPOSIO_BASE = (process.env.COMPOSIO_BASE || "https://backend.composio.dev").replace(/\/$/, "");
const COMPOSIO_ORG_KEY = process.env.COMPOSIO_ORG_KEY || "";
const COMPOSIO_LOGO_URL = process.env.COMPOSIO_LOGO_URL || "";

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
// na criação. Idempotente: se já existe, regenera a chave (a lista NÃO devolve
// a chave — ela só volta na criação/regeneração). Devolve {projectId, apiKey}.
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
async function provision({ tenantId, slug, email, plan, trialUsd }) {
  const app = `wayne-${slug}`;
  const result = { tenantId, ok: false };
  try {
    await fly("apps", "create", app, "--org", ORG);
    await fly("volumes", "create", "wayne_data", "--region", REGION, "--size", "3", "-a", app, "--yes");
    await fly("storage", "create", "-a", app, "-n", `${app}-state`, "--yes");

    const dashUser = `w4y-${slug}`;
    const dashPass = token(24);
    const dashSecret = token(32);
    const apiKey = token(24);
    const or = await createOpenRouterKey(tenantId, trialUsd);

    const secrets = [
      `OPENROUTER_API_KEY=${or.key}`,
      `API_SERVER_KEY=${apiKey}`,
      `WAYNE_DASHBOARD_BASIC_AUTH_USERNAME=${dashUser}`,
      `WAYNE_DASHBOARD_BASIC_AUTH_PASSWORD=${dashPass}`,
      `WAYNE_DASHBOARD_BASIC_AUTH_SECRET=${dashSecret}`,
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
    await fly("secrets", "set", "-a", app, "--stage", ...secrets);

    const tomlPath = path.join(os.tmpdir(), `fly.${app}.toml`);
    writeFileSync(tomlPath, tenantToml(app, plan));
    await fly("deploy", "-c", tomlPath, "-a", app, "--image", IMAGE, "--ha=false", "--regions", REGION);

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
function tenantToml(app, plan) {
  const autostop = plan === "premium" ? '"off"' : '"suspend"';
  const minRun = plan === "premium" ? 1 : 0;
  return `app = "${app}"
primary_region = "${REGION}"
[build]
  image = "${IMAGE}"
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
async function reconfigure({ app, plan }) {
  const tomlPath = path.join(os.tmpdir(), `fly.${app}.toml`);
  writeFileSync(tomlPath, tenantToml(app, plan));
  await fly("deploy", "-c", tomlPath, "-a", app, "--image", IMAGE, "--ha=false", "--regions", REGION);
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
  if (req.url === "/healthz") { res.writeHead(200); return res.end("ok"); }
  if (req.method !== "POST") { res.writeHead(405); return res.end(); }
  const raw = await readBody(req);
  // auth: assinatura HMAC do corpo (mesma chave que a casca usa)
  const sig = req.headers["x-provisioner-sig"] || "";
  if (!SECRET || sign(raw) !== sig) { res.writeHead(401); return res.end("bad_sig"); }
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
  res.writeHead(404); res.end();
});

server.listen(process.env.PORT || 8080, "0.0.0.0", () => console.log("[provisioner] pronto"));
