// Streamyfin Desktop — Electron main process.
//
// Loads the Expo web export (dist-web) produced by `bun run build:desktop`.
// The bundle is served over http://127.0.0.1:<random port> from an in-process
// server rather than file://, because the export uses absolute asset paths
// (/_expo/...) and expo-router needs a real origin for history routing.

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
  shell,
} = require("electron");
const { createServer } = require("node:http");
const {
  existsSync,
  readFileSync,
  readdirSync,
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
 * Index of every servable file, built once at startup: request path -> absolute
 * path on disk.
 *
 * The bundle is static, so the set of servable files is known up front. Looking
 * a request up in this map means no filesystem path is ever *constructed* from
 * request data — traversal is impossible by construction rather than by a guard
 * that has to be right, and there is no tainted path expression for static
 * analysis to flag either.
 */
const fileIndex = new Map();

function buildFileIndex(dir = DIST, prefix = "") {
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
}

function startBundleServer() {
  buildFileIndex();
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      let urlPath;
      try {
        urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
      } catch {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Bad request");
        return;
      }

      const looksLikeAsset = path.extname(urlPath) !== "";
      let file = fileIndex.get(urlPath);

      if (!file) {
        if (looksLikeAsset) {
          // Deliberately does not include the requested path. Logging request
          // data is a log-injection sink, and the browser's network panel
          // already shows which URL failed — so the log only needs to say that
          // an asset was missing (which is what caught a packaging bug where
          // the icon fonts were absent from the build).
          console.error("[streamyfin] 404: asset not present in the bundle");
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        // A route, not a file: hand back the SPA entry point so expo-router
        // can resolve it client-side.
        file = fileIndex.get("/index.html");
        if (!file) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Bundle missing");
          return;
        }
      }

      try {
        res.writeHead(200, {
          "Content-Type":
            MIME[path.extname(file)] ?? "application/octet-stream",
        });
        res.end(readFileSync(file));
      } catch (error) {
        // Never echo the exception back: it would leak paths and stack detail,
        // and an unescaped message rendered as HTML is an XSS vector.
        console.error("[streamyfin] failed to serve a bundle file:", error);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal error");
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
      const onError = (err) => {
        if (err.code === "EADDRINUSE") {
          console.warn(`[streamyfin] port ${port} busy, trying the next one`);
          tryPort(index + 1);
        } else {
          reject(err);
        }
      };
      server.once("error", onError);
      server.listen(port, "127.0.0.1", () => {
        // Drop the retry handler; leaving it attached means a later runtime
        // error on the live server would be treated as a bind failure.
        server.removeListener("error", onError);
        resolve(`http://127.0.0.1:${port}`);
      });
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
const MAX_TRACKED_PREFLIGHTS = 100;

// webContents id of the app window. The interceptors below only act on traffic
// from our own renderer, so nothing else sharing the default session can have
// its CORS rewritten or its cookies replayed.
let appWebContentsId = null;

/**
 * Whether a request came from the app window.
 *
 * Both identifying fields are optional in the webRequest API, so a missing
 * webContentsId must not be read as "not ours". This app runs a single window
 * on the default session, so when neither field is present the request is
 * treated as ours: failing closed would silently skip cookie replay and CORS
 * relaxation — which is exactly the failure that makes a Jellyseerr login look
 * like a rejected password — whereas failing open only restores the behaviour
 * this session had before the narrowing.
 */
const isFromAppRenderer = (details) => {
  // Nothing can have come from a window that does not exist yet.
  if (appWebContentsId === null) return false;
  if (typeof details.webContentsId === "number")
    return details.webContentsId === appWebContentsId;
  if (details.webContents) return details.webContents.id === appWebContentsId;
  return true;
};

/**
 * Fills in CORS only for servers that do not do it themselves.
 *
 * Jellyfin answers preflights correctly and sends Access-Control-Allow-Origin,
 * so rewriting its headers was both unnecessary and rude — it replaced a
 * working answer with ours on every response. Jellyseerr sends no CORS headers
 * at all and rejects preflights with 405, which is the case this exists for.
 *
 * Deciding on "did the server already answer?" rather than on a list of hosts
 * is what keeps first-run setup working: a server the user is adding for the
 * first time is not in any list yet, but it either speaks CORS (nothing to do)
 * or it does not (we fill in), and both paths work.
 */
function withRelaxedCors(details, appOrigin) {
  const headers = { ...details.responseHeaders };

  const serverSentCors = Object.keys(headers).some(
    (key) => key.toLowerCase() === "access-control-allow-origin",
  );
  const preflightSucceeded =
    details.statusCode >= 200 && details.statusCode < 300;

  // The server handled CORS itself — leave its response untouched.
  if (serverSentCors && (details.method !== "OPTIONS" || preflightSucceeded)) {
    preflightRequestHeaders.delete(details.id);
    return { responseHeaders: headers };
  }

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

let cookieSaveTimer = null;
/** Coalesces writes: every authenticated response can carry Set-Cookie. */
const scheduleCookieJarSave = () => {
  if (cookieSaveTimer) return;
  cookieSaveTimer = setTimeout(() => {
    cookieSaveTimer = null;
    saveCookieJar();
  }, 1000);
};

function bridgeApiCookies(appOrigin) {
  loadCookieJar();

  /** True for requests to our own bundle server. Origin, not prefix. */
  const isAppRequest = (url) => {
    try {
      return new URL(url).origin === appOrigin;
    } catch {
      return false;
    }
  };

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isFromAppRenderer(details)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    if (!isAppRequest(details.url)) {
      const setCookie =
        details.responseHeaders?.["set-cookie"] ??
        details.responseHeaders?.["Set-Cookie"];
      if (setCookie?.length) {
        const host = new URL(details.url).host;
        const jar = cookieJar.get(host) ?? new Map();
        for (const entry of setCookie) {
          const [pair, ...attrs] = entry.split(";");
          const idx = pair.indexOf("=");
          if (idx <= 0) continue;
          const name = pair.slice(0, idx).trim();
          const value = pair.slice(idx + 1).trim();

          // A server clears a cookie by re-sending it already expired. Ignoring
          // that would replay a dead session for as long as the jar lives.
          const meta = attrs.map((a) => a.trim().toLowerCase());
          const clearedByMaxAge = meta.some(
            (a) => a.startsWith("max-age=") && Number(a.slice(8)) <= 0,
          );
          const clearedByExpires = meta.some((a) => {
            if (!a.startsWith("expires=")) return false;
            const when = Date.parse(a.slice(8));
            return Number.isFinite(when) && when <= Date.now();
          });

          if (!value || clearedByMaxAge || clearedByExpires) jar.delete(name);
          else jar.set(name, value);
        }
        if (jar.size > 0) cookieJar.set(host, jar);
        else cookieJar.delete(host);
        scheduleCookieJarSave();
      }
    }
    callback(withRelaxedCors(details, appOrigin));
  });

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (isFromAppRenderer(details) && !isAppRequest(details.url)) {
      if (details.method === "OPTIONS") {
        const requested =
          details.requestHeaders["Access-Control-Request-Headers"] ??
          details.requestHeaders["access-control-request-headers"];
        if (requested) {
          // A preflight whose response never reaches us would otherwise sit
          // here forever; drop the oldest entry rather than grow unbounded.
          if (preflightRequestHeaders.size >= MAX_TRACKED_PREFLIGHTS) {
            const oldest = preflightRequestHeaders.keys().next().value;
            preflightRequestHeaders.delete(oldest);
          }
          preflightRequestHeaders.set(details.id, requested);
        }
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

/**
 * Window fullscreen, driven from the player's own controls.
 *
 * This goes through the window rather than the HTML Fullscreen API so that the
 * button and the F11 accelerator end up in the same state. Fullscreening an
 * element would leave `win.isFullScreen()` false, and the two would disagree
 * the moment a user mixed them.
 */
function registerFullscreen() {
  const windowFor = (event) => BrowserWindow.fromWebContents(event.sender);

  ipcMain.handle("fullscreen:toggle", (event) => {
    const win = windowFor(event);
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });

  ipcMain.handle("fullscreen:get", (event) => {
    const win = windowFor(event);
    return win ? win.isFullScreen() : false;
  });
}

/** Keep the renderer's fullscreen state in step with the window's. */
function reportFullscreenChanges(win) {
  const send = (isFullscreen) => {
    if (!win.isDestroyed()) {
      win.webContents.send("fullscreen:changed", isFullscreen);
    }
  };
  win.on("enter-full-screen", () => send(true));
  win.on("leave-full-screen", () => send(false));
}

// Bound once for the whole app run. createWindow() is called again on macOS
// `activate`, and re-binding would pick a different port — a different origin,
// and therefore an empty profile.
let appOriginPromise = null;
const getAppOrigin = () => {
  if (!appOriginPromise) {
    appOriginPromise = DEV_URL
      ? Promise.resolve(DEV_URL)
      : startBundleServer().then((origin) => {
          // Registers the single onHeadersReceived / onBeforeSendHeaders pair:
          // relaxed CORS and the API cookie bridge share them, because Electron
          // keeps only the most recently registered listener per event.
          bridgeApiCookies(new URL(origin).origin);
          return origin;
        });
    if (DEV_URL) bridgeApiCookies(new URL(DEV_URL).origin);
  }
  return appOriginPromise;
};

async function createWindow() {
  const appOrigin = await getAppOrigin();

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

  appWebContentsId = win.webContents.id;

  reportFullscreenChanges(win);

  // External links open in the user's browser, never inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  // The shell only ever hosts the local bundle. Anything trying to navigate the
  // window itself to a remote origin is either a stray link or hostile; hand it
  // to the browser instead of loading it with this window's privileges.
  win.webContents.on("will-navigate", (event, url) => {
    // Compare parsed origins: a prefix test would accept something like
    // http://127.0.0.1:47821.example.com.
    let sameOrigin = false;
    try {
      sameOrigin = new URL(url).origin === appOrigin;
    } catch {
      sameOrigin = false;
    }
    if (sameOrigin) return;
    event.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });

  await win.loadURL(appOrigin);
  return win;
}

// Chromium needs this for HTML5 video with proprietary codecs in some builds,
// and it stops background throttling from stalling playback in a hidden window.
app.commandLine.appendSwitch("disable-background-timer-throttling");

const launch = () =>
  createWindow().catch((error) => {
    // Most likely every fixed port is taken. Say so instead of exiting with a
    // blank screen and no explanation.
    dialog.showErrorBox(
      "Streamyfin could not start",
      String(error?.message ?? error),
    );
    app.quit();
  });

app.whenReady().then(() => {
  registerSecureStore();
  registerFullscreen();
  launch();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) launch();
  });
});

// The cookie write is debounced; quitting inside that window would drop the
// most recent session cookie and force a fresh Jellyseerr login next launch.
app.on("before-quit", () => {
  if (cookieSaveTimer) {
    clearTimeout(cookieSaveTimer);
    cookieSaveTimer = null;
    saveCookieJar();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
