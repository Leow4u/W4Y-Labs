#!/usr/bin/env node
/** Fail CI if upstream legal / MIT product license files reappear. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const FORBIDDEN_PATHS = [
  'wayne-agent/LICENSE-UPSTREAM',
  'wayne-agent/CREDITS.md',
  'wayne-agent/FORK-NOTES.md'
]

const FORBIDDEN_IN_LICENSE = [
  /MIT License/i,
  /Nous Research/i,
  /hermes-agent/i
]

let failed = false

for (const rel of FORBIDDEN_PATHS) {
  const full = path.join(ROOT, rel)
  if (fs.existsSync(full)) {
    console.error(`FORBIDDEN FILE: ${rel}`)
    failed = true
  }
}

const licensePath = path.join(ROOT, 'wayne-agent/LICENSE')
if (fs.existsSync(licensePath)) {
  const text = fs.readFileSync(licensePath, 'utf8')
  for (const re of FORBIDDEN_IN_LICENSE) {
    if (re.test(text)) {
      console.error(`wayne-agent/LICENSE contains forbidden pattern: ${re}`)
      failed = true
    }
  }
}

if (failed) process.exit(1)
console.log('Upstream legal check passed.')
