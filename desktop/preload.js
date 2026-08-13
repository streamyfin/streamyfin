// Streamyfin Desktop — preload.
//
// The renderer runs the unmodified Expo web bundle. It is given two things it
// cannot do for itself: a keystore-backed secure store (expo-secure-store is
// native-only, and saving an account fails without it), and a mirror of its
// persisted state so a session survives app updates. Both are narrow,
// key/value-scoped IPC calls — no filesystem or Node access reaches the page.
const { contextBridge, ipcRenderer } = require("electron");

const MIRROR_INTERVAL_MS = 5000;

/**
 * Restore persisted state before any page script runs.
 *
 * The app reads its Jellyfin token at module scope, so this has to be
 * synchronous and it has to happen here — the preload is the only thing that
 * executes before the bundle. Existing state always wins; the mirror only
 * repopulates an empty profile (fresh install, or an origin change caused by
 * the loopback port moving).
 */
function restoreSession() {
  try {
    if (localStorage.length > 0) return;
    const json = ipcRenderer.sendSync("session-mirror:load");
    if (!json) return;
    for (const [key, value] of Object.entries(JSON.parse(json))) {
      if (typeof value === "string") localStorage.setItem(key, value);
    }
  } catch {
    // A failed restore must never stop the app from starting.
  }
}

let lastMirrored = null;

/** Push current state back to disk so the next launch can restore it. */
function mirrorSession() {
  try {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) data[key] = localStorage.getItem(key);
    }
    if (Object.keys(data).length === 0) return;

    // The renderer caches images and query state here too, so this runs often.
    // Skip the encrypted write unless something actually changed.
    const json = JSON.stringify(data);
    if (json === lastMirrored) return;
    lastMirrored = json;
    void ipcRenderer.invoke("session-mirror:save", json);
  } catch {
    // Best-effort.
  }
}

restoreSession();

window.addEventListener("DOMContentLoaded", () => {
  setInterval(mirrorSession, MIRROR_INTERVAL_MS);
});
window.addEventListener("beforeunload", mirrorSession);

contextBridge.exposeInMainWorld("streamyfinDesktop", {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  secureStore: {
    get: (key) => ipcRenderer.invoke("secure-store:get", String(key)),
    set: (key, value) =>
      ipcRenderer.invoke("secure-store:set", String(key), String(value)),
    delete: (key) => ipcRenderer.invoke("secure-store:delete", String(key)),
  },
  fullscreen: {
    toggle: () => ipcRenderer.invoke("fullscreen:toggle"),
    get: () => ipcRenderer.invoke("fullscreen:get"),
    /** Fires for the F11 accelerator too, not just our own toggle. */
    subscribe: (listener) => {
      const handler = (_event, isFullscreen) => listener(isFullscreen === true);
      ipcRenderer.on("fullscreen:changed", handler);
      return () => ipcRenderer.removeListener("fullscreen:changed", handler);
    },
  },
});
