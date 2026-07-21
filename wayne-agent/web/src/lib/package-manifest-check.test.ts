/**
 * The guard that stops a shell shipping without a module it requires.
 *
 * `single-flight.cjs` was added to main.cjs and never added to build.files;
 * the packaged app would have died on its first require. Nothing in the
 * pipeline noticed, because nothing inspected packaging.
 */
import { describe, expect, it, vi } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const check = require("../../../apps/desktop-shell/package-manifest-check.cjs");

const {
  localRequires,
  isCovered,
  findUnpackagedLocalModules,
  auditLocalModules,
  resolvesInsideShell,
  stripNonCode,
  checkPackageManifest,
} = check;

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

/**
 * Round 3: being LISTED was never proof of anything.
 *
 * electron-builder packs nothing for an allowlist entry with no file behind it,
 * so a typo, a rename or a deleted module produced exactly the failure this
 * guard exists to prevent — a green check and an app that dies on the first
 * require. Each specifier must now clear three bars: listed, present, and
 * inside the folder that actually gets packed.
 */
describe("resolvesInsideShell", () => {
  it("accepts ordinary local modules and subfolders", () => {
    expect(resolvesInsideShell("single-flight.cjs")).toBe(true);
    expect(resolvesInsideShell("assets/icon.png")).toBe(true);
    expect(resolvesInsideShell("./nested/./deep.cjs")).toBe(true);
  });

  it("rejects anything that climbs above the shell root", () => {
    // require("./../../x.cjs") is still a "./" require, and no build.files
    // entry can make it ship — it lives outside what electron-builder packs.
    expect(resolvesInsideShell("../outside.cjs")).toBe(false);
    expect(resolvesInsideShell("nested/../../outside.cjs")).toBe(false);
  });

  it("allows climbing back down as long as it never escapes", () => {
    expect(resolvesInsideShell("nested/../sibling.cjs")).toBe(true);
  });

  it("rejects absolute paths and drive letters", () => {
    expect(resolvesInsideShell("/etc/passwd")).toBe(false);
    expect(resolvesInsideShell("C:/Windows/x.cjs")).toBe(false);
  });
});

describe("auditLocalModules — listed, present, contained", () => {
  const sources = { "main.cjs": 'require("./a.cjs"); require(\'./b.cjs\');' };

  it("is silent when a module is listed AND exists", () => {
    expect(
      auditLocalModules({
        sources: { "main.cjs": 'require("./a.cjs");' },
        files: ["main.cjs", "a.cjs"],
        exists: () => true,
      }),
    ).toEqual([]);
  });

  it("catches LISTED BUT MISSING — the hole the old checker had", () => {
    // build.files says a.cjs; nobody ever checked a file was there.
    const found = auditLocalModules({
      sources: { "main.cjs": 'require("./a.cjs");' },
      files: ["main.cjs", "a.cjs"],
      exists: () => false,
    });
    expect(found).toEqual([
      { specifier: "a.cjs", requiredBy: ["main.cjs"], problems: ["missing"] },
    ]);
  });

  it("still catches EXISTS BUT UNLISTED — the original single-flight bug", () => {
    const found = auditLocalModules({
      sources: { "main.cjs": 'require("./single-flight.cjs");' },
      files: ["main.cjs"],
      exists: () => true,
    });
    expect(found).toEqual([
      { specifier: "single-flight.cjs", requiredBy: ["main.cjs"], problems: ["unlisted"] },
    ]);
  });

  it("reports BOTH problems when a module is neither listed nor present", () => {
    const found = auditLocalModules({
      sources: { "main.cjs": 'require("./ghost.cjs");' },
      files: ["main.cjs"],
      exists: () => false,
    });
    expect(found[0].problems).toEqual(["unlisted", "missing"]);
  });

  it("condemns an escaping path even when it is listed and exists", () => {
    const found = auditLocalModules({
      sources: { "main.cjs": 'require("./../outside.cjs");' },
      files: ["main.cjs", "../outside.cjs"],
      exists: () => true,
    });
    expect(found[0].problems).toContain("escapes");
  });

  it("does not touch the filesystem for an escaping path", () => {
    const exists = vi.fn().mockReturnValue(true);
    auditLocalModules({
      sources: { "main.cjs": 'require("./../outside.cjs");' },
      files: [],
      exists,
    });
    expect(exists).not.toHaveBeenCalled();
  });

  it("keeps handling BOTH quote styles", () => {
    const found = auditLocalModules({ sources, files: [], exists: () => true });
    expect(found.map((f: { specifier: string }) => f.specifier)).toEqual(["a.cjs", "b.cjs"]);
  });

  it("keeps ignoring requires written in comments", () => {
    const found = auditLocalModules({
      sources: { "main.cjs": '// require("./ghost.cjs")\n/* require(\'./ghost2.cjs\') */\nconst x = 1;' },
      files: [],
      exists: () => false,
    });
    expect(found).toEqual([]);
  });

  it("names every file that requires the offender, sorted", () => {
    const found = auditLocalModules({
      sources: {
        "z.cjs": 'require("./x.cjs");',
        "a.cjs": 'require("./x.cjs");',
      },
      files: [],
      exists: () => true,
    });
    expect(found[0].requiredBy).toEqual(["a.cjs", "z.cjs"]);
  });
});

describe("the real shell manifest, fully audited", () => {
  it("every required local module is listed, present and inside the shell", () => {
    // Runs against the ACTUAL apps/desktop-shell directory with the REAL
    // filesystem: a module added without build.files, or listed with no file
    // behind it, fails here rather than in a user's installer.
    expect(checkPackageManifest()).toEqual([]);
  });
});
