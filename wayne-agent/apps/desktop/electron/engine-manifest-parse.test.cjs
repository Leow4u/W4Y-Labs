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

const { parseManifestJson } = require('./w4y-wayne-resolve.cjs')

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
