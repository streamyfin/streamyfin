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

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = path.join(root, url);

  if (!existsSync(file) || statSync(file).isDirectory()) {
    // Only routes fall through to index.html. A missing *file* must 404 —
    // handing back HTML for a .ttf turns a packaging bug into silent tofu.
    if (path.extname(url) !== "") {
      console.error(`404 ${url}`);
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
    res.writeHead(500);
    res.end(String(error));
  }
}).listen(port, () => {
  console.log(`Streamyfin desktop bundle on http://localhost:${port}`);
});
