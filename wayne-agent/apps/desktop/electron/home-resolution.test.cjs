"use strict";
/**
 * The desktop must resolve the data home exactly like the engine does.
 *
 * Field incident 03/08/2026: the engine migrates ~/.wayne -> ~/.work4you the
 * first time it runs without an explicit home (running the CLI in a terminal
 * is enough). The desktop pinned the legacy path, so it then handed the engine
 * an empty home and the user landed in provider onboarding with their profiles
 * and API keys apparently gone.
 */
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { resolveWayneHome } = require("./w4y-home.cjs");

const WIN = process.platform === "win32";

function withEnv(overrides, fn) {
  const saved = { ...process.env };
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return fn();
  } finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

function tmpBase() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "w4y-home-"));
}

/** Point the platform default at a scratch dir for both OS branches. */
function scratchEnv(base) {
  return WIN ? { LOCALAPPDATA: base } : { HOME: base };
}

function roots(base) {
  return WIN
    ? { neu: path.join(base, "work4you"), old: path.join(base, "wayne") }
    : { neu: path.join(base, ".work4you"), old: path.join(base, ".wayne") };
}

test("WAYNE_HOME wins — spawner-injected profile scoping must not be overridden", () => {
  const base = tmpBase();
  const pinned = path.join(base, "pinned");
  fs.mkdirSync(pinned, { recursive: true });
  withEnv({ ...scratchEnv(base), WAYNE_HOME: pinned, WORK4YOU_HOME: undefined }, () => {
    assert.strictEqual(resolveWayneHome(), path.resolve(pinned));
  });
});

test("WORK4YOU_HOME is honoured when WAYNE_HOME is unset", () => {
  const base = tmpBase();
  const pinned = path.join(base, "pinned");
  withEnv({ ...scratchEnv(base), WAYNE_HOME: undefined, WORK4YOU_HOME: pinned }, () => {
    assert.strictEqual(resolveWayneHome(), path.resolve(pinned));
  });
});

test("after the engine migrates, the desktop follows to the new root", () => {
  const base = tmpBase();
  const { neu } = roots(base);
  fs.mkdirSync(neu, { recursive: true });
  withEnv({ ...scratchEnv(base), WAYNE_HOME: undefined, WORK4YOU_HOME: undefined }, () => {
    assert.strictEqual(resolveWayneHome(), neu);
  });
});

test("an un-migrated legacy home is still used — nobody is stranded", () => {
  const base = tmpBase();
  const { old } = roots(base);
  fs.mkdirSync(old, { recursive: true });
  withEnv({ ...scratchEnv(base), WAYNE_HOME: undefined, WORK4YOU_HOME: undefined }, () => {
    assert.strictEqual(resolveWayneHome(), old);
  });
});

test("when both exist the migrated root wins", () => {
  const base = tmpBase();
  const { neu, old } = roots(base);
  fs.mkdirSync(neu, { recursive: true });
  fs.mkdirSync(old, { recursive: true });
  withEnv({ ...scratchEnv(base), WAYNE_HOME: undefined, WORK4YOU_HOME: undefined }, () => {
    assert.strictEqual(resolveWayneHome(), neu);
  });
});

test("a fresh machine gets the new name", () => {
  const base = tmpBase();
  const { neu } = roots(base);
  withEnv({ ...scratchEnv(base), WAYNE_HOME: undefined, WORK4YOU_HOME: undefined }, () => {
    assert.strictEqual(resolveWayneHome(), neu);
  });
});

test("login and composio share the one resolver — they cannot disagree", () => {
  const login = require("./w4y-login.cjs");
  assert.strictEqual(login.resolveWayneHome, resolveWayneHome);
});
