"use strict";

/**
 * Regression tests for the 17/08/2026 field incident.
 *
 * The engine update replaces the tree the app was running from. The merge used
 * to delete each entry in place, so the first file Windows refused to delete —
 * a stray backend still held `.venv\Scripts\python.exe` — left the install
 * shredded: most of the venv gone, no interpreter, an app that could not boot
 * and could not update itself out of it.
 *
 * The merge now claims every entry by renaming it aside before it copies
 * anything. A rename fails exactly where a delete would, but it fails while the
 * install is still whole, and what was claimed goes back.
 *
 * Run with: node --test electron/engine-merge-atomic.test.cjs
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { mergeEngineTree } = require("./w4y-wayne-resolve.cjs");

function tree(root, spec) {
  fs.mkdirSync(root, { recursive: true });
  for (const [rel, body] of Object.entries(spec)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fixture(tag) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `w4y-merge-${tag}-`));
  const src = tree(path.join(base, "src"), {
    "pyproject.toml": "novo",
    "work4you_cli/main.py": "novo main",
    "lib/thing.py": "nova lib",
  });
  const dest = tree(path.join(base, "dest"), {
    "pyproject.toml": "velho",
    "work4you_cli/main.py": "velho main",
    "lib/thing.py": "velha lib",
    "lib/only-in-old.py": "sobra",
  });
  return { base, src, dest };
}

test("a clean merge replaces the tree and leaves nothing set aside", () => {
  const { src, dest } = fixture("clean");

  mergeEngineTree(src, dest);

  assert.equal(read(dest, "pyproject.toml"), "novo");
  assert.equal(read(dest, "work4you_cli/main.py"), "novo main");
  assert.equal(read(dest, "lib/thing.py"), "nova lib");
  assert.equal(
    fs.existsSync(path.join(dest, "lib", "only-in-old.py")),
    false,
    "a replaced directory must not keep files the new engine dropped"
  );
  assert.deepEqual(
    fs.readdirSync(dest).filter((n) => n.includes(".w4y-old-")),
    [],
    "nothing should be left set aside after a clean merge"
  );
});

test("an entry the OS will not let go aborts the merge with the install intact", () => {
  const { src, dest } = fixture("locked");
  const realRename = fs.renameSync;

  // Stand in for the Windows refusal: `work4you_cli` cannot be moved. The
  // rollback renames (which move an aside copy back) must still work, or the
  // test would be proving nothing about recovery.
  fs.renameSync = (from, to) => {
    if (String(to).includes(".w4y-old-") && String(from).endsWith("work4you_cli")) {
      const err = new Error("EPERM: operation not permitted");
      err.code = "EPERM";
      throw err;
    }
    return realRename(from, to);
  };

  try {
    assert.throws(
      () => mergeEngineTree(src, dest),
      /ainda está a usar o motor/,
      "the merge must refuse rather than press on"
    );
  } finally {
    fs.renameSync = realRename;
  }

  assert.equal(read(dest, "pyproject.toml"), "velho", "claimed entries go back");
  assert.equal(read(dest, "work4you_cli/main.py"), "velho main");
  assert.equal(read(dest, "lib/thing.py"), "velha lib");
  assert.equal(read(dest, "lib/only-in-old.py"), "sobra");
  assert.deepEqual(
    fs.readdirSync(dest).filter((n) => n.includes(".w4y-old-")),
    [],
    "a failed merge must not leave the install renamed out from under the app"
  );
});

test("a tree an earlier merge could not delete is swept on the next one", () => {
  const { src, dest } = fixture("sweep");
  const leftover = path.join(dest, `lib.w4y-old-${Date.now() - 1000}`);
  tree(leftover, { "stale.py": "lixo" });

  mergeEngineTree(src, dest);

  assert.equal(
    fs.existsSync(leftover),
    false,
    "leftovers from a previous update must not accumulate a copy per update"
  );
});
