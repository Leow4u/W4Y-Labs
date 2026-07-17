/**
 * executor-ws.cjs — driver WS residente do executor local (Onda 2).
 *
 * Roda no PROCESSO PRINCIPAL. Abre o PRÓPRIO WebSocket autenticado com o gateway
 * (independente da janela do chat), se registra como o "braço" da sessão e roda
 * o loop: recebe `local.exec.request` → `handleLocalExec` (executor.cjs, com a
 * guarda de pastas) → responde `local.exec.result`. O cérebro fica na nuvem.
 *
 * Auth = igual o SPA (fonte da verdade web/src/lib/api.ts): mint de ticket de
 * uso único em POST /api/auth/ws-ticket com os cookies da sessão do Electron
 * (net.request + useSessionCookies attacha os HttpOnly), depois WS
 * wss://host/api/ws?ticket=…. Ticket é single-use/TTL 30s → um mint por connect.
 *
 * Framing: JSON-RPC newline-delimited (mesmo dialeto do stdio do TUI). Enviamos
 * um frame por linha; ao receber, tratamos cada linha como um frame.
 */
const { net, session: electronSession } = require("electron");
const WebSocket = require("ws");
const { handleLocalExec, setAuthorizedRoots } = require("./executor.cjs");

let _ws = null;
let _opts = null;
let _stopped = false;
let _reconnectTimer = null;
let _rpcId = 0;

function _mintTicket(baseUrl, sess) {
  return new Promise((resolve, reject) => {
    const req = net.request({
      method: "POST",
      url: `${baseUrl}/api/auth/ws-ticket`,
      session: sess,
      useSessionCookies: true,
    });
    let body = "";
    req.on("response", (res) => {
      res.on("data", (c) => (body += c.toString()));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`ws-ticket HTTP ${res.statusCode}`));
        }
        try {
          const t = JSON.parse(body).ticket;
          if (!t) return reject(new Error("ws-ticket sem ticket"));
          resolve(t);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function _send(frame) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    try {
      _ws.send(JSON.stringify(frame) + "\n");
    } catch {
      /* best-effort */
    }
  }
}

function _rpc(method, params) {
  _send({ jsonrpc: "2.0", id: `x${++_rpcId}`, method, params });
}

function _onFrame(frame) {
  if (frame.method === "event" && frame.params && frame.params.type === "local.exec.request") {
    const p = frame.params.payload || {};
    const rid = p.request_id;
    Promise.resolve(handleLocalExec({ tool: p.tool, args: p.args }))
      .then((res) => res)
      .catch((e) => ({ ok: false, error: String((e && e.message) || e) }))
      .then((res) => {
        _send({
          jsonrpc: "2.0",
          id: `r${++_rpcId}`,
          method: "local.exec.result",
          params: { request_id: rid, result: JSON.stringify(res) },
        });
      });
  }
}

async function _connect() {
  if (_stopped || !_opts) return;
  const { baseUrl, sess, sessionKey, folders } = _opts;
  try {
    const ticket = await _mintTicket(baseUrl, sess);
    const wsUrl =
      baseUrl.replace(/^http/i, "ws") + `/api/ws?ticket=${encodeURIComponent(ticket)}`;
    const ws = new WebSocket(wsUrl);
    _ws = ws;
    ws.on("open", () => {
      setAuthorizedRoots(folders);
      _rpc("local.executor.register", {
        session_key: sessionKey,
        folders,
        os: process.platform,
      });
    });
    ws.on("message", (data) => {
      const text = data.toString();
      for (const line of text.split("\n")) {
        const s = line.trim();
        if (!s) continue;
        let frame;
        try {
          frame = JSON.parse(s);
        } catch {
          continue;
        }
        _onFrame(frame);
      }
    });
    ws.on("close", () => {
      if (_ws === ws) _ws = null;
      _scheduleReconnect();
    });
    ws.on("error", () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  } catch {
    // mint falhou (ainda não logado / rede) → tenta de novo
    _scheduleReconnect();
  }
}

function _scheduleReconnect() {
  if (_stopped || _reconnectTimer) return;
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    _connect();
  }, 4000);
}

/**
 * Inicia o executor residente.
 * opts: { baseUrl, session?, sessionKey, folders }
 */
function start(opts) {
  _opts = {
    baseUrl: String(opts.baseUrl || "").replace(/\/+$/, ""),
    sess: opts.session || electronSession.defaultSession,
    sessionKey: String(opts.sessionKey || ""),
    folders: opts.folders || [],
  };
  _stopped = false;
  // Já conectado (re-seleção de pasta, ou sessão NOVA com Local ativo): NÃO abre
  // uma 2ª conexão órfã — só atualiza o cofre e re-registra sob o session_key
  // atual (assim uma pasta recém-adicionada entra nas raízes, e uma sessão nova
  // passa a ter o executor sob a sua chave).
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    setAuthorizedRoots(_opts.folders);
    _rpc("local.executor.register", {
      session_key: _opts.sessionKey,
      folders: _opts.folders,
      os: process.platform,
    });
    return;
  }
  _connect();
}

function stop() {
  _stopped = true;
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (_ws) {
    try {
      if (_opts) _rpc("local.executor.unregister", { session_key: _opts.sessionKey });
      _ws.close();
    } catch {
      /* ignore */
    }
    _ws = null;
  }
}

module.exports = { start, stop };
