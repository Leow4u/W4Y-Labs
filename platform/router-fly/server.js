// Roteador de sessão da Work4You (estilo Manus: domínio único, tenant vem
// da sessão). Roda como app Fly sempre-aceso em GRU, na frente de todas as
// instâncias Wayne. Para CADA requisição ele responde com o header
// `fly-replay: app=<app-do-tenant>` e o Fly Proxy re-envia a requisição
// original para o app certo — inclusive upgrades de WebSocket.
//
// O tenant vem do cookie `w4y_route` (HttpOnly), gravado pela casca no SSO
// (/login/enter). O cookie é só um HINT de roteamento: forjá-lo leva no
// máximo à tela de login de outro tenant.
//
// Claude v1: sem cookie (ou app proibido / lab `wayne-w4y`) → login.
// Pedidos /api/* recebem 401 JSON (a casca Electron segue redirects e
// tratava a HTML do login como "ok"). Navegação de browser → 302 login.
const http = require("node:http");

const PLATFORM_LOGIN =
  (process.env.PLATFORM_LOGIN_URL || "https://work4you.ai/login").replace(
    /\/$/,
    "",
  );
// Nomes de app válidos que aceitamos rotear (anti-injeção de header).
const APP_RE = /^wayne-[a-z0-9-]{2,30}$/;
/** Lab / image factory — never a customer fly-replay target. */
const FORBIDDEN_CUSTOMER_APPS = new Set(["wayne-w4y"]);

function routeFor(req) {
  const cookies = req.headers.cookie || "";
  const m = /(?:^|;\s*)w4y_route=([^;]+)/.exec(cookies);
  const candidate = m ? decodeURIComponent(m[1]).trim() : "";
  if (!APP_RE.test(candidate)) return null;
  if (FORBIDDEN_CUSTOMER_APPS.has(candidate)) return null;
  return candidate;
}

function requestPath(req) {
  const raw = req.url || "/";
  try {
    return new URL(raw, "http://router.local").pathname;
  } catch {
    return String(raw).split("?")[0] || "/";
  }
}

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function sendLoginRedirect(res) {
  res.writeHead(302, {
    location: PLATFORM_LOGIN,
    "cache-control": "no-store",
  });
  res.end();
}

function sendApiUnauthorized(res) {
  res.writeHead(401, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify({ error: "no_route", login: PLATFORM_LOGIN }));
}

function sendLoginRedirectSocket(socket) {
  socket.end(
    `HTTP/1.1 401 Unauthorized\r\n` +
      `content-type: application/json\r\n` +
      `cache-control: no-store\r\n` +
      `connection: close\r\n\r\n` +
      `{"error":"no_route"}`,
  );
}

const server = http.createServer((req, res) => {
  if (req.url === "/router-healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  const app = routeFor(req);
  if (!app) {
    if (isApiPath(requestPath(req))) {
      sendApiUnauthorized(res);
      return;
    }
    sendLoginRedirect(res);
    return;
  }
  res.writeHead(204, { "fly-replay": `app=${app}` });
  res.end();
});

server.on("upgrade", (req, socket) => {
  const app = routeFor(req);
  if (!app) {
    sendLoginRedirectSocket(socket);
    return;
  }
  socket.end(
    `HTTP/1.1 204 No Content\r\nfly-replay: app=${app}\r\nconnection: close\r\n\r\n`,
  );
});

const port = process.env.PORT || 8080;
server.listen(port, "0.0.0.0", () => {
  console.log(
    `[router] ouvindo em :${port}; sem default partilhado (login=${PLATFORM_LOGIN})`,
  );
});
