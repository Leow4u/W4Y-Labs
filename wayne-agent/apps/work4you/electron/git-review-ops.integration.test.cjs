'use strict'

// Real on-disk proof that reviewList / reviewDiff / repoStatus see dirty trees.
// Run: node --test electron/git-review-ops.integration.test.cjs

const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { repoStatus, reviewDiff, reviewList } = require('./git-review-ops.cjs')

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'pipe', windowsHide: true })
}

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w4y-git-review-'))
  git(root, ['init'])
  git(root, ['config', 'user.email', 'test@work4you.local'])
  git(root, ['config', 'user.name', 'Work4You Test'])
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'hello\n', 'utf8')
  git(root, ['add', 'tracked.txt'])
  git(root, ['commit', '-m', 'init'])
  return root
}

test('reviewList + repoStatus + reviewDiff see modified and untracked files', async t => {
  const root = mkRepo()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  fs.writeFileSync(path.join(root, 'tracked.txt'), 'hello\nworld\n', 'utf8')
  fs.writeFileSync(path.join(root, 'new-file.ts'), 'export const x = 1\n', 'utf8')

  const list = await reviewList(root, 'uncommitted', null)
  assert.equal(list.isRepo, true, 'expected isRepo true')
  assert.ok(list.files.length >= 2, `expected ≥2 changed files, got ${JSON.stringify(list.files)}`)

  const paths = list.files.map(f => f.path.replace(/\\/g, '/'))
  assert.ok(paths.includes('tracked.txt'), `missing tracked.txt in ${paths}`)
  assert.ok(paths.includes('new-file.ts'), `missing new-file.ts in ${paths}`)

  const tracked = list.files.find(f => f.path.replace(/\\/g, '/') === 'tracked.txt')
  assert.ok(tracked.added + tracked.removed > 0, 'tracked.txt should have a line delta')

  const untracked = list.files.find(f => f.path.replace(/\\/g, '/') === 'new-file.ts')
  assert.equal(untracked.status, '?')
  assert.ok(untracked.added > 0, 'untracked file should count insertions')

  const diff = await reviewDiff(root, 'tracked.txt', 'uncommitted', null, false)
  assert.ok(String(diff).includes('+world') || String(diff).includes('world'), `diff empty/unexpected: ${diff}`)

  const status = await repoStatus(root)
  assert.ok(status, 'repoStatus should not be null for a real repo')
  assert.ok(status.changed >= 2, `status.changed=${status.changed}`)
  assert.ok(status.untracked >= 1, `status.untracked=${status.untracked}`)
  assert.ok(status.added + status.removed + status.untracked > 0, 'dirty counts must be non-zero')
})

test('reviewList reports isRepo:false (not a false clean tree) off a non-repo folder', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w4y-not-git-'))
  t.after(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true })
    } catch {
      // Windows can EPERM on freshly-touched temp dirs; the assertion already ran.
    }
  })
  fs.writeFileSync(path.join(root, 'orphan.txt'), 'x\n', 'utf8')

  const list = await reviewList(root, 'uncommitted', null)
  assert.equal(list.isRepo, false)
  assert.deepEqual(list.files, [])
})

test('empty / missing cwd does not pretend to be a clean repo', async () => {
  const empty = await reviewList('', 'uncommitted', null)
  assert.equal(empty.isRepo, false)
  assert.deepEqual(empty.files, [])

  const missing = path.join(os.tmpdir(), 'w4y-missing-repo-' + Date.now())
  const bogus = await reviewList(missing, 'uncommitted', null)
  assert.equal(bogus.isRepo, false)
  assert.deepEqual(bogus.files, [])
})
