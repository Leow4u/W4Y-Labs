"use strict"

const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..", "..", "..")

const required = ["vite", "concurrently", "electron"]
for (const pkg of required) {
  try {
    fs.accessSync(path.join(root, "node_modules", pkg, "package.json"))
  } catch {
    console.error(`Missing ${pkg}. Run from repo root: cd ${root} && npm install`)
    process.exit(1)
  }
}
