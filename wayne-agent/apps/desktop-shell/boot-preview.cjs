/**
 * Serves the PRODUCT's own interface while the engine is still starting.
 *
 * The owner's ask, twice: "não tem como ser a mesma tela do produto?". It can,
 * and this is how. The SPA is a static bundle (index.html + one JS + one CSS,
 * ~5 MB) shipped inside the app; this tiny loopback server hands it to the
 * window immediately, so the first thing anyone sees is the real interface —
 * the real sidebar, the real header, the real hero — not a screen about us.
 *
 * Why a server and not file://: the built index.html references its assets
 * with ABSOLUTE paths (/assets/index-*.js), which file:// resolves against the
 * drive root and fails. Rewriting the build to relative paths would change how
 * the engine serves the same bundle, so the shell adapts instead.
 *
 * The page is served with a marker (`window.__W4Y_BOOT_PREVIEW__`) so the SPA
 * knows the engine is not up YET and stays quiet instead of reporting a
 * connection it was never supposed to have. When the engine is ready, main.cjs
 * loads the engine's origin and this whole thing is torn down — the swap is
 * invisible because it is literally the same interface.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/** Injected before the app's own script so the flag exists on first render. */
const MARKER = "<script>window.__W4Y_BOOT_PREVIEW__=1;</script>";

let server = null;
let origin = null;

/**
 * Start serving `rootDir` on loopback. Resolves null when the bundle is not
 * there (dev checkouts, a packaging mistake) — the caller then falls back to
 * the old boot screen instead of showing nothing.
 */
function start(dir) {
  return new Promise((resolve) => {
    try {
      // Resolve FIRST: a caller passing forward slashes on Windows would make
      // the containment check below compare "C:/x/y" against path.join's
      // "C:\x\y" and reject every single file. (Caught by the smoke test —
      // the window would have opened blank.)
      const rootDir = path.resolve(dir);
      const indexPath = path.join(rootDir, "index.html");
      if (!fs.existsSync(indexPath)) return resolve(null);
      if (origin) return resolve(origin);

      server = http.createServer((req, res) => {
        let rel = decodeURIComponent((req.url || "/").split("?")[0]);
        if (rel === "/") rel = "/index.html";
        // Contain the served path inside rootDir: this is loopback-only and
        // read-only, but a traversal would still hand out arbitrary files.
        const target = path.join(rootDir, path.normalize(rel).replace(/^([/\\])+/, ""));
        if (!target.startsWith(rootDir)) {
          res.writeHead(403).end("forbidden");
          return;
        }
        fs.readFile(target, (err, buf) => {
          if (err) {
            // SPA routes (/files, /profiles…) have no file on disk: hand back
            // index.html so the router paints the right screen.
            return fs.readFile(indexPath, (err2, html) => {
              if (err2) return res.writeHead(404).end("not found");
              res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
              res.end(String(html).replace("<head>", `<head>${MARKER}`));
            });
          }
          const ext = path.extname(target).toLowerCase();
          const type = TYPES[ext] || "application/octet-stream";
          if (ext === ".html") {
            res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
            return res.end(String(buf).replace("<head>", `<head>${MARKER}`));
          }
          res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
          res.end(buf);
        });
      });

      server.on("error", () => resolve(null));
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        origin = `http://127.0.0.1:${addr.port}`;
        resolve(origin);
      });
    } catch {
      resolve(null);
    }
  });
}

function stop() {
  try {
    if (server) server.close();
  } catch {
    /* already gone */
  }
  server = null;
  origin = null;
}

module.exports = { start, stop, getOrigin: () => origin };
