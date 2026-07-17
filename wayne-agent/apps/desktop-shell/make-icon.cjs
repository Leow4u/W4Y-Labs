/**
 * make-icon.cjs — rasteriza o favicon OFICIAL do Work4You (SVG vetorial, com
 * filtros/gradientes) usando o próprio Chromium do Electron (suporte total a
 * feTurbulence, máscaras e brilho) e gera:
 *   - assets/icon.png  (1024, fonte pro electron-builder / linux / mac)
 *   - assets/icon.ico  (multi-tamanho 256..16, PNG-based, pro rcedit + NSIS)
 *
 * force-device-scale-factor=1 → buffer exatamente 1024×1024 (imune ao DPI 125%).
 * Janela oculta (mas pintada); captura após did-finish-load + respiro pros
 * filtros assentarem. O .ico é montado à mão (formato PNG-in-ICO, Vista+), zero
 * dependência externa.
 *
 * Rodar:  ./node_modules/.bin/electron make-icon.cjs
 */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("high-dpi-support", "1");

const SVG_SRC = path.resolve(
  __dirname,
  "..",
  "..",
  "web",
  "public",
  "brand",
  "work4you-favicon.svg",
);
const OUT_PNG = path.join(__dirname, "assets", "icon.png");
const OUT_ICO = path.join(__dirname, "assets", "icon.ico");
const TMP_HTML = path.join(__dirname, "assets", "_icon-preview.html");
const SIZE = 1024;
const ICO_SIZES = [256, 128, 64, 48, 32, 16];

// Monta um .ico (ICONDIR + ICONDIRENTRY[] + PNGs). width/height byte = 0 → 256.
function buildIco(imgs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(imgs.length, 4);
  const entries = Buffer.alloc(16 * imgs.length);
  let offset = 6 + 16 * imgs.length;
  imgs.forEach((m, i) => {
    const e = i * 16;
    entries.writeUInt8(m.size >= 256 ? 0 : m.size, e + 0);
    entries.writeUInt8(m.size >= 256 ? 0 : m.size, e + 1);
    entries.writeUInt8(0, e + 2); // colorCount
    entries.writeUInt8(0, e + 3); // reserved
    entries.writeUInt16LE(1, e + 4); // planes
    entries.writeUInt16LE(32, e + 6); // bitCount
    entries.writeUInt32LE(m.buf.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += m.buf.length;
  });
  return Buffer.concat([header, entries, ...imgs.map((m) => m.buf)]);
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(SVG_SRC, "utf8");
  const html =
    "<!doctype html><html><head><meta charset='utf-8'><style>" +
    "html,body{margin:0;padding:0;background:transparent;overflow:hidden}" +
    "svg{display:block;width:1024px;height:1024px}</style></head><body>" +
    svg +
    "</body></html>";
  fs.writeFileSync(TMP_HTML, html);

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    paintWhenInitiallyHidden: true,
    webPreferences: {},
  });

  win.webContents.once("did-finish-load", async () => {
    await new Promise((r) => setTimeout(r, 1200));
    try {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(OUT_PNG, img.toPNG());
      const imgs = ICO_SIZES.map((s) => ({
        size: s,
        buf: img.resize({ width: s, height: s, quality: "best" }).toPNG(),
      }));
      fs.writeFileSync(OUT_ICO, buildIco(imgs));
      // eslint-disable-next-line no-console
      console.log(
        "OK png:",
        JSON.stringify(img.getSize()),
        "| ico:",
        OUT_ICO,
        fs.statSync(OUT_ICO).size,
        "bytes",
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("FALHA:", e);
    } finally {
      try {
        fs.unlinkSync(TMP_HTML);
      } catch {}
      app.quit();
    }
  });

  await win.loadFile(TMP_HTML);
});
