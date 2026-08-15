'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  bundledPythonExe,
  readRuntimeReady,
  repairReadyRuntime,
  mergeEngineTree,
} = require('./w4y-wayne-resolve.cjs')

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `w4y-${name}-`))
}

test('readRuntimeReady returns null when the marker is missing', () => {
  const root = tmpDir('ready-missing')
  assert.strictEqual(readRuntimeReady(root), null)
})

test('readRuntimeReady parses a valid marker', () => {
  const root = tmpDir('ready-ok')
  fs.writeFileSync(
    path.join(root, 'runtime-ready.json'),
    JSON.stringify({ schema: 1, platform: 'win32', arch: 'x64', extra: 'all' })
  )
  const marker = readRuntimeReady(root)
  assert.strictEqual(marker.schema, 1)
  assert.strictEqual(marker.extra, 'all')
})

test('repairReadyRuntime rewrites pyvenv.cfg home to bundled CPython', () => {
  const root = tmpDir('repair')
  const pythonHome = path.join(root, 'runtime', 'python')
  fs.mkdirSync(pythonHome, { recursive: true })
  fs.writeFileSync(path.join(pythonHome, 'python.exe'), '')
  const venv = path.join(root, '.venv', 'Scripts')
  fs.mkdirSync(venv, { recursive: true })
  fs.writeFileSync(path.join(venv, 'python.exe'), '')
  const cfg = path.join(root, '.venv', 'pyvenv.cfg')
  fs.writeFileSync(cfg, 'home = C:\\builder\\uv\\python\nversion_info = 3.11\n')

  assert.strictEqual(repairReadyRuntime(root), true)
  const next = fs.readFileSync(cfg, 'utf8')
  assert.match(next, new RegExp(`home = ${pythonHome.replace(/\\/g, '\\\\')}`))
  assert.match(next, /version_info = 3.11/)
})

test('mergeEngineTree replaces .venv when the incoming ZIP is ready', () => {
  const src = tmpDir('merge-src')
  const dest = tmpDir('merge-dest')
  fs.writeFileSync(path.join(src, 'runtime-ready.json'), '{"schema":1,"platform":"win32"}')
  fs.mkdirSync(path.join(src, 'work4you_cli'), { recursive: true })
  fs.writeFileSync(path.join(src, 'work4you_cli', 'main.py'), '')
  fs.mkdirSync(path.join(src, '.venv', 'Scripts'), { recursive: true })
  fs.writeFileSync(path.join(src, '.venv', 'Scripts', 'python.exe'), 'new')
  fs.mkdirSync(path.join(dest, '.venv', 'Scripts'), { recursive: true })
  fs.writeFileSync(path.join(dest, '.venv', 'Scripts', 'python.exe'), 'old')

  mergeEngineTree(src, dest)
  assert.strictEqual(
    fs.readFileSync(path.join(dest, '.venv', 'Scripts', 'python.exe'), 'utf8'),
    'new'
  )
})

// A standalone CPython does not have the same shape on every OS. Probing only
// the Windows one is what made a macOS runtime impossible to recognise: the
// tree was present and correct, the check said "not ready", and every Mac fell
// through to a ~30 minute uv sync. These run on any host — the platform is an
// explicit argument precisely so the other OS's layout stays covered.
test('bundledPythonExe finds the Windows layout (runtime/python/python.exe)', () => {
  const root = tmpDir('py-win')
  const home = path.join(root, 'runtime', 'python')
  fs.mkdirSync(home, { recursive: true })
  fs.writeFileSync(path.join(home, 'python.exe'), '')

  assert.strictEqual(bundledPythonExe(root, 'win32'), path.join(home, 'python.exe'))
  // The POSIX probe must NOT accept a Windows tree.
  assert.strictEqual(bundledPythonExe(root, 'darwin'), null)
})

test('bundledPythonExe finds the POSIX layout (runtime/python/bin/python3.11)', () => {
  const root = tmpDir('py-posix')
  const bin = path.join(root, 'runtime', 'python', 'bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'python3.11'), '')

  assert.strictEqual(bundledPythonExe(root, 'darwin'), path.join(bin, 'python3.11'))
  assert.strictEqual(bundledPythonExe(root, 'linux'), path.join(bin, 'python3.11'))
  // The Windows probe must NOT accept a POSIX tree.
  assert.strictEqual(bundledPythonExe(root, 'win32'), null)
})

test('bundledPythonExe accepts python3/python when python3.11 is absent', () => {
  const root = tmpDir('py-posix-alt')
  const bin = path.join(root, 'runtime', 'python', 'bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'python3'), '')

  assert.strictEqual(bundledPythonExe(root, 'darwin'), path.join(bin, 'python3'))
})

test('bundledPythonExe returns null when no runtime is bundled', () => {
  const root = tmpDir('py-none')
  assert.strictEqual(bundledPythonExe(root, 'win32'), null)
  assert.strictEqual(bundledPythonExe(root, 'darwin'), null)
})

test('mergeEngineTree keeps the local venv for source-only ZIPs', () => {
  const src = tmpDir('merge-src-only')
  const dest = tmpDir('merge-dest-only')
  fs.mkdirSync(path.join(src, 'work4you_cli'), { recursive: true })
  fs.writeFileSync(path.join(src, 'work4you_cli', 'main.py'), '')
  fs.mkdirSync(path.join(src, '.venv', 'Scripts'), { recursive: true })
  fs.writeFileSync(path.join(src, '.venv', 'Scripts', 'python.exe'), 'incoming')
  fs.mkdirSync(path.join(dest, '.venv', 'Scripts'), { recursive: true })
  fs.writeFileSync(path.join(dest, '.venv', 'Scripts', 'python.exe'), 'keep')

  mergeEngineTree(src, dest)
  assert.strictEqual(
    fs.readFileSync(path.join(dest, '.venv', 'Scripts', 'python.exe'), 'utf8'),
    'keep'
  )
})
