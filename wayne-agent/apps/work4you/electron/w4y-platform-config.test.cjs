'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { ensurePlatformModelConfig, OPENROUTER, RELAY_FREE_PRIMARY } = require('./w4y-platform-config.cjs')

test('ensurePlatformModelConfig seeds openrouter + Relay on empty home', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'w4y-cfg-'))
  try {
    const res = ensurePlatformModelConfig(home, 'free')
    assert.strictEqual(res.ok, true)
    assert.strictEqual(res.wrote, true)
    const raw = fs.readFileSync(path.join(home, 'config.yaml'), 'utf8')
    assert.match(raw, /provider:\s*openrouter/)
    assert.match(raw, new RegExp(RELAY_FREE_PRIMARY.replace('.', '\\.')))
    assert.strictEqual(OPENROUTER, 'openrouter')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('ensurePlatformModelConfig rewrites empty provider', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'w4y-cfg-'))
  try {
    fs.writeFileSync(
      path.join(home, 'config.yaml'),
      'model:\n  default: qwen/qwen3.7-flash\n  provider: ""\nmcp_servers:\n  composio:\n    enabled: true\n',
      'utf8',
    )
    const res = ensurePlatformModelConfig(home, 'free')
    assert.strictEqual(res.ok, true)
    const raw = fs.readFileSync(path.join(home, 'config.yaml'), 'utf8')
    assert.match(raw, /provider:\s*openrouter/)
    assert.doesNotMatch(raw, /provider:\s*""/)
    assert.match(raw, /mcp_servers:/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})
