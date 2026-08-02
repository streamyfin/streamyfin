// Streamyfin Desktop — Electron main process.
//
// Loads the Expo web export (dist-web) produced by `bun run build:desktop`.
// The bundle is served over http://127.0.0.1:<random port> from an in-process
// server rather than file://, because the export uses absolute asset paths
// (/_expo/...) and expo-router needs a real origin for history routing.

const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  session,
  shell,
} = require("electron");
const { createServer } = require("node:http");
const {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const path = require("node:path");

// Packaged, the export is copied to resources/dist-web (see extraResources in
// electron-builder.yml — it cannot live in the asar). Run straight from the
// repo (`bun run desktop`), it is still at the repo root where `expo export`
// wrote it. Support both so no copy step is needed.
const PACKAGED_DIST = path.join(process.resourcesPath ?? "", "dist-web");
const REPO_DIST = path.join(__dirname, "..", "dist-web");
const DIST = existsSync(PACKAGED_DIST) ? PACKAGED_DIST : REPO_DIST;

const DEV_URL = process.env.STREAMYFIN_DEV_URL;

// Fixed loopback ports, tried in order. See startBundleServer for why this must
// not be a random port. Deliberately obscure to make a collision unlikely; if
// one does happen the origin shifts and the app looks logged out, so the
// fallbacks stay in a tight, predictable set rather than going random.
const APP_PORTS = [47821, 47822, 47823];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/**
 * Serves the SPA. Route paths fall through to index.html so expo-router can
 * handle them, but a request that names a file (anything with an extension)
 * 404s when it is missing instead of silently receiving index.html — an HTML
 * body served as a font or script fails in ways that are near-impossible to
 * trace back to a packaging mistake.
 */
function startBundleServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
      let file = path.join(DIST, urlPath);
      const looksLikeAsset = path.extname(urlPath) !== "";

      // Contain traversal: never serve outside the bundle directory.
      const outsideRoot = !file.startsWith(DIST);
      const missing =
        outsideRoot || !existsSync(file) || statSync(file).isDirectory();

      if (missing) {
        if (looksLikeAsset) {
          console.error(`[streamyfin] 404 ${urlPath} (looked in ${DIST})`);
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        file = path.join(DIST, "index.html");
      }

      try {
        res.writeHead(200, {
          "Content-Type":
            MIME[path.extname(file)] ?? "application/octet-stream",
        });
        res.end(readFileSync(file));
      } catch (error) {
        res.writeHead(500);
        res.end(String(error));
      }
    });

    // The port MUST be stable across launches. The renderer stores auth,
    // settings and saved accounts in localStorage (react-native-mmkv's web
    // backend), and localStorage is scoped to the origin — which includes the
    // port. A random port would hand the app an empty profile on every launch,
    // silently logging the user out and wiping their settings each time.
    const tryPort = (index) => {
      if (index >= APP_PORTS.length) {
        reject(
          new Error(
            `No free port among ${APP_PORTS.join(", ")}; refusing to fall back ` +
              `to a random one because that would discard stored login state.`,
          ),
        );
        return;
      }
      const port = APP_PORTS[index];
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          console.warn(`[streamyfin] port ${port} busy, trying the next one`);
          tryPort(index + 1);
        } else {
          reject(err);
        }
      });
      server.listen(port, "127.0.0.1", () =>
        resolve(`http://127.0.0.1:${port}`),
      );
    };
    tryPort(0);
  });
}

/**
 * Jellyfin and Jellyseerr are separate origins from the app's loopback origin,
 * and neither reliably returns CORS headers for a browser client (Jellyseerr in
 * particular is built to be same-origin). Relaxing CORS for the app's own
 * session is the standard Electron approach for a first-party desktop client:
 * requests still only go where the user pointed the app, and the renderer stays
 * sandboxed with contextIsolation on.
 */
// Access-Control-Request-Headers from in-flight preflights, keyed by request id.
// With credentials, `Access-Control-Allow-Headers: *` is read literally rather
// than as a wildcard, so the preflight response has to echo the exact list.
const preflightRequestHeaders = new Map();

