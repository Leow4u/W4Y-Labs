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

  it("ignores bare modules but SEES parent-path requires", () => {
    // This test used to assert that `../outside.cjs` was correctly ignored.
    // It was not correct: electron-builder packs only this folder, so a
    // parent-path require can never be in the asar no matter what build.files
    // says — the app dies on `Cannot find module` under a green check. The
    // test was locking in the exact hole the guard exists to close.
    const src = `
      require("electron");
      require("node:fs");
      require("../outside.cjs");
      require("./inside.cjs");
    `;
    expect(localRequires(src).sort()).toEqual(["../outside.cjs", "inside.cjs"]);
  });

  it("sees a backtick require — the third quote style", () => {
    // The header bragged that quote styles matter while listing two of three.
    expect(localRequires("require(`./single-flight.cjs`);")).toEqual([
      "single-flight.cjs",
    ]);
  });

  it("still blanks a template that actually interpolates", () => {
    const src = "const u = `${base}/require(\"./ghost.cjs\")`; require(\"./real.cjs\");";
    expect(localRequires(src)).toEqual(["real.cjs"]);
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

/**
 * Round 3, second pass: what the independent review proved the scanner could
 * not see, and what made it cry wolf. Every case below was a repro before it
 * was a test.
 */
describe("stripNonCode — regex literals are code, not strings", () => {
  it("does not let a quote inside a regex swallow the rest of the line", () => {
    // `.replace(/'/g, "")` opened a FAKE string; because string contents are
    // emitted verbatim by design, the trailing comment leaked into the scanner
    // and a phantom module failed pack/dist:* with an unactionable finding.
    const src = `const q = s.replace(/'/g, ""); // require("./ghost.cjs")`;
    expect(localRequires(src)).toEqual([]);
  });

  it("handles a double quote inside a regex too", () => {
    const src = `const q = s.split(/"/); // require("./ghost2.cjs")`;
    expect(localRequires(src)).toEqual([]);
  });

  it("does not mistake DIVISION for a regex and eat real code", () => {
    const src = `const r = a / b; require("./real.cjs");`;
    expect(localRequires(src)).toEqual(["real.cjs"]);
  });

  it("handles a slash inside a character class", () => {
    const src = `const r = /[/'"]/g; require("./real.cjs");`;
    expect(localRequires(src)).toEqual(["real.cjs"]);
  });

  it("never makes the output longer than the input", () => {
    // An unterminated block comment used to gain two characters, breaking the
    // offset promise the doc comment makes.
    for (const src of ["/*abc", "/* a */ b", "const x = /re/g;", "`t`"]) {
      expect(stripNonCode(src).length).toBe(src.length);
    }
  });
});

describe("auditLocalModules — a parent-path require can never ship", () => {
  it("condemns it even when build.files lists it verbatim", () => {
    const found = auditLocalModules({
      sources: { "main.cjs": 'require("../../shared/log.cjs");' },
      files: ["main.cjs", "../../shared/log.cjs"],
      exists: () => true,
    });
    expect(found[0].problems).toContain("escapes");
  });
});

/**
 * Release gate: the keyword branch of `regexCanStart` was DEAD.
 *
 * A stray BACKSPACE byte (0x08) had landed where the `\b` escape belonged, so
 * `/\x08(return|typeof|...)$/` could never match. Every regex written after a
 * keyword was therefore read as a string, and the rest of that line — comments
 * included — leaked into the scanner. `return /'/; // require("./ghost.cjs")`
 * reported a module that does not exist, which fails `check:manifest` and with
 * it pack, dist:win, dist:mac and dist:linux.
 *
 * The escape is gone entirely now: the tail word is extracted and looked up in
 * a Set, which also removes a second latent bug — without a real boundary,
 * `(in|of)$` matches the end of `join` and `typeof`.
 */
describe("regexCanStart — regex after a keyword", () => {
  const KEYWORD_CASES: [string, string][] = [
    ["return", `return /'/; // require("./ghost.cjs")`],
    ["await", `await /'/ ; // require("./g2.cjs")`],
    ["yield", `yield /'/ ; // require("./g3.cjs")`],
    ["typeof", `typeof /'/ ; // require("./g4.cjs")`],
    ["case", `case /'/ : break; // require("./g5.cjs")`],
    ["new", `new RegExp(); x = /'/; // require("./g6.cjs")`],
    ["else", `else /'/ ; // require("./g7.cjs")`],
  ];

  it.each(KEYWORD_CASES)("no phantom module after `%s`", (_kw, src) => {
    expect(localRequires(src)).toEqual([]);
  });

  it("no phantom module after an assignment or an open paren", () => {
    expect(localRequires(`const x = /'/; // require("./g8.cjs")`)).toEqual([]);
    expect(localRequires(`f( /'/ ); // require("./g9.cjs")`)).toEqual([]);
  });

  it("still reads DIVISION as division, including right after a keyword", () => {
    expect(localRequires(`const r = a / b; require("./real.cjs");`)).toEqual(["real.cjs"]);
    expect(localRequires(`return a / b; require("./real.cjs");`)).toEqual(["real.cjs"]);
  });

  it("does not treat a word ENDING in a keyword as that keyword", () => {
    // `(in|of)$` with no boundary matches the tail of `join`. The division here
    // must stay division, so the require after it is still found.
    expect(localRequires(`const j = x.join / 2; require("./real.cjs");`)).toEqual([
      "real.cjs",
    ]);
  });

  it("the source file itself contains no stray control bytes", () => {
    // The defect was invisible in an editor and in the Read tool; only `cat -A`
    // showed it. Pin it so it cannot come back unnoticed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");
    const src: string = fs.readFileSync(
      path.join(__dirname, "../../../apps/desktop-shell/package-manifest-check.cjs"),
      "utf8",
    );
    // eslint-disable-next-line no-control-regex
    expect(src.match(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g)).toBeNull();
  });
});

describe("regexCanStart — `throw` was still missing", () => {
  it("no phantom module after `throw`", () => {
    // `throw /re/` is valid JavaScript. It was not in the keyword set, so the
    // regex read as a string and leaked the rest of the line — comment
    // included — into the scanner, exactly like the 0x08 defect did.
    expect(localRequires(`throw /'/; // require("./ghost.cjs")`)).toEqual([]);
  });

  it("the keywords already covered still work", () => {
    expect(localRequires(`return /'/; // require("./r.cjs")`)).toEqual([]);
    expect(localRequires(`await /'/ ; // require("./a.cjs")`)).toEqual([]);
    expect(localRequires(`yield /'/ ; // require("./y.cjs")`)).toEqual([]);
  });

  it("division after an identifier ending in a keyword is still division", () => {
    expect(localRequires(`const j = x.join / 2; require("./real.cjs");`)).toEqual([
      "real.cjs",
    ]);
  });

  it("requires inside comments still do not leak", () => {
    expect(localRequires(`// require("./c.cjs")`)).toEqual([]);
    expect(localRequires(`/* require("./c2.cjs") */`)).toEqual([]);
  });
});
