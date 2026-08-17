'use strict'

/**
 * Terminal `work4you` must import work4you_cli from any cwd.
 *
 * Run with: node --test electron/cli-shim.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  ensureCliShims,
  isWayneSourceRoot
} = require('./w4y-wayne-resolve.cjs')

function makeFakeEngine(root) {
  fs.mkdirSync(path.join(root, 'work4you_cli'), { recursive: true })
  fs.writeFileSync(path.join(root, 'work4you_cli', 'main.py'), 'def main():\n    pass\n')
  const scripts =
    process.platform === 'win32'
      ? path.join(root, '.venv', 'Scripts')
      : path.join(root, '.venv', 'bin')
  fs.mkdirSync(scripts, { recursive: true })
  const py = process.platform === 'win32' ? 'python.exe' : 'python'
  fs.writeFileSync(path.join(scripts, py), '')
  // Broken console-script that used to be what the shim pointed at.
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(scripts, 'work4you.exe'), '')
  }
  assert.equal(isWayneSourceRoot(root), true)
  return { scripts, py: path.join(scripts, py) }
}

test('ensureCliShims writes a PYTHONPATH launcher, not Scripts/work4you.exe', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w4y-cli-shim-'))
  try {
    const engine = path.join(tmp, 'wayne-agent')
    const home = path.join(tmp, 'work4you')
    fs.mkdirSync(home, { recursive: true })
    const { py } = makeFakeEngine(engine)

    ensureCliShims(engine, home)

    if (process.platform === 'win32') {
      const cmd = fs.readFileSync(path.join(home, 'bin', 'work4you.cmd'), 'utf8')
      assert.match(cmd, /PYTHONPATH=/)
      assert.match(cmd, /-m work4you_cli\.main/)
      assert.ok(cmd.includes(path.resolve(engine)))
      assert.ok(cmd.includes(path.resolve(py)))
      assert.doesNotMatch(cmd, /work4you\.exe/)
    } else {
      const sh = fs.readFileSync(path.join(home, 'bin', 'work4you'), 'utf8')
      assert.match(sh, /PYTHONPATH=/)
      assert.match(sh, /-m work4you_cli\.main/)
      assert.ok(sh.includes(path.resolve(engine)))
      assert.ok(sh.includes(path.resolve(py)))
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('ensureCliShims source no longer prefers Scripts on PATH over bin', () => {
  const source = fs
    .readFileSync(path.join(__dirname, 'w4y-wayne-resolve.cjs'), 'utf8')
    .replace(/\r\n/g, '\n')
  const start = source.indexOf('function ensureCliShims')
  const body = source.slice(start, source.indexOf('\nfunction runUvSync', start))
  assert.match(body, /PYTHONPATH/)
  assert.match(body, /-m work4you_cli\.main/)
  // Must not unshift Scripts onto PATH ahead of bin (that shadowed the shim).
  assert.doesNotMatch(body, /if \(!hasScripts\) nextParts\.unshift\(scriptsDir\)/)
})
