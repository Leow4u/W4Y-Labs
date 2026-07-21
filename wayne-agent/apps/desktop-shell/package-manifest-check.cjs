/**
 * Guard against shipping a shell that cannot boot.
 *
 * electron-builder packs an ALLOWLIST (`build.files` in package.json). A local
 * module that main.cjs requires but nobody listed is silently left out of the
 * asar: the code runs fine from the checkout, and the packaged app dies on
 * `Cannot find module` at the very first require — after the installer already
 * replaced the working version.
 *
 * That is not hypothetical: `single-flight.cjs` was added to main.cjs and the
 * allowlist was not updated. Everything passed — node --check, typecheck,
 * tests, even a web build — because none of them exercise packaging.
 *
 * QUOTE STYLES MATTER. The first hand-audit of this repo used a
 * double-quote-only pattern and silently missed `hardening.cjs`, which three
 * modules require with single quotes. A checker with the same blind spot
 * would be worse than none, so the scanner accepts both and is tested on it.
 *
 * Pure functions here; the CLI wrapper lives at the bottom so the logic can be
 * unit-tested without a filesystem.
 */
const fs = require("fs");
const path = require("path");

/** Matches require("./x.cjs") and require('./x.cjs') in real code. */
const LOCAL_REQUIRE = /require\(\s*(['"])\.\/([^'"]+)\1\s*\)/g;

/**
 * Blanks out line comments, block comments and template literals, preserving
 * offsets and newlines so the result can still be scanned as code.
 *
 * A plain regex over raw source reports requires written inside COMMENTS — the
 * first version of this file did exactly that, flagging a `require("./x.cjs")`
 * that lived in its own doc block. A guard that cannot tell code from prose
 * trains people to ignore it.
 *
 * Regular strings are left alone: a require specifier IS a string, so blanking
 * them would blind the scanner. That means a require-looking string in ordinary
 * data would still be reported — deliberate, since a false alarm here is cheap
 * and a miss ships a broken app.
 */
function stripNonCode(source) {
  const s = String(source);
  let out = "";
  let i = 0;
  const N = s.length;
  while (i < N) {
    const c = s[i];
    const next = s[i + 1];
    if (c === "/" && next === "/") {
      while (i < N && s[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < N && !(s[i] === "*" && s[i + 1] === "/")) {
        out += s[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
      continue;
    }
    if (c === "`") {
      out += " ";
      i++;
      while (i < N && s[i] !== "`") {
        if (s[i] === "\\") { out += "  "; i += 2; continue; }
        out += s[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += " ";
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out += c;
      i++;
      while (i < N && s[i] !== quote) {
        if (s[i] === "\\") { out += s[i] + (s[i + 1] ?? ""); i += 2; continue; }
        if (s[i] === "\n") break; // unterminated — bail out rather than eat the file
        out += s[i];
        i++;
      }
      out += s[i] ?? "";
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Local module specifiers required by `source`, without the "./" prefix.
 * @param {string} source
 * @returns {string[]}
 */
function localRequires(source) {
  const found = new Set();
  for (const m of stripNonCode(source).matchAll(LOCAL_REQUIRE)) found.add(m[2]);
  return [...found];
}

/**
 * Does an electron-builder `files` allowlist cover `specifier`?
 *
 * Only the two shapes this manifest actually uses are honoured — an exact
 * name, or a directory glob like "assets/**". Anything cleverer is reported as
 * NOT covered on purpose: a checker that guesses at glob semantics would give
 * false confidence, and the failure it guards against is unrecoverable.
 *
 * @param {string} specifier e.g. "single-flight.cjs" or "assets/icon.png"
 * @param {string[]} files   build.files
 */
function isCovered(specifier, files) {
  const normalized = specifier.replace(/\\/g, "/");
  return files.some((entry) => {
    const pattern = String(entry).replace(/\\/g, "/");
    if (pattern === normalized) return true;
    const dirGlob = pattern.match(/^(.*?)\/\*\*(\/\*)?$/);
    if (dirGlob) return normalized.startsWith(`${dirGlob[1]}/`);
    return false;
  });
}

/**
 * Local modules that are required somewhere but missing from the allowlist.
 *
 * @param {{sources: Record<string,string>, files: string[]}} input
 *        sources: filename -> file contents
 * @returns {{specifier: string, requiredBy: string[]}[]} sorted, stable
 */
function findUnpackagedLocalModules({ sources, files }) {
  /** @type {Map<string, string[]>} */
  const bySpecifier = new Map();
  for (const [name, source] of Object.entries(sources)) {
    for (const spec of localRequires(source)) {
      if (isCovered(spec, files)) continue;
      const list = bySpecifier.get(spec) || [];
      list.push(name);
      bySpecifier.set(spec, list);
    }
  }
  return [...bySpecifier.entries()]
    .map(([specifier, requiredBy]) => ({ specifier, requiredBy: requiredBy.sort() }))
    .sort((a, b) => a.specifier.localeCompare(b.specifier));
}

/**
 * Does `specifier` stay inside the shell directory?
 *
 * `require("./x")` looks local, but `./../../secrets.cjs` is equally a "./"
 * require and resolves OUTSIDE the folder electron-builder packs. Such a module
 * can never be in the asar no matter what build.files says, so a checker that
 * only asked "is it listed?" would happily bless a path that cannot ship.
 * Purely lexical — no filesystem — so it is testable and cannot be fooled by
 * a symlink that exists today and not on the build machine.
 */
function resolvesInsideShell(specifier) {
  const normalized = String(specifier).replace(/\\/g, "/");
  // An absolute path or a Windows drive is never inside the shell folder.
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return false;
  let depth = 0;
  for (const part of normalized.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      depth -= 1;
      if (depth < 0) return false; // climbed above the shell root
    } else {
      depth += 1;
    }
  }
  return true;
}

/** The three ways a required local module fails to be shippable. */
const PROBLEM_LABEL = {
  unlisted: "not covered by build.files",
  missing: "does not exist on disk",
  escapes: "resolves outside the shell directory",
};

/**
 * Full audit of every local module the shell requires.
 *
 * Listing a name in build.files was never proof of anything: electron-builder
 * silently packs nothing for an entry with no file behind it, so a typo, a
 * rename or a deleted module produced exactly the failure this guard exists to
 * prevent — a green check and an app that dies on `Cannot find module`. Each
 * specifier must now clear all three bars: covered by the allowlist, present on
 * disk, and resolving inside the folder that actually gets packed.
 *
 * `exists` is injected so the logic is unit-testable without touching a real
 * filesystem; the CLI passes the real one.
 *
 * @param {object} input
 * @param {Record<string,string>} input.sources filename -> contents
 * @param {string[]} input.files                build.files
 * @param {(specifier: string) => boolean} [input.exists]
 * @returns {{specifier: string, requiredBy: string[], problems: string[]}[]}
 */
function auditLocalModules({ sources, files, exists = () => true }) {
  /** @type {Map<string, string[]>} */
  const bySpecifier = new Map();
  for (const [name, source] of Object.entries(sources)) {
    for (const spec of localRequires(source)) {
      const list = bySpecifier.get(spec) || [];
      list.push(name);
      bySpecifier.set(spec, list);
    }
  }

  const findings = [];
  for (const [specifier, requiredBy] of bySpecifier) {
    const problems = [];
    const inside = resolvesInsideShell(specifier);
    if (!inside) problems.push("escapes");
    if (!isCovered(specifier, files)) problems.push("unlisted");
    // Only ask the filesystem about paths that could legitimately be there;
    // an escaping specifier is already condemned and must not be resolved.
    if (inside && !exists(specifier)) problems.push("missing");
    if (problems.length) findings.push({ specifier, requiredBy: requiredBy.sort(), problems });
  }
  return findings.sort((a, b) => a.specifier.localeCompare(b.specifier));
}

/** Reads the shell's own .cjs files + build.files and runs the full audit. */
function checkPackageManifest(dir = __dirname) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const files = (pkg.build && pkg.build.files) || [];
  /** @type {Record<string,string>} */
  const sources = {};
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".cjs")) continue;
    sources[name] = fs.readFileSync(path.join(dir, name), "utf8");
  }
  const root = path.resolve(dir);
  return auditLocalModules({
    sources,
    files,
    exists: (specifier) => {
      const target = path.resolve(root, specifier);
      // Belt and braces: the lexical check already rejected escapes, but the
      // real resolution is re-verified before trusting anything about it.
      const rel = path.relative(root, target);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
      return fs.existsSync(target);
    },
  });
}

module.exports = {
  stripNonCode,
  localRequires,
  isCovered,
  resolvesInsideShell,
  findUnpackagedLocalModules,
  auditLocalModules,
  checkPackageManifest,
  PROBLEM_LABEL,
};

// CLI: `node package-manifest-check.cjs` — exit 1 lists the offenders.
if (require.main === module) {
  const findings = checkPackageManifest();
  if (findings.length === 0) {
    console.log("package manifest OK — every required local module is listed, present and inside the shell");
    process.exit(0);
  }
  console.error("Local modules that cannot ship:");
  for (const f of findings) {
    const why = f.problems.map((p) => PROBLEM_LABEL[p] || p).join("; ");
    console.error(`  ${f.specifier}  — ${why}  (required by ${f.requiredBy.join(", ")})`);
  }
  process.exit(1);
}
