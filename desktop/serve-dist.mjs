// Minimal static server for the exported web bundle.
// `expo export --platform web` with `output: "single"` produces an SPA, so any
// unknown path has to fall through to index.html for client-side routing.

import { readdirSync, readFileSync } from "node:fs";
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

/**
 * Index of every servable file, built once: request path -> path on disk.
 *
 * No filesystem path is ever constructed from request data, so traversal is
 * impossible by construction rather than by a guard that has to be right.
 */
const fileIndex = new Map();

const buildFileIndex = (dir = root, prefix = "") => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) buildFileIndex(abs, key);
    else fileIndex.set(key, abs);
  }
};

buildFileIndex();

createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad request");
    return;
  }

  let file = fileIndex.get(url);

  if (!file) {
    // Only routes fall through to index.html. A missing *file* must 404 —
    // handing back HTML for a .ttf turns a packaging bug into silent tofu.
    if (path.extname(url) !== "") {
      // Deliberately does not include the requested path: logging request data
      // is a log-injection sink, and the browser's network panel already shows
      // which URL failed.
      console.error("404: asset not present in the bundle");
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    file = fileIndex.get("/index.html");
    if (!file) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Bundle missing");
      return;
    }
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
