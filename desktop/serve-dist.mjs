// Minimal static server for the exported web bundle.
// `expo export --platform web` with `output: "single"` produces an SPA, so any
// unknown path has to fall through to index.html for client-side routing.

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "dist-web");
const port = Number(process.env.PORT ?? 8099);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

/** Resolves inside `root`, or null. A prefix test alone would let a sibling
 *  directory through, so the containment check is on the relative path. */
const resolveWithinRoot = (urlPath) => {
  const candidate = path.resolve(root, `.${path.posix.sep}${urlPath}`);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  try {
    if (!existsSync(candidate) || statSync(candidate).isDirectory())
      return null;
  } catch {
    return null;
  }
  return candidate;
};

const safeLog = (value) =>
  String(value)
    .replace(/[\r\n\t]/g, " ")
    .slice(0, 200);

createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad request");
    return;
  }

  let file = resolveWithinRoot(url);

  if (!file) {
    // Only routes fall through to index.html. A missing *file* must 404 —
    // handing back HTML for a .ttf turns a packaging bug into silent tofu.
    if (path.extname(url) !== "") {
      console.error(`404 ${safeLog(url)}`);
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    file = path.join(root, "index.html");
  }

  try {
    const body = readFileSync(file);
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch (error) {
    // Never echo the exception: it leaks paths and can be rendered as HTML.
    console.error("failed to serve file:", error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal error");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Streamyfin desktop bundle on http://localhost:${port}`);
});
