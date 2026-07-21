/**
 * The guard that stops a shell shipping without a module it requires.
 *
 * `single-flight.cjs` was added to main.cjs and never added to build.files;
 * the packaged app would have died on its first require. Nothing in the
 * pipeline noticed, because nothing inspected packaging.
 */
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const check = require("../../../apps/desktop-shell/package-manifest-check.cjs");

const { localRequires, isCovered, findUnpackagedLocalModules, stripNonCode, checkPackageManifest } = check;

describe("localRequires", () => {
  it("finds both quote styles", () => {
    // The first hand-audit only matched double quotes and silently missed
    // hardening.cjs, which three modules require with single quotes.
    const src = `
      const a = require("./double.cjs");
      const b = require('./single.cjs');
      const c = require( "./spaced.cjs" );
    `;
    expect(localRequires(src).sort()).toEqual(["double.cjs", "single.cjs", "spaced.cjs"]);
  });

  it("ignores requires written inside comments", () => {
    const src = `
      // require("./line-comment.cjs")
      /* require("./block-comment.cjs") */
      /**
       * require("./doc-comment.cjs")
       */
      const real = require("./real.cjs");
    `;
    expect(localRequires(src)).toEqual(["real.cjs"]);
  });

  it("ignores bare-module and parent-path requires", () => {
    const src = `
      require("electron");
      require("node:fs");
      require("../outside.cjs");
      require("./inside.cjs");
    `;
    expect(localRequires(src)).toEqual(["inside.cjs"]);
  });

  it("does not confuse an apostrophe in a comment for a string", () => {
    const src = `
      // the shell's own modules
      const x = require('./after-apostrophe.cjs');
    `;
    expect(localRequires(src)).toEqual(["after-apostrophe.cjs"]);
  });
});

describe("stripNonCode", () => {
  it("preserves offsets so line numbers stay usable", () => {
    const src = 'const a = 1; // note\nconst b = 2;';
    const out = stripNonCode(src);
    expect(out.length).toBe(src.length);
    expect(out.split("\n").length).toBe(2);
  });
});

describe("isCovered", () => {
  it("matches an exact filename", () => {
    expect(isCovered("main.cjs", ["main.cjs"])).toBe(true);
    expect(isCovered("main.cjs", ["preload.cjs"])).toBe(false);
  });

  it("matches a directory glob", () => {
    expect(isCovered("assets/icon.png", ["assets/**"])).toBe(true);
    expect(isCovered("assets/deep/x.png", ["assets/**/*"])).toBe(true);
    expect(isCovered("other/icon.png", ["assets/**"])).toBe(false);
  });

  it("treats an unrecognised pattern as NOT covering — no false confidence", () => {
    expect(isCovered("single-flight.cjs", ["*.cjs"])).toBe(false);
  });
});

describe("findUnpackagedLocalModules", () => {
  it("reports the module that is required but unlisted", () => {
    const missing = findUnpackagedLocalModules({
      sources: {
        "main.cjs": 'require("./single-flight.cjs"); require("./engine-slots.cjs");',
        "other.cjs": 'require("./single-flight.cjs");',
      },
      files: ["main.cjs", "engine-slots.cjs"],
    });
    expect(missing).toEqual([
      { specifier: "single-flight.cjs", requiredBy: ["main.cjs", "other.cjs"] },
    ]);
  });

  it("is silent when the allowlist is complete", () => {
    expect(
      findUnpackagedLocalModules({
        sources: { "main.cjs": 'require("./a.cjs");' },
        files: ["main.cjs", "a.cjs"],
      }),
    ).toEqual([]);
  });
});

describe("the real shell manifest", () => {
  it("lists every local module main.cjs and friends require", () => {
    // Runs against the ACTUAL apps/desktop-shell directory, so adding a module
    // and forgetting build.files fails here rather than in a user's installer.
    expect(checkPackageManifest()).toEqual([]);
  });
});
