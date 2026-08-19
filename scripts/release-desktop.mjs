#!/usr/bin/env node
/**
 * Bump desktop version, optional Fly pins, commit, tag, push.
 * Tag desktop/vX.Y.Z triggers .github/workflows/release-desktop.yml
 *
 * Usage (from repo root):
 *   node scripts/release-desktop.mjs              # patch bump → tag → CI publish
 *   node scripts/release-desktop.mjs --dry-run
 *   node scripts/release-desktop.mjs --version 1.0.132
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const versionArg = args.find((a, i) => args[i - 1] === '--version')

function run(cmd, cmdArgs, opts = {}) {
  const pretty = `${cmd} ${cmdArgs.join(' ')}`
  if (dryRun) {
    console.log(`[dry-run] ${pretty}`)
    return ''
  }
  return execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', ...opts }).trim()
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
}

function writeJson(rel, data) {
  fs.writeFileSync(path.join(ROOT, rel), `${JSON.stringify(data, null, 2)}\n`)
}

function bumpPatch(version) {
  const parts = version.split('.').map(Number)
  parts[2] += 1
  return parts.join('.')
}

const pkgPath = 'wayne-agent/apps/work4you/package.json'
const pkg = readJson(pkgPath)
const current = pkg.version
const next = versionArg || bumpPatch(current)

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  throw new Error(`Invalid semver: ${next}`)
}

if (dryRun) {
  console.log(`[dry-run] Would release ${current} → ${next}`)
  console.log(`[dry-run] Tag: desktop/v${next}`)
  console.log('https://github.com/Leow4u/W4Y-Labs/actions/workflows/release-desktop.yml')
  process.exit(0)
}

pkg.version = next
writeJson(pkgPath, pkg)

const productDownload = path.join(ROOT, 'platform/web/src/lib/product-download.ts')
let productText = fs.readFileSync(productDownload, 'utf8')
productText = productText.replace(
  /export const WINDOWS_DESKTOP_VERSION: string = "[^"]+"/,
  `export const WINDOWS_DESKTOP_VERSION: string = "${next}"`
)
fs.writeFileSync(productDownload, productText)

const message = `chore(release): desktop ${next}`

console.log(`Release ${current} → ${next}`)

run('git', ['add', pkgPath, productDownload])

run('git', ['commit', '-m', message])
const tag = `desktop/v${next}`
run('git', ['tag', tag])
run('git', ['push', 'origin', 'main'])
run('git', ['push', 'origin', tag])

const repo = run('git', ['remote', 'get-url', 'origin']).replace(/\.git$/, '').replace('git@github.com:', 'https://github.com/')
console.log('')
console.log('Publicação disparada. Acompanhar:')
console.log(`${repo}/actions/workflows/release-desktop.yml`)
console.log('')
console.log('Quando terminar, validar na máquina QA com o chip de update.')
