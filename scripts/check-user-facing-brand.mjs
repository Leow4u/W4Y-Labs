#!/usr/bin/env node
/**
 * Fail CI when legacy runtime brands leak into user-visible copy.
 * Scans i18n, public web, TUI user strings, and selected desktop surfaces.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const SCAN_ROOTS = [
  path.join(REPO_ROOT, 'wayne-agent/apps/work4you/src/i18n'),
  path.join(REPO_ROOT, 'platform/web/src/app/(public)'),
  path.join(REPO_ROOT, 'platform/web/src/app/planos'),
  path.join(REPO_ROOT, 'wayne-agent/ui-tui/src/components'),
  path.join(REPO_ROOT, 'wayne-agent/ui-tui/src/app/slash/commands')
]

const SCAN_FILES = [
  path.join(REPO_ROOT, 'wayne-agent/optional-skills/autonomous-ai-agents/wayne-agent/SKILL.md'),
  path.join(REPO_ROOT, 'wayne-agent/apps/work4you/index.html'),
  path.join(REPO_ROOT, 'platform/web/src/app/onboarding/OnboardingClient.tsx'),
  path.join(REPO_ROOT, 'wayne-agent/apps/work4you/src/app/skills/index.tsx'),
  path.join(REPO_ROOT, 'wayne-agent/apps/work4you/src/components/onboarding/index.tsx'),
  path.join(REPO_ROOT, 'wayne-agent/apps/work4you/src/app/pet-generate/components/generate-unavailable.tsx'),
  path.join(REPO_ROOT, 'wayne-agent/apps/work4you/src/app/settings/constants.ts'),
  path.join(REPO_ROOT, 'wayne-agent/work4you_cli/status.py')
]

const EXT = new Set(['.ts', '.tsx', '.html'])

const FORBIDDEN = [
  /Wayne Agent/i,
  /Motor Wayne\b/i,
  /You are Wayne\b/i,
  /Hermes Agent/i,
  /\bthe Hermes assistant\b/i,
  /Nous Research/i,
  /Nous Portal/i,
  /hermes-agent\.nousresearch\.com/i,
  /portal\.nousresearch\.com/i,
  /NousResearch\/hermes-agent/i
]

/** i18n key names may retain legacy tokens; values must not. */
function extractStringLiterals(line) {
  const literals = []
  const re = /'([^'\\]|\\.)*'|"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/g
  let m
  while ((m = re.exec(line)) !== null) {
    literals.push(m[0].slice(1, -1))
  }
  return literals
}

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
  const isI18n = rel.includes(`${path.sep}i18n${path.sep}`)

  for (const [index, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
    const code = stripComments(line)
    if (!code.trim()) {
      continue
    }

    const haystacks = isI18n ? extractStringLiterals(code) : [code]
    if (haystacks.length === 0) {
      haystacks.push(code)
    }

    for (const haystack of haystacks) {
      for (const pattern of FORBIDDEN) {
        if (pattern.test(haystack)) {
          violations.push({ file: rel, line: index + 1, text: line.trim() })
          break
        }
      }
      if (violations.at(-1)?.line === index + 1) {
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
