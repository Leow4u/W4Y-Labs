/**
 * folders.cjs — o COFRE de pastas autorizadas (Onda 3).
 *
 * Fonte da verdade das raízes que o usuário liberou pro executor local tocar.
 * Persistido em userData/authorized-folders.json. O executor (executor.cjs) só
 * mexe em caminhos DENTRO dessas raízes; adicionar/remover passa pelo diálogo
 * nativo de autorização (main.cjs). Módulo simples e síncrono.
 */
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function _file() {
  return path.join(app.getPath("userData"), "authorized-folders.json");
}

function list() {
  try {
    const raw = JSON.parse(fs.readFileSync(_file(), "utf8"));
    return Array.isArray(raw.folders) ? raw.folders : [];
  } catch {
    return [];
  }
}

function _save(folders) {
  try {
    fs.writeFileSync(_file(), JSON.stringify({ folders }, null, 2), "utf8");
  } catch {
    /* best-effort */
  }
}

function add(p) {
  const abs = path.resolve(String(p || ""));
  if (!abs) return list();
  const cur = list();
  if (!cur.includes(abs)) {
    cur.push(abs);
    _save(cur);
  }
  return list();
}

function remove(p) {
  const abs = path.resolve(String(p || ""));
  const cur = list().filter((f) => f !== abs);
  _save(cur);
  return cur;
}

module.exports = { list, add, remove };
