/**
 * The engine manifest must survive a BOM.
 *
 * latest.json is written by hand at publish time, and PowerShell's Set-Content
 * / Out-File emit a UTF-8 BOM by default. JSON.parse throws on U+FEFF, so the
 * 20260728b manifest — valid JSON to any human reading it — made every engine
 * update check fail with a parse error. These pin the tolerance so a manifest
 * published the same way again cannot silently break updates.
 */
const test = require('node:test')
const assert = require('node:assert')

const {
  parseManifestJson,
  enginePlatformKey,
  engineManifestUrls,
  manifestMatchesHost,
} = require('./w4y-wayne-resolve.cjs')

const BODY = '{"version":"20260729","zipUrl":"https://example.test/e.zip","builtAt":"2026-07-29T15:44:02Z"}'

test('parses a manifest written with a UTF-8 BOM', () => {
  const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(BODY, 'utf8')])
  const j = parseManifestJson(withBom)
  assert.strictEqual(j.version, '20260729')
  assert.strictEqual(j.zipUrl, 'https://example.test/e.zip')
})

test('parses a clean manifest unchanged', () => {
  const j = parseManifestJson(Buffer.from(BODY, 'utf8'))
  assert.strictEqual(j.version, '20260729')
})

test('still rejects a genuinely malformed manifest', () => {
  assert.throws(() => parseManifestJson(Buffer.from('{"version":', 'utf8')))
})

test('strips only the BOM, not a leading character that merely looks odd', () => {
  // A BOM in the MIDDLE is not a BOM — it must stay and fail the parse, so a
  // corrupted body is never quietly reinterpreted as valid.
  assert.throws(() => parseManifestJson(Buffer.from('{\ufeff"version":1', 'utf8')))
})

// ---------------------------------------------------------------------------
// Per-platform feeds.
//
// The engine ships native binaries, so a manifest is only usable by the
// platform it was built for. The legacy global latest.json publishes win32-x64;
// serving it to macOS made every Mac download ~107MB of Windows binaries, fail
// the runtime check, and fall through to a ~30 minute uv sync. Rejecting a
// foreign manifest is deliberate: no update beats an unrunnable one.
// ---------------------------------------------------------------------------

test('the platform key pairs platform with arch', () => {
  assert.strictEqual(enginePlatformKey(), `${process.platform}-${process.arch}`)
})

test('the platform-specific feed is tried before the legacy one', () => {
  const urls = engineManifestUrls()
  assert.strictEqual(urls.length, 2)
  assert.ok(
    urls[0].endsWith(`latest-${process.platform}-${process.arch}.json`),
    `expected a platform-specific feed first, got ${urls[0]}`
  )
  assert.ok(urls[1].endsWith('/latest.json'), `expected the legacy feed last, got ${urls[1]}`)
})

test('a manifest for this host is accepted', () => {
  assert.strictEqual(manifestMatchesHost({ platform: enginePlatformKey() }), true)
})

test('a manifest for another platform is rejected', () => {
  const foreign = process.platform === 'win32' ? 'darwin-arm64' : 'win32-x64'
  assert.strictEqual(manifestMatchesHost({ platform: foreign }), false)
})

test('a manifest with no platform field is accepted (predates per-platform feeds)', () => {
  assert.strictEqual(manifestMatchesHost({ zipUrl: 'https://example.test/e.zip' }), true)
})