function withRelaxedCors(details, appOrigin) {
  const headers = { ...details.responseHeaders };
  // Strip any existing values so we don't end up with duplicates, which
  // browsers treat as invalid.
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (
      lower === "access-control-allow-origin" ||
      lower === "access-control-allow-credentials" ||
      lower === "access-control-allow-headers" ||
      lower === "access-control-allow-methods"
    )
      delete headers[key];
  }
  headers["Access-Control-Allow-Origin"] = [appOrigin];
  headers["Access-Control-Allow-Credentials"] = ["true"];
  headers["Access-Control-Allow-Methods"] = [
    "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  ];
  headers["Access-Control-Allow-Headers"] = [
    preflightRequestHeaders.get(details.id) ??
      "content-type,authorization,x-api-key,x-emby-token,x-emby-authorization",
  ];

  // Jellyseerr is a same-origin app and answers CORS preflights with
  // "405 OPTIONS method not allowed". A browser needs a 2xx preflight before it
  // will send the real request, so the login POST never leaves the renderer and
  // axios reports a bare "Network Error". Rewriting the preflight's status to
  // 204 — headers alone are not enough — lets the actual request through.
  if (details.method === "OPTIONS") {
    preflightRequestHeaders.delete(details.id);
    headers["Access-Control-Max-Age"] = ["600"];
    delete headers["Content-Length"];
    delete headers["content-length"];
    return {
      responseHeaders: headers,
      statusLine: "HTTP/1.1 204 No Content",
    };
  }

  preflightRequestHeaders.delete(details.id);
  return { responseHeaders: headers };
}

/**
 * A cookie jar for cross-site API hosts, keyed by host.
 *
 * Jellyseerr authenticates with a session cookie, and none of the normal
 * browser machinery gets it back to the server from here:
 *
 *  - The app's loopback origin is cross-site to the Jellyseerr host, so the
 *    SameSite=Lax cookie Jellyseerr sets is not returned on later XHRs — and
 *    Chromium's third-party cookie restrictions mean it may not even be stored.
 *  - Streamyfin's own cookie handling cannot compensate. It reads `set-cookie`
 *    off the response, which is a forbidden header in a browser and always
 *    undefined on web, so it records an empty cookie list.
 *
 * The visible result is that login appears to succeed, the next authenticated
 * call 403s, and Streamyfin's 403 handler wipes the stored Jellyseerr user —
 * which reads to the user as "wrong password".
 *
 * Capturing Set-Cookie here and replaying it on outgoing requests to the same
 * host restores the behaviour the mobile app gets for free. Cookies are held in
 * memory and mirrored to disk (encrypted with the OS keystore where available)
 * so a Jellyseerr session survives a relaunch.
 */
const cookieJar = new Map(); // host -> Map(name -> value)
let cookieJarFile = null;

const loadCookieJar = () => {
  cookieJarFile = path.join(app.getPath("userData"), "api-cookies.bin");
  try {
    if (!existsSync(cookieJarFile)) return;
    const raw = readFileSync(cookieJarFile);
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8");
    for (const [host, pairs] of Object.entries(JSON.parse(json)))
      cookieJar.set(host, new Map(Object.entries(pairs)));
  } catch {
    // A corrupt or unreadable jar just means the user signs in again.
  }
};

const saveCookieJar = () => {
  try {
    const plain = {};
    for (const [host, pairs] of cookieJar)
      plain[host] = Object.fromEntries(pairs);
    const json = JSON.stringify(plain);
    writeFileSync(
      cookieJarFile,
      safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(json)
        : Buffer.from(json, "utf8"),
    );
  } catch {
    // Persistence is a convenience; failing to write must not break the app.
  }
};

