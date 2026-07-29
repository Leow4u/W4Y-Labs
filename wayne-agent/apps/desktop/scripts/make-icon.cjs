/**
 * make-icon.cjs — build desktop packaging icons from the official Work4You
 * crystalline green mark (transparent PNG source):
 *   - assets/icon.png       (1024, electron-builder / Linux / mac source)
 *   - assets/icon.ico       (multi-size PNG-in-ICO for rcedit + NSIS)
 *   - public/apple-touch-icon.png (180, renderer favicon + BrowserWindow)
 *
 * Source PNG: apps/desktop/assets/work4you-favicon-source.png
 * (canonical mark also lives at platform/web/public/brand/work4you-favicon-transparent-1024.png)
 *
 * Run:  npm run make-icon
 */
const { app, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const DESKTOP_ROOT = path.resolve(__dirname, '..')
const PNG_SRC = path.join(DESKTOP_ROOT, 'assets', 'work4you-favicon-source.png')
const OUT_PNG = path.join(DESKTOP_ROOT, 'assets', 'icon.png')
const OUT_ICO = path.join(DESKTOP_ROOT, 'assets', 'icon.ico')
const OUT_TOUCH = path.join(DESKTOP_ROOT, 'public', 'apple-touch-icon.png')
const SIZE = 1024
const TOUCH_SIZE = 180
const ICO_SIZES = [256, 128, 64, 48, 32, 16]

function buildIco(imgs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(imgs.length, 4)
  const entries = Buffer.alloc(16 * imgs.length)
  let offset = 6 + 16 * imgs.length
  imgs.forEach((m, i) => {
    const e = i * 16
    entries.writeUInt8(m.size >= 256 ? 0 : m.size, e + 0)
    entries.writeUInt8(m.size >= 256 ? 0 : m.size, e + 1)
    entries.writeUInt8(0, e + 2)
    entries.writeUInt8(0, e + 3)
    entries.writeUInt16LE(1, e + 4)
    entries.writeUInt16LE(32, e + 6)
    entries.writeUInt32LE(m.buf.length, e + 8)
    entries.writeUInt32LE(offset, e + 12)
    offset += m.buf.length
  })
  return Buffer.concat([header, entries, ...imgs.map(m => m.buf)])
}

function resizePng(src, size) {
  return src.resize({ width: size, height: size, quality: 'best' }).toPNG()
}

app.whenReady().then(() => {
  if (!fs.existsSync(PNG_SRC)) {
    console.error(`[make-icon] source PNG not found: ${PNG_SRC}`)
    app.exit(1)
    return
  }

  const src = nativeImage.createFromPath(PNG_SRC)
  if (src.isEmpty()) {
    console.error(`[make-icon] failed to load source PNG: ${PNG_SRC}`)
    app.exit(1)
    return
  }

  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true })
  fs.mkdirSync(path.dirname(OUT_TOUCH), { recursive: true })

  try {
    const icon1024 = resizePng(src, SIZE)
    fs.writeFileSync(OUT_PNG, icon1024)
    fs.writeFileSync(OUT_TOUCH, resizePng(src, TOUCH_SIZE))

    const imgs = ICO_SIZES.map(s => ({
      size: s,
      buf: resizePng(src, s)
    }))
    fs.writeFileSync(OUT_ICO, buildIco(imgs))

    console.log('[make-icon] wrote', OUT_PNG, OUT_ICO, OUT_TOUCH)
  } catch (err) {
    console.error('[make-icon] failed:', err)
    app.exitCode = 1
  } finally {
    app.quit()
  }
})
