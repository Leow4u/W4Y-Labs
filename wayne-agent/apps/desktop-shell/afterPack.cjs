/**
 * afterPack.cjs — grava o ÍCONE e os metadados "Work4You" no Work4You.exe.
 *
 * Por que aqui e não pelo electron-builder: gravar ícone/versão no .exe exige o
 * `signAndEditExecutable: true`, que dispara a extração do toolset `winCodeSign`
 * — e essa extração cria symlinks (dylibs do macOS) que a conta Windows do dev
 * não tem privilégio pra criar (falha "cliente não tem o privilégio"). Como só
 * buildamos pra Windows, não precisamos daquele toolset: rodamos o `rcedit`
 * standalone (copiado pra tools/) direto no exe empacotado, ANTES do NSIS
 * empacotar o instalador. Assim o ícone entra no exe e nos atalhos, sem tocar
 * na assinatura (que segue pulada — não há certificado ainda).
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const exe = path.join(context.appOutDir, "Work4You.exe");
  const ico = path.join(__dirname, "assets", "icon.ico");
  const rcedit = path.join(__dirname, "tools", "rcedit-x64.exe");

  if (!fs.existsSync(rcedit) || !fs.existsSync(ico) || !fs.existsSync(exe)) {
    // eslint-disable-next-line no-console
    console.warn("[afterPack] rcedit/icon.ico/exe ausente — ícone não gravado");
    return;
  }

  // O ícone é COSMÉTICO — se o rcedit falhar (ex.: exe travado pelo McAfee no
  // meio do pack, gotcha recorrente), NÃO derrubar um build de ~5min. Loga e
  // segue: o instalador sai válido, só sem o ícone gravado no exe.
  try {
    execFileSync(
      rcedit,
      [
        exe,
        "--set-icon",
        ico,
        "--set-version-string",
        "ProductName",
        "Work4You",
        "--set-version-string",
        "FileDescription",
        "Work4You",
        "--set-version-string",
        "CompanyName",
        "W4Y Labs",
        "--set-version-string",
        "LegalCopyright",
        "© W4Y Labs",
      ],
      { stdio: "inherit" },
    );
    // eslint-disable-next-line no-console
    console.log("[afterPack] ícone + metadados gravados no exe via rcedit");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[afterPack] rcedit falhou — ícone não gravado:", (err && err.message) || err);
  }
};
