/**
 * executor.cjs — o "braço" local do Work4You (Onda 2).
 *
 * Roda no PROCESSO PRINCIPAL da casca desktop. Recebe `local.exec.request` do
 * gateway (via o driver de WS) e executa arquivo/shell na MÁQUINA DO USUÁRIO,
 * confinado às pastas autorizadas. O cérebro fica na nuvem — aqui só executa
 * ordens (ver memória architecture-cloud-brain). Módulo puro/testável: sem
 * electron, sem WS — só as primitivas + a guarda. O driver (WS) chama
 * `handleLocalExec` e devolve o resultado.
 *
 * SEGURANÇA (o cofre — enforcement):
 *   - Operações de ARQUIVO (read/write/list) são confinadas CANONICAMENTE às
 *     raízes autorizadas (resolve symlinks + path.relative, não startsWith cru
 *     — lição do bug do filesystem-MCP da Anthropic).
 *   - Comandos de SHELL rodam no cwd autorizado, mas NÃO dá pra confinar um
 *     shell numa máquina crua (ele navega livre; confinar de verdade pede
 *     sandbox de SO à la Codex/Seatbelt). Logo a segurança do shell vem da
 *     APROVAÇÃO por ação (Onda 4), não do cofre. Sem pasta autorizada → recusa.
 *
 *   A mesma contenção é reexportada como `resolveWithinVault` para os handlers
 *   de fs/git da casca (Desktop-2) — UMA regra de cofre, não duas.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

let _roots = []; // raízes autorizadas, canônicas

// Canoniza uma lista de raízes (resolve symlinks; cai pro caminho resolvido se
// a raiz ainda não existe). Compartilhado por `setAuthorizedRoots` e pela
// contenção sob demanda do cofre (`resolveWithinVault`).
function _canonicalizeRoots(paths) {
  return (paths || [])
    .map((p) => {
      try {
        return fs.realpathSync(path.resolve(p));
      } catch {
        return path.resolve(p);
      }
    })
    .filter(Boolean);
}

function setAuthorizedRoots(paths) {
  _roots = _canonicalizeRoots(paths);
}

function authorizedRoots() {
  return _roots.slice();
}

// git-bash/MSYS (o shell que o executor usa no Windows) reporta caminhos como
// "/c/DEV/x". No Windows, path.resolve("/c/DEV/x") vira "C:\c\DEV\x" (drive-
// relativo, com um "c" a mais) → NUNCA bate com o cofre "C:\DEV\x" e a leitura
// era barrada. Converte "/c/…" → "C:\…" antes de resolver. No-op fora do Windows
// (lá "/c/…" é um caminho POSIX legítimo).
function _winPath(p) {
  if (process.platform !== "win32") return String(p);
  const s = String(p);
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(s);
  return m ? m[1].toUpperCase() + ":" + (m[2] || "/").replace(/\//g, "\\") : s;
}

// Contenção canônica: target precisa estar DENTRO de root (ou ser o próprio).
function _within(target, root) {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Confina `p` a um conjunto de raízes JÁ CANÔNICAS. Núcleo compartilhado entre o
// executor (raízes = `_roots`) e os handlers de fs/git (raízes = cofre). Resolve
// symlinks do trecho existente + recompõe a cauda inexistente por cima (write de
// arquivo/pasta novos), então nem o alvo nem um pai symlinkado escapam.
function _confineToRoots(p, canonicalRoots) {
  if (!canonicalRoots.length) throw new Error("nenhuma pasta autorizada");
  const abs = path.resolve(_winPath(p));
  let probe = abs;
  const tail = [];
  for (;;) {
    try {
      probe = fs.realpathSync(probe); // resolve os links do trecho existente
      break;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) break; // subiu até a raiz do FS sem nada existir
      tail.unshift(path.basename(probe));
      probe = parent;
    }
  }
  const canonical = tail.length ? path.join(probe, ...tail) : probe;
  const ok = canonicalRoots.some((r) => _within(canonical, r));
  if (!ok) throw new Error(`caminho fora das pastas autorizadas: ${p}`);
  return canonical; // caminho canônico confinado (a chamada de fs opera nele)
}

function _resolveAllowed(p) {
  // NÃO usar o caminho léxico como fallback (era o furo): ele passaria por cima
  // do symlink já resolvido. As raízes do executor já vêm canônicas.
  return _confineToRoots(p, _roots);
}

// Superfície pública pros handlers de fs/git da casca (Desktop-2): confina `p`
// contra uma lista de pastas do cofre (crua — canoniza aqui) e devolve o caminho
// canônico confinado, ou LANÇA se estiver fora. Mesma guarda do executor.
function resolveWithinVault(p, folderList) {
  return _confineToRoots(p, _canonicalizeRoots(folderList));
}

function _findBash() {
  if (process.platform !== "win32") return "/bin/bash";
  const c = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "bin", "bash.exe"),
  ];
  for (const b of c) {
    try {
      if (b && fs.existsSync(b)) return b;
    } catch {
      /* ignore */
    }
  }
  return "bash"; // fallback: torcer pra estar no PATH
}

