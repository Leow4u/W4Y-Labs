"use strict"

/**
 * Run concurrently from the monorepo root install.
 * Avoids `npm exec` failing on Windows when the workspace bin link is missing
 * or the package install is incomplete.
 */
const fs = require("fs")
const path = require("path")
const { spawn } = require("child_process")

const desktopRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(desktopRoot, "..", "..")
const pkgJson = path.join(repoRoot, "node_modules", "concurrently", "package.json")

if (!fs.existsSync(pkgJson)) {
  console.error(`Missing concurrently. Run from repo root:\n  cd "${repoRoot}" && npm install`)
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"))
const binRel =
  typeof pkg.bin === "string"
    ? pkg.bin
    : pkg.bin && typeof pkg.bin === "object"
      ? pkg.bin.concurrently || Object.values(pkg.bin)[0]
      : null

if (!binRel) {
  console.error("concurrently package has no bin entry — reinstall: npm install")
  process.exit(1)
}

const bin = path.resolve(path.dirname(pkgJson), binRel)
if (!fs.existsSync(bin)) {
  console.error(`concurrently bin missing at ${bin}\nReinstall: cd "${repoRoot}" && npm install`)
  process.exit(1)
}

const args = process.argv.slice(2)
const child = spawn(process.execPath, [bin, ...args], {
  cwd: desktopRoot,
  env: process.env,
  stdio: "inherit",
  windowsHide: true
})

child.on("exit", code => process.exit(code == null ? 1 : code))
child.on("error", err => {
  console.error(err)
  process.exit(1)
})
