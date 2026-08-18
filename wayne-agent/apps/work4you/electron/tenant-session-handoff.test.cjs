'use strict'

/**
 * Signing in has to leave the tenant knowing who we are.
 *
 * Two credentials come out of one login: the platform session that mints the
 * model key, and the tenant session that answers for identity, plan, cloud
 * projects and connectors. Only the second one is hard to get right, and on
 * 17/08/2026 three separate things conspired to lose it — the user signed in,
 * the app restarted, and came back with a name of "Conta", "Sem sessão" in
 * settings, and connectors failing 503.
 *
 * Source-level assertions: w4y-login.cjs and main.cjs both require electron at
 * load, so neither can be pulled into a unit test. What they lock is ordering
 * and the shape of the checks, which is exactly what went wrong.
 *
 * Run with: node --test electron/tenant-session-handoff.test.cjs
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (name) =>
  fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/\r\n/g, '\n')

function loginFlowBody() {
  const source = read('w4y-login.cjs')
  const start = source.indexOf('async function runLoginFlow(')
  assert.notEqual(start, -1, 'missing runLoginFlow')
  const end = source.indexOf('\nfunction cancelLoginFlow(', start)
  assert.notEqual(end, -1, 'runLoginFlow no longer ends where expected')
  return source.slice(start, end)
}

test('connectors are fetched after the handoff that authorises fetching them', () => {
  const body = loginFlowBody()

  const handoff = body.indexOf('bootstrapAppSession(')
  const connectors = body.indexOf('bootstrapLocalConnectors(')

  assert.notEqual(handoff, -1, 'missing the tenant handoff')
  assert.notEqual(connectors, -1, 'missing the connector bootstrap')

  // The Composio key comes from a tenant route gated by the cookies the
  // handoff obtains. Asking first is a guaranteed 401, and it swallows the
  // failure, so a first login could never provision connectors at all.
  assert.ok(
    handoff < connectors,
    'the connector bootstrap must run after bootstrapAppSession, not before it'
  )
})

test('the cookie jar reaches disk before the login relaunches the app', () => {
  const body = loginFlowBody()

  const flush = body.indexOf('flushSessionCookies(')
  const relaunch = body.indexOf('onAccountSwitched(')

  assert.notEqual(flush, -1, 'the login must flush cookies before handing off to the relaunch')
  assert.ok(flush < relaunch, 'flushing after the relaunch call is too late — it never returns')
})

test('the handoff believes the tenant, not the redirect it followed', () => {
  const source = read('w4y-login.cjs')
  const start = source.indexOf('async function bootstrapAppSession(')
  assert.notEqual(start, -1, 'missing bootstrapAppSession')
  const body = source.slice(start, source.indexOf('\n}', start))

  // With no platform session, /login/enter bounces to /login and returns 200.
  // Reporting that as success is how a failed handoff stayed invisible.
  assert.match(
    body,
    /path: "\/api\/auth\/me"/,
    'the handoff must confirm identity against the tenant'
  )
  assert.match(
    body,
    /if \(who\.ok\) return \{ ok: true/,
    'success must be decided by the tenant answering, not by a status below 400'
  )
  assert.doesNotMatch(
    body,
    /return \{ ok: enter\.ok/,
    'the redirect chain completing says nothing about the session'
  )
})

test('a tenant that is still waking gets another chance; one that says 401 does not', () => {
  const source = read('w4y-login.cjs')
  const start = source.indexOf('async function bootstrapAppSession(')
  const body = source.slice(start, source.indexOf('\n}', start))

  // The tenant machine suspends when idle. It can still be refusing traffic
  // for a few seconds after the wake, and one attempt would discard the login.
  assert.match(body, /for \(let attempt = 0; attempt < \d+; attempt\+\+\)/, 'must retry the handoff')
  assert.match(
    body,
    /if \(who\.status === 401\) break/,
    '401 is a reachable tenant refusing us — retrying cannot help'
  )
})

test('boot repairs an app whose tenant session died, instead of running signed out', () => {
  const source = read('w4y-login.cjs')
  const start = source.indexOf('async function ensurePlatformCredentials(')
  const end = source.indexOf('\nasync function healTenantSession(', start)
  assert.notEqual(end, -1, 'missing healTenantSession')
  const body = source.slice(start, end)

  assert.match(
    body,
    /hasKey \? await healTenantSession\(\)/,
    'an account with a key but no tenant session is the broken state to repair'
  )

  const heal = source.slice(source.indexOf('async function healTenantSession('))
  assert.match(heal, /path: "\/api\/auth\/me"/, 'repair starts by asking whether anything is wrong')
  assert.match(heal, /if \(who\.ok\) return/, 'a healthy session must cost nothing beyond that one call')
  assert.match(
    heal,
    /bootstrapLocalConnectors\(\)/,
    'a restored session must also pick up the connector key it never got'
  )
})

test('the account relaunch flushes cookies before the hard exit', () => {
  const source = read('main.cjs')
  const start = source.indexOf('const relaunchForAccountHome')
  assert.notEqual(start, -1, 'missing relaunchForAccountHome')
  const body = source.slice(start, source.indexOf('app.exit(0)', start) + 20)

  // app.exit() runs no teardown, so Chromium never writes out the cookies it
  // batches. Logout needs this as much as login: cleared cookies that never
  // reach disk come back on the next start.
  assert.match(body, /cookies\.flushStore\(\)/, 'the jar must be written before exiting')

  const flush = body.indexOf('flushStore()')
  assert.ok(flush < body.indexOf('app.exit(0)'), 'flushing after the exit call never runs')
})

test('the login tells its caller whether the tenant session was actually established', () => {
  const body = loginFlowBody()

  assert.match(
    body,
    /tenantSession: Boolean\(appSession\.ok\)/,
    'a login that half-worked must not report itself as a plain success'
  )
})

test('same-home login asks for a soft motor restart, not a full app relaunch', () => {
  const body = loginFlowBody()

  // Until 17/08 every key mint passed switched:true (or equivalent) and the
  // shell always app.exit(0). Cursor and Claude never do that.
  assert.match(body, /const homeSwitched = Boolean\(accountSwitch\?\.switched\)/)
  assert.match(body, /softRestart: needsMotorRestart && !homeSwitched/)
  assert.match(
    body,
    /switched: false/,
    'the fallback when activateAccount did not run must not force a hard relaunch'
  )
})

test('the account handler soft-restarts the motor when the home path did not change', () => {
  const source = read('main.cjs')
  const start = source.indexOf('const relaunchForAccountHome')
  assert.notEqual(start, -1, 'missing relaunchForAccountHome')
  const body = source.slice(start, source.indexOf('if (IS_MAC)', start))

  assert.match(body, /const homeSwitched = Boolean\(info && info\.switched\)/)
  assert.match(body, /if \(!homeSwitched\)/)
  assert.match(body, /await ensureBackend\(null\)/, 'soft path must respawn the primary motor')
  assert.match(
    body,
    /onLoggedOut: \(\) => relaunchForAccountHome\(\{ switched: true \}\)/,
    'logout always clears the pin — never soft'
  )

  // Hard exit only on the switched branch.
  const soft = body.indexOf('if (!homeSwitched)')
  const hardExit = body.indexOf('app.exit(0)')
  assert.ok(soft !== -1 && hardExit > soft, 'app.exit must sit after the soft-restart early return')

  // Soft path must quiet the renderer before killing the motor — otherwise
  // onBackendExit paints "Backend stopped" on every successful same-home login.
  const suppress = body.indexOf('hermes:gateway-offline-suppress')
  const softTeardown = body.indexOf('await teardownPrimaryBackendAndWait()', soft)
  assert.ok(suppress !== -1 && suppress < softTeardown, 'suppress toast before soft teardown')
  assert.match(body, /w4y:account-home-soft-restarted/, 'renderer must learn the soft restart finished')
})

test('soft motor restart does not toast Backend stopped', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const boot = fs
    .readFileSync(
      path.join(__dirname, '..', 'src', 'app', 'gateway', 'hooks', 'use-gateway-boot.ts'),
      'utf8'
    )
    .replace(/\r\n/g, '\n')

  assert.match(
    boot,
    /shouldSuppressGatewayOfflineToast\(\)/,
    'backend-exit must honour the same suppress window as gateway-offline'
  )
  assert.match(
    boot,
    /mode === 'cloud-body'/,
    'packaged cloud-body must not toast Backend stopped — there is no local Python'
  )
})
