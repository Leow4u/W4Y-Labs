'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const home = require('./w4y-home.cjs')

function withTempLocalAppData(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w4y-home-'))
  const prevLocal = process.env.LOCALAPPDATA
  const prevWayne = process.env.WAYNE_HOME
  const prevW4y = process.env.WORK4YOU_HOME
  process.env.LOCALAPPDATA = root
  delete process.env.WAYNE_HOME
  delete process.env.WORK4YOU_HOME
  try {
    return fn(root)
  } finally {
    if (prevLocal === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = prevLocal
    if (prevWayne === undefined) delete process.env.WAYNE_HOME
    else process.env.WAYNE_HOME = prevWayne
    if (prevW4y === undefined) delete process.env.WORK4YOU_HOME
    else process.env.WORK4YOU_HOME = prevW4y
    try {
      fs.rmSync(root, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

test('resolveWayneHome defaults to platform root before login', () => {
  withTempLocalAppData(() => {
    const platform = home.resolvePlatformRoot()
    assert.ok(platform.endsWith(path.sep + 'work4you'))
    assert.strictEqual(home.resolveWayneHome(), platform)
  })
})

test('activateAccount isolates state.db under accounts/<tenantId>', () => {
  withTempLocalAppData(() => {
    const a = home.activateAccount({ tenantId: 'tenant_a', email: 'a@example.com' })
    assert.ok(a.switched)
    assert.ok(a.home.includes(path.sep + 'accounts' + path.sep + 'tenant_a'))
    fs.writeFileSync(path.join(a.home, 'state.db'), 'A')

    const b = home.activateAccount({ tenantId: 'tenant_b', email: 'b@example.com' })
    assert.ok(b.switched)
    assert.ok(b.home.includes(path.sep + 'accounts' + path.sep + 'tenant_b'))
    fs.writeFileSync(path.join(b.home, 'state.db'), 'B')

    assert.notStrictEqual(a.home, b.home)
    assert.strictEqual(fs.readFileSync(path.join(a.home, 'state.db'), 'utf8'), 'A')
    assert.strictEqual(fs.readFileSync(path.join(b.home, 'state.db'), 'utf8'), 'B')
    assert.strictEqual(home.resolveWayneHome(), b.home)
  })
})

test('clearActiveAccount drops the pin so chats do not follow the next user by default', () => {
  withTempLocalAppData(() => {
    const a = home.activateAccount({ tenantId: 'tenant_a', email: 'a@example.com' })
    fs.writeFileSync(path.join(a.home, 'state.db'), 'A')
    home.clearActiveAccount()
    assert.strictEqual(home.readActiveAccount(), null)
    assert.strictEqual(home.resolveWayneHome(), home.resolvePlatformRoot())
    assert.ok(fs.existsSync(path.join(a.home, 'state.db')))
  })
})

test('shared engine root stays outside account homes', () => {
  withTempLocalAppData(() => {
    home.activateAccount({ tenantId: 'tenant_a', email: 'a@example.com' })
    const engine = home.resolveSharedEngineRoot()
    assert.ok(engine.endsWith(path.sep + 'wayne-agent'))
    assert.ok(!engine.includes(path.sep + 'accounts' + path.sep))
  })
})

test('engine-version marker belongs on platform root even when an account is active', () => {
  withTempLocalAppData(() => {
    const platform = home.resolvePlatformRoot()
    fs.mkdirSync(path.join(platform, 'wayne-agent', 'work4you_cli'), { recursive: true })
    fs.writeFileSync(path.join(platform, 'wayne-agent', 'work4you_cli', 'main.py'), '# stub\n')
    fs.writeFileSync(
      path.join(platform, 'engine-version.json'),
      JSON.stringify({ version: '20260802b', builtAt: '2026-08-02T00:00:00Z' }),
      'utf8'
    )
    home.activateAccount({ tenantId: 'tenant_rafael', email: 'rafael@example.com' })
    assert.ok(home.resolveWayneHome().includes(path.sep + 'accounts' + path.sep))
    assert.ok(fs.existsSync(path.join(platform, 'engine-version.json')))
    assert.ok(!fs.existsSync(path.join(home.resolveWayneHome(), 'engine-version.json')))
    assert.strictEqual(
      home.resolveSharedEngineRoot(platform),
      path.join(platform, 'wayne-agent')
    )
  })
})

test('legacy platform-root state.db migrates into the first account', () => {
  withTempLocalAppData(() => {
    const platform = home.resolvePlatformRoot()
    fs.mkdirSync(platform, { recursive: true })
    fs.writeFileSync(path.join(platform, 'state.db'), 'LEGACY')
    const a = home.activateAccount({ tenantId: 'tenant_a', email: 'a@example.com' })
    assert.strictEqual(fs.readFileSync(path.join(a.home, 'state.db'), 'utf8'), 'LEGACY')
    assert.ok(!fs.existsSync(path.join(platform, 'state.db')))
  })
})