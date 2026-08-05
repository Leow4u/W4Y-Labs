#!/usr/bin/env node
/**
 * Fail CI when legacy runtime brands leak into user-visible copy.
 * Scans i18n strings and public web pages only — not internal code paths.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const SCAN_ROOTS = [
  path.join(REPO_ROOT, 'wayne-agent/apps/work4you/src/i18n'),
  path.join(REPO_ROOT, 'platform/web/src/app/(public)'),
  path.join(REPO_ROOT, 'platform/web/src/app/planos')
]

const SCAN_FILES = [
  path.join(REPO_ROOT, 'wayne-agent/apps/work4you/index.html'),
  path.join(REPO_ROOT, 'platform/web/src/app/onboarding/OnboardingClient.tsx')
]

const EXT = new Set(['.ts', '.tsx', '.html'])

const FORBIDDEN = [
  /Wayne Agent/i,
  /Motor Wayne/i,
  /You are Wayne\b/i,
  /Hermes Agent/i,
  /\bthe Hermes assistant\b/i
]

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) {
    return out
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (EXT.has(path.extname(entry.name))) {
      out.push(full)
    }
  }

  return out
}

function stripComments(line) {
  return line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
}

function checkFile(file) {
  const rel = path.relative(REPO_ROOT, file)
  const violations = []

  for (const [index, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
    const code = stripComments(line)
    if (!code.trim()) {
      continue
    }

    for (const pattern of FORBIDDEN) {
      if (pattern.test(code)) {
        violations.push({ file: rel, line: index + 1, text: line.trim() })
        break
      }
    }
  }

  return violations
}

const files = [...SCAN_FILES.filter(f => fs.existsSync(f))]
for (const root of SCAN_ROOTS) {
  files.push(...walk(root))
}

const all = files.flatMap(checkFile)

if (all.length > 0) {
  console.error('User-facing brand check failed — legacy names must not appear in product copy:\n')
  for (const v of all) {
    console.error(`  ${v.file}:${v.line}: ${v.text}`)
  }
  console.error('\nUse Work4You in user-visible strings. See docs/LINGUAGEM.md.')
  process.exit(1)
}

console.log(`User-facing brand check passed (${files.length} files).`)
