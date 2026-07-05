// Roteador de sessão da Work4You (estilo Manus: domínio único, tenant vem
// da sessão). Roda como app Fly sempre-aceso em GRU, na frente de todas as
// instâncias Wayne. Para CADA requisição ele responde com o header
// `fly-replay: app=<app-do-tenant>` e o Fly Proxy re-envia a requisição
// original para o app certo — inclusive upgrades de WebSocket (o destino é
// quem negocia o upgrade; este processo nunca negocia WS, por contrato do
// fly-replay) — e acorda máquinas suspensas (autostart) no caminho.
//
// O tenant vem do cookie `w4y_route` (HttpOnly), gravado pela casca no SSO
// (/login/enter). O cookie é só um HINT de roteamento: forjá-lo leva no
// máximo à tela de login de outro tenant (cada app tem seus próprios
// secrets de dashboard — cookies de sessão de A não valem em B). A
// segurança de dados permanece na camada de auth do Wayne.
//
// Sem cookie (ou inválido) → app default (primeiro tenant, wayne-w4y),
// preservando o comportamento de antes do multi-tenant.
const http = require("node:http");

const DEFAULT_APP = process.env.DEFAULT_APP || "wayne-w4y";
// Nomes de app válidos que aceitamos rotear (anti-injeção de header).
const APP_RE = /^wayne-[a-z0-9-]{2,30}$/;

function routeFor(req) {
  const cookies = req.headers.cookie || "";
  const m = /(?:^|;\s*)w4y_route=([^;]+)/.exec(cookies);
  const candidate = m ? decodeURIComponent(m[1]).trim() : "";
  return APP_RE.test(candidate) ? candidate : DEFAULT_APP;
}

const server = http.createServer((req, res) => {
  // Health do próprio roteador (não replayado) — para checks e debugging.
  if (req.url === "/router-healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  const app = routeFor(req);
  res.writeHead(204, { "fly-replay": `app=${app}` });
  res.end();
});

// IMPORTANTE: upgrades de WS chegam como evento 'upgrade' — respondemos com
// o fly-replay SEM negociar o upgrade (resposta HTTP simples no socket).
server.on("upgrade", (req, socket) => {
  const app = routeFor(req);
  socket.end(
    `HTTP/1.1 204 No Content\r\nfly-replay: app=${app}\r\nconnection: close\r\n\r\n`,
  );
});

const port = process.env.PORT || 8080;
server.listen(port, "0.0.0.0", () => {
  console.log(`[router] ouvindo em :${port}; default=${DEFAULT_APP}`);
});
