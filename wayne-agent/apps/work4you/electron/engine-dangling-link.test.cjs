"use strict";
/**
 * Regression test for the 02/08/2026 field incident.
 *
 * The engine directory is swapped via a junction. When an update repointed it
 * and the staged target was then removed, the link survived pointing at
 * nothing — and `fs.mkdirSync(dir, {recursive:true})` on a dangling junction
 * fails with ENOENT, forever. The app could not start and could not repair
 * itself, because repairing means creating that exact directory.
 */
const assert = require("node:assert");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { clearDanglingLink } = require("./w4y-wayne-resolve.cjs");

const WIN = process.platform === "win32";

function makeDanglingLink(base) {
  const target = path.join(base, "target-that-disappears");
  const link = path.join(base, "engine");
  fs.mkdirSync(target, { recursive: true });
  if (WIN) {
    cp.execSync(`cmd /c mklink /J "${link}" "${target}"`, { stdio: "ignore" });
  } else {
    fs.symlinkSync(target, link, "dir");
  }
  fs.rmSync(target, { recursive: true, force: true });
  return link;
}

test("mkdir on a dangling engine link fails — this is the bug", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "w4y-dangling-"));
  const link = makeDanglingLink(base);
  assert.throws(
    () => fs.mkdirSync(link, { recursive: true }),
    (err) => err.code === "ENOENT",
    "expected mkdir to fail with ENOENT on a dangling link",
  );
});

test("clearDanglingLink removes it so the engine dir can be recreated", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "w4y-dangling-"));
  const link = makeDanglingLink(base);

  clearDanglingLink(link);

  fs.mkdirSync(link, { recursive: true });
  fs.writeFileSync(path.join(link, "main.py"), "x");
  assert.ok(fs.existsSync(path.join(link, "main.py")));
});

test("a healthy engine directory is left untouched", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "w4y-dangling-"));
  const real = path.join(base, "engine");
  fs.mkdirSync(real, { recursive: true });
  fs.writeFileSync(path.join(real, "keep.txt"), "precious");

  clearDanglingLink(real);

  assert.ok(fs.existsSync(path.join(real, "keep.txt")), "must not delete data");
});

test("a link that still resolves is left untouched", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "w4y-dangling-"));
  const target = path.join(base, "live-target");
  const link = path.join(base, "engine");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "keep.txt"), "precious");
  if (WIN) {
    cp.execSync(`cmd /c mklink /J "${link}" "${target}"`, { stdio: "ignore" });
  } else {
    fs.symlinkSync(target, link, "dir");
  }

  clearDanglingLink(link);

  assert.ok(fs.existsSync(path.join(link, "keep.txt")), "must not break a live link");
});

test("a missing path is a no-op", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "w4y-dangling-"));
  clearDanglingLink(path.join(base, "nothing-here"));
});
