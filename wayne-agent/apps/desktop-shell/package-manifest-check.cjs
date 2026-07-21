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

/**
 * Matches a RELATIVE require in real code, in all three quote styles.
 *
 * Two blind spots an independent review found in the first version, both of
 * which would have shipped a broken app under a green check:
 *
 *  - Only a leading "./" matched. `require("../../shared/log.cjs")` is just as
 *    local and just as unpackagable (electron-builder packs only this folder),
 *    and it was invisible. A test even asserted that miss as correct, locking
 *    the hole in.
 *  - The header bragged that "QUOTE STYLES MATTER" while listing two of
 *    JavaScript's three. ``require(`./single-flight.cjs`)`` is a static,
 *    working require the scanner could not see at all.
 */
const LOCAL_REQUIRE = /require\(\s*(['"`])(\.\.?\/[^'"`]+)\1\s*\)/g;

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
/**
 * Can a regex literal legally start here, given what came before?
 *
 * Without this, a quote inside a regex (`.replace(/'/g, "")`) opened a FAKE
 * string, and because string contents are emitted verbatim by design, the rest
 * of the line — including a `//` comment that mentions a require — leaked into
 * the scanner. The result was a phantom module reported as missing, failing
 * pack/dist:win/dist:mac/dist:linux with a finding nobody could act on.
 */
/** Keywords a regex literal may legally follow. */
const REGEX_PRECEDING_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

function regexCanStart(out) {
  const prev = out.replace(/\s+$/, "").slice(-1);
  if (!prev) return true; // start of file
  if ("(,=:[!&|?{};+-*%<>~^".includes(prev)) return true;
  // Explicit word extraction rather than a \b regex. Two reasons: a stray
  // BACKSPACE byte once landed here in place of the escape, silently killing
  // this whole branch (a regex after `return` then read as a string and leaked
  // the rest of the line to the scanner); and without a real boundary, a
  // pattern like /(in|of)$/ happily matches the tail of `join` or `typeof`.
  const word = (out.replace(/\s+$/, "").match(/[A-Za-z_$][\w$]*$/) || [""])[0];
  return REGEX_PRECEDING_KEYWORDS.has(word);
}

function stripNonCode(source) {
  const s = String(source);
  let out = "";
  let i = 0;
  const N = s.length;
  while (i < N) {
    const c = s[i];
    const next = s[i + 1];
    // Regex literal: blanked like a comment. It can contain quotes, slashes and
    // escapes that would otherwise be read as code.
    if (c === "/" && next !== "/" && next !== "*" && regexCanStart(out)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < N) {
        const ch = s[j];
        if (ch === "\\") { j += 2; continue; }
        if (ch === "\n") break; // unterminated — not a regex after all
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) { closed = true; break; }
        j += 1;
      }
      if (closed) {
        out += " ".repeat(j - i + 1);
        i = j + 1;
        while (i < N && /[a-z]/.test(s[i])) { out += " "; i += 1; } // flags
        continue;
      }
    }
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
      // Pad only for a closer that is actually there; an unterminated block
      // comment must not make the output LONGER than the input, or the
      // "offsets are preserved" promise above is a lie.
      if (i < N) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    if (c === "`") {
      // Find the closer first: a template with NO ${...} is just a string, and
      // a require specifier IS a string — blanking those unconditionally is why
      // require(`./single-flight.cjs`) was invisible to the scanner.
      let j = i + 1;
      let interpolated = false;
      while (j < N && s[j] !== "`") {
        if (s[j] === "\\") { j += 2; continue; }
        if (s[j] === "$" && s[j + 1] === "{") interpolated = true;
        j += 1;
      }
      if (!interpolated && j < N) {
        out += s.slice(i, j + 1); // emit verbatim, exactly like a plain string
        i = j + 1;
        continue;
      }
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
  for (const m of stripNonCode(source).matchAll(LOCAL_REQUIRE)) {
    // Normalize the common "./" prefix away; "../" is kept because it is the
    // whole point — resolvesInsideShell has to see it.
    found.add(m[2].startsWith("./") ? m[2].slice(2) : m[2]);
  }
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
      // `fs.existsSync` is CASE-INSENSITIVE on Windows — the only platform this
      // is built on — so require("./Single-Flight.cjs") passed all three bars
      // while the asar, whose lookups ARE case-sensitive, held the real
      // lower-case name. Green check, `Cannot find module` on the user's
      // machine. Compare the entry against the directory listing instead, and
      // refuse a directory: a folder is not a module.
      let stat;
      try {
        stat = fs.statSync(target);
      } catch {
        return false;
      }
      if (!stat.isFile()) return false;
      try {
        return fs.readdirSync(path.dirname(target)).includes(path.basename(target));
      } catch {
        return false;
      }
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
