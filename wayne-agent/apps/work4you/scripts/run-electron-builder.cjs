"use strict"

// Resolve electronDist at runtime (#38673, #47917): electron-builder 26.8.x can
// re-unpack a broken Electron.app; reusing the installed dist dodges that.
// npm workspace hoisting is non-deterministic — require.resolve finds electron
// wherever it landed. Dist present → -c.electronDist=<abs>/dist; absent → let
// electron-builder fetch via @electron/get (electronVersion + ELECTRON_MIRROR).

const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

function electronDistDir() {
  try {
    return path.join(path.dirname(require.resolve("electron/package.json")), "dist")
  } catch {
    return null
  }
}

function distBinary(dist) {
  if (process.platform === "darwin") {
    return path.join(dist, "Electron.app", "Contents", "MacOS", "Electron")
  }
  if (process.platform === "win32") {
    return path.join(dist, "electron.exe")
  }
  return path.join(dist, "electron")
}

function electronBuilderCli() {
  const pkgJson = require.resolve("electron-builder/package.json")
  const bin = require(pkgJson).bin
  const rel = typeof bin === "string" ? bin : bin["electron-builder"]
  return path.join(path.dirname(pkgJson), rel)
}

const dist = electronDistDir()
const args = []
if (dist && fs.existsSync(distBinary(dist))) {
  args.push(`-c.electronDist=${dist}`)
} else {
  console.warn(
    "[run-electron-builder] no local electron dist; electron-builder will fetch " +
      "via @electron/get (electronVersion + ELECTRON_MIRROR)."
  )
}
args.push(...process.argv.slice(2))

const result = spawnSync(process.execPath, [electronBuilderCli(), ...args], {
  stdio: "inherit",
})

if (result.error) {
  console.error(`[run-electron-builder] spawn failed: ${result.error.message}`)
  process.exit(1)
}

const exitCode = result.status == null ? 1 : result.status
if (exitCode !== 0) {
  process.exit(exitCode)
}

if (process.platform === "win32") {
  const { stampExeIdentity } = require("./set-exe-identity.cjs")
  const desktopRoot = path.resolve(__dirname, "..")
  const exe = path.join(desktopRoot, "release", "win-unpacked", "Work4You.exe")
  if (fs.existsSync(exe)) {
    stampExeIdentity(exe, desktopRoot)
      .then(() => {
        console.log(`[run-electron-builder] stamped ${exe}`)
        process.exit(0)
      })
      .catch(err => {
        console.error(`[run-electron-builder] icon stamp failed: ${err.message}`)
        process.exit(1)
      })
    return
  }
}

process.exit(0)
