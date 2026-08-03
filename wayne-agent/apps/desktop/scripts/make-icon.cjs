/**
 * make-icon.cjs — build desktop packaging icons from the official Work4You
 * crystalline green mark (transparent PNG source):
 *   - assets/icon.png       (1024, electron-builder / Linux / mac source)
 *   - assets/icon.ico       (multi-size PNG-in-ICO for rcedit + NSIS + taskbar)
 *   - public/apple-touch-icon.png (180, in-app favicon only — NOT the taskbar)
 *
 * Windows 11 paints a white squircle behind small transparent window icons.
 * Pack icons (ico/png) use an opaque dark canvas + large mark; touch icon stays
 * transparent for the renderer.
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
const PACK_FILL_RATIO = 0.9
const TOUCH_FILL_RATIO = 0.92
const WIN_ICON_BG = [20, 20, 20, 255]
const ALPHA_TRIM_THRESHOLD = 12
const BACKGROUND_LUMINANCE_MAX = 24

function isContentPixel(red, green, blue, alpha) {
  if (alpha <= ALPHA_TRIM_THRESHOLD) {
    return false
  }

  if (red <= BACKGROUND_LUMINANCE_MAX && green <= BACKGROUND_LUMINANCE_MAX && blue <= BACKGROUND_LUMINANCE_MAX) {
    return false
  }

  return true
}

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

function trimToContent(img) {
  const { width, height } = img.getSize()
  const bitmap = img.toBitmap()
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const red = bitmap[index]
      const green = bitmap[index + 1]
      const blue = bitmap[index + 2]
      const alpha = bitmap[index + 3]

      if (!isContentPixel(red, green, blue, alpha)) {
        continue
      }

      if (x < minX) {
        minX = x
      }

      if (x > maxX) {
        maxX = x
      }

      if (y < minY) {
        minY = y
      }

      if (y > maxY) {
        maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return img
  }

  return img.crop({
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY
  })
}

function flattenOntoBackground(canvas, size, bg) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const alpha = canvas[index + 3] / 255

      if (alpha <= 0) {
        canvas[index] = bg[0]
        canvas[index + 1] = bg[1]
        canvas[index + 2] = bg[2]
        canvas[index + 3] = 255
        continue
      }

      if (alpha < 1) {
        canvas[index] = Math.round(canvas[index] * alpha + bg[0] * (1 - alpha))
        canvas[index + 1] = Math.round(canvas[index + 1] * alpha + bg[1] * (1 - alpha))
        canvas[index + 2] = Math.round(canvas[index + 2] * alpha + bg[2] * (1 - alpha))
        canvas[index + 3] = 255
      }
    }
  }
}

function fitToSquareCanvas(img, size, fillRatio, { opaqueBackground = false } = {}) {
  const trimmed = trimToContent(img)
  const { height: contentHeight, width: contentWidth } = trimmed.getSize()
  const target = Math.max(1, Math.round(size * fillRatio))
  const scale = target / Math.max(contentWidth, contentHeight)
  const scaledWidth = Math.max(1, Math.round(contentWidth * scale))
  const scaledHeight = Math.max(1, Math.round(contentHeight * scale))
  const scaled = trimmed.resize({ height: scaledHeight, quality: 'best', width: scaledWidth })
  const scaledBitmap = scaled.toBitmap()
  const canvas = Buffer.alloc(size * size * 4, 0)
  const offsetX = Math.floor((size - scaledWidth) / 2)
  const offsetY = Math.floor((size - scaledHeight) / 2)

  for (let y = 0; y < scaledHeight; y += 1) {
    for (let x = 0; x < scaledWidth; x += 1) {
      const destX = offsetX + x
      const destY = offsetY + y

      if (destX < 0 || destY < 0 || destX >= size || destY >= size) {
        continue
      }

      const sourceIndex = (y * scaledWidth + x) * 4
      const destIndex = (destY * size + destX) * 4
      scaledBitmap.copy(canvas, destIndex, sourceIndex, sourceIndex + 4)
    }
  }

  if (opaqueBackground) {
    flattenOntoBackground(canvas, size, WIN_ICON_BG)
  }

  return nativeImage.createFromBuffer(canvas, { height: size, scaleFactor: 1, width: size })
}

function renderPackIcon(img, size) {
  return fitToSquareCanvas(img, size, PACK_FILL_RATIO, { opaqueBackground: true }).toPNG()
}

function renderTouchIcon(img, size) {
  return fitToSquareCanvas(img, size, TOUCH_FILL_RATIO, { opaqueBackground: false }).toPNG()
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
    fs.writeFileSync(OUT_PNG, renderPackIcon(src, SIZE))
    fs.writeFileSync(OUT_TOUCH, renderTouchIcon(src, TOUCH_SIZE))

    const imgs = ICO_SIZES.map(s => ({
      buf: renderPackIcon(src, s),
      size: s
    }))
    fs.writeFileSync(OUT_ICO, buildIco(imgs))

    console.log(`[make-icon] wrote ${OUT_PNG} ${OUT_ICO} ${OUT_TOUCH}`)
  } catch (err) {
    console.error('[make-icon] failed:', err)
    app.exitCode = 1
  } finally {
    app.quit()
  }
})