function _runShell({ cmd, cwd, login }) {
  return new Promise((resolve) => {
    if (!_roots.length) return resolve({ ok: false, error: "nenhuma pasta autorizada" });
    let workdir = cwd && String(cwd).trim() ? cwd : _roots[0];
    try {
      workdir = _resolveAllowed(workdir);
    } catch (e) {
      return resolve({ ok: false, error: String((e && e.message) || e) });
    }
    const bash = _findBash();
    const args = login ? ["-l", "-c", String(cmd)] : ["-c", String(cmd)];
    let out = "";
    let done = false;
    let child;
    try {
      child = spawn(bash, args, { cwd: workdir, windowsHide: true });
    } catch (e) {
      return resolve({ ok: false, error: String((e && e.message) || e) });
    }
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("error", (e) => {
      if (!done) {
        done = true;
        resolve({ ok: false, error: String((e && e.message) || e) });
      }
    });
    child.on("close", (code) => {
      if (!done) {
        done = true;
        resolve({ ok: true, output: out, exit_code: code == null ? 1 : code });
      }
    });
  });
}

async function _readFile({ path: p }) {
  const abs = _resolveAllowed(p);
  return { ok: true, content: await fsp.readFile(abs, "utf8") };
}

// ── Binary read (base64) for the dock's local preview/download channel ───────
// Small extension→mime map on purpose: the gateway only needs the common
// preview/download types; anything else is served as a generic octet-stream
// and the web falls back to plain download.
const _MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  html: "text/html",
  htm: "text/html",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  xml: "application/xml",
  js: "text/javascript",
  css: "text/css",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function _mimeForPath(p) {
  const ext = path.extname(p).slice(1).toLowerCase();
  return _MIME_BY_EXT[ext] || "application/octet-stream";
}

const _B64_MAX_BYTES = 10 * 1024 * 1024;

// read_file_b64 {path} → {ok, b64, size, mime}. Same vault containment as
// read_file (_resolveAllowed), but reads BYTES: images/PDF/office for the
// dock's preview and download. Stats BEFORE reading and refuses >10MB with a
// clean error — never loads the bytes just to throw them away.
async function _readFileB64({ path: p }) {
  const abs = _resolveAllowed(p);
  const st = await fsp.stat(abs);
  if (!st.isFile()) return { ok: false, error: `not a file: ${p}` };
  if (st.size > _B64_MAX_BYTES) {
    return { ok: false, error: `file too large for the local read channel (max 10MB): ${p}` };
  }
  const buf = await fsp.readFile(abs);
  return { ok: true, b64: buf.toString("base64"), size: buf.length, mime: _mimeForPath(abs) };
}

async function _writeFile({ path: p, content }) {
  const abs = _resolveAllowed(p);
  await fsp.writeFile(abs, content ?? "", "utf8");
  return { ok: true };
}

async function _listDir({ path: p }) {
  const abs = _resolveAllowed(p);
  const entries = await fsp.readdir(abs, { withFileTypes: true });
  return { ok: true, entries: entries.map((e) => ({ name: e.name, dir: e.isDirectory() })) };
}

/**
 * Ponto de entrada do driver: recebe {tool, args} e devolve o resultado.
 * tool: "shell" | "read_file" | "read_file_b64" | "write_file" | "list_dir".
 */
async function handleLocalExec({ tool, args }) {
  try {
    args = args || {};
    if (tool === "shell") return await _runShell(args);
    if (tool === "read_file") return await _readFile(args);
    if (tool === "read_file_b64") return await _readFileB64(args);
    if (tool === "write_file") return await _writeFile(args);
    if (tool === "list_dir") return await _listDir(args);
    return { ok: false, error: `ferramenta local desconhecida: ${tool}` };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { setAuthorizedRoots, authorizedRoots, resolveWithinVault, handleLocalExec };