function bridgeApiCookies(appOrigin) {
  loadCookieJar();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith(appOrigin)) {
      const setCookie =
        details.responseHeaders?.["set-cookie"] ??
        details.responseHeaders?.["Set-Cookie"];
      if (setCookie?.length) {
        const host = new URL(details.url).host;
        const jar = cookieJar.get(host) ?? new Map();
        for (const entry of setCookie) {
          const [pair] = entry.split(";");
          const idx = pair.indexOf("=");
          if (idx > 0)
            jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
        }
        cookieJar.set(host, jar);
        saveCookieJar();
      }
    }
    callback(withRelaxedCors(details, appOrigin));
  });

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!details.url.startsWith(appOrigin)) {
      if (details.method === "OPTIONS") {
        const requested =
          details.requestHeaders["Access-Control-Request-Headers"] ??
          details.requestHeaders["access-control-request-headers"];
        if (requested) preflightRequestHeaders.set(details.id, requested);
      }
      try {
        const jar = cookieJar.get(new URL(details.url).host);
        if (jar?.size) {
          details.requestHeaders.Cookie = [...jar]
            .map(([k, v]) => `${k}=${v}`)
            .join("; ");
        }
      } catch {
        // Never let cookie handling block the request.
      }
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}

/**
 * Backs the web shim for expo-secure-store (see web-shims/expo-secure-store.ts).
 * Values are encrypted with the OS keystore — DPAPI on Windows, Keychain on
 * macOS, libsecret on Linux — so saved-account tokens are not sitting in
 * localStorage in the clear.
 */
/**
 * Mirrors the renderer's persisted state (react-native-mmkv's web backend is
 * localStorage) into userData, and hands it back on next launch.
 *
 * localStorage is scoped to the origin, which includes the loopback port. The
 * port is pinned for exactly that reason, but a pinned port can still be taken
 * by something else, and any future change to it would silently sign everyone
 * out and lose their server URL. This mirror makes the stored session a
 * property of the user's profile rather than of whichever port we happened to
 * bind — so it survives app updates and port changes alike.
 *
 * Restore happens in the preload, synchronously, because the app reads its
 * token at module scope (see initialApi in JellyfinProvider): anything async
 * would land after that read.
 */
function registerSessionMirror() {
  const file = path.join(app.getPath("userData"), "session-mirror.bin");

  ipcMain.on("session-mirror:load", (event) => {
    try {
      if (existsSync(file)) {
        const raw = readFileSync(file);
        event.returnValue = safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(raw)
          : raw.toString("utf8");
        return;
      }
    } catch {
      // Fall through: a corrupt mirror just means signing in again.
    }
    event.returnValue = null;
  });

  ipcMain.handle("session-mirror:save", (_e, json) => {
    try {
      writeFileSync(
        file,
        safeStorage.isEncryptionAvailable()
          ? safeStorage.encryptString(json)
          : Buffer.from(json, "utf8"),
      );
    } catch {
      // Best-effort; never break the app over a failed mirror write.
    }
  });
}

function registerSecureStore() {
  const file = path.join(app.getPath("userData"), "secure-store.bin");
  const readAll = () => {
    try {
      if (!existsSync(file)) return {};
      const raw = readFileSync(file);
      return JSON.parse(
        safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(raw)
          : raw.toString("utf8"),
      );
    } catch {
      return {};
    }
  };
  const writeAll = (data) => {
    const json = JSON.stringify(data);
    writeFileSync(
      file,
      safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(json)
        : Buffer.from(json, "utf8"),
    );
  };

  ipcMain.handle("secure-store:get", (_e, key) => readAll()[key] ?? null);
  registerSessionMirror();
  ipcMain.handle("secure-store:set", (_e, key, value) => {
    const all = readAll();
    all[key] = value;
    writeAll(all);
  });
  ipcMain.handle("secure-store:delete", (_e, key) => {
    const all = readAll();
    delete all[key];
    writeAll(all);
  });
}

async function createWindow() {
  const appOrigin = DEV_URL ?? (await startBundleServer());
  // Registers the single onHeadersReceived / onBeforeSendHeaders pair: relaxed
  // CORS and the API cookie bridge share them, because Electron keeps only the
  // most recently registered listener per webRequest event.
  bridgeApiCookies(new URL(appOrigin).origin);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    title: "Streamyfin",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // External links open in the user's browser, never inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(appOrigin);
  return win;
}

// Chromium needs this for HTML5 video with proprietary codecs in some builds,
// and it stops background throttling from stalling playback in a hidden window.
app.commandLine.appendSwitch("disable-background-timer-throttling");

app.whenReady().then(() => {
  registerSecureStore();
  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
