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
    // Conectores (Composio, projeto COMPARTILHADO — Onda 5, opção B): a mesma
    // project key vai pra todo tenant; o isolamento é o prefixo de tenant no
    // user_id (FLY_APP_NAME, feito pelo backend do Wayne). Fail-open: sem a
    // env no provisioner, o tenant nasce sem conectores (dashboard mostra o
    // aviso de "não configurado") e nada mais quebra.
    if (process.env.COMPOSIO_API_KEY) {
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
