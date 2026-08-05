/**
 * w4y-home.cjs — the ONE place the desktop decides where the data home is.
 *
 * Lives in its own module so every caller shares the same answer without a
 * require cycle (w4y-login and w4y-composio both need it, and they already
 * require each other).
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * Resolve the engine data home.
 *
 * Precedence:
 *  1. WAYNE_HOME — spawner-injected, and how a per-profile child is scoped.
 *  2. WORK4YOU_HOME — the user-facing spelling.
 *  3. The platform default, resolved DYNAMICALLY the same way the engine does
 *     (work4you_constants._get_platform_default_wayne_home): the new root if
 *     it exists, else an un-migrated legacy root, else the new name.
 *
 * Step 3 must stay in lockstep with the engine. The engine migrates
 * ~/.wayne -> ~/.work4you the first time it runs without an explicit home,
 * which happens as soon as the user runs the CLI in a terminal. A desktop
 * that kept pinning the legacy path would then hand the engine an empty home
 * and drop the user into provider onboarding with their profiles and API keys
 * apparently gone. Observed in the field on 03/08/2026.
 */
function resolveWayneHome() {
  if (process.env.WAYNE_HOME) return path.resolve(process.env.WAYNE_HOME);
  if (process.env.WORK4YOU_HOME) return path.resolve(process.env.WORK4YOU_HOME);

  const [newRoot, legacyRoot] =
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? [
          path.join(process.env.LOCALAPPDATA, "work4you"),
          path.join(process.env.LOCALAPPDATA, "wayne"),
        ]
      : [
          path.join(os.homedir(), ".work4you"),
          path.join(os.homedir(), ".wayne"),
        ];
  try {
    if (fs.existsSync(newRoot)) return newRoot;
    if (fs.existsSync(legacyRoot)) return legacyRoot;
  } catch {
    /* fall through to the new name */
  }
  return newRoot;
}

module.exports = { resolveWayneHome };
