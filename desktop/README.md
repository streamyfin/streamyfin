# Streamyfin Desktop

An Electron shell around the **real Streamyfin app**, compiled for the web with
`react-native-web`. It is the same routes, screens, providers and Jellyseerr
integration as mobile — not a reimplementation.

Targets: **Windows** and **Linux**.

## Build a self-contained app

```bash
bun run desktop:dist:win
```

Produces two standalone artifacts in `desktop/release/`, each bundling the
Electron runtime and the whole app — no bun, Node, or Expo needed on the target
machine:

| Artifact | What it is |
| --- | --- |
| `Streamyfin-0.55.0-portable.exe` | Single file, ~84 MB. Double-click and it runs; nothing is installed. |
| `Streamyfin-Setup-0.55.0.exe` | NSIS installer, ~84 MB. Per-user, choosable install directory, Start Menu and desktop shortcuts. |

For Linux:

```bash
bun run desktop:dist:linux
```

Produces a self-contained `AppImage` plus a `.deb`. **This must run on Linux** —
electron-builder does not cross-compile Linux targets from Windows.

Neither build is code-signed, so Windows SmartScreen will warn on first run.

## Run from source

```bash
bun run desktop
```

Exports the web bundle to `dist-web/` and launches Electron against it. To
iterate against the Metro dev server instead:

```bash
bun x expo start --web --port 8101
```

```bash
STREAMYFIN_DEV_URL=http://localhost:8101 bun --cwd desktop run start
```

## If packaging fails on Windows

electron-builder downloads a `winCodeSign` bundle that contains macOS symlinks.
Windows refuses to create them without Developer Mode or admin rights, and
electron-builder retries forever instead of failing cleanly. Seed the cache
yourself, skipping the macOS tree that Windows never uses:

```bash
7za x -snld -y "-o$LOCALAPPDATA/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0" "$LOCALAPPDATA/electron-builder/Cache/winCodeSign/<downloaded>.7z" "-x!darwin"
```

Delete the leftover numeric staging directories in that folder first.

## How the port works

`react-native` and `react-dom`/`react-native-web` do most of the work. The parts
that could not come across are redirected by `metro.config.js`, which swaps
modules only when `platform === "web"`:

| Native module | Desktop behaviour |
| --- | --- |
| `modules/mpv-player`, `modules/exoplayer-player` | HTML5 `<video>` + `hls.js` (`modules/mpv-player/index.web.tsx`) |
| `modules/background-downloader` | Unavailable — offline downloads are mobile-only |
| `modules/glass-poster` | Plain poster with progress bar and watched dot |
| `modules/tv-search`, top-shelf, TV recommendations | No-ops (TV-only features) |
| `react-native-track-player` | Inert — music playback is unavailable |
| `react-native-google-cast` | Reports "no devices"; the cast button hides |
| `react-native-device-info` | Reports the browser/Electron identity |
| `react-native-glass-effect-view` | Plain translucent view |
| `@bottom-tabs/react-navigation` | expo-router's JS `<Tabs>` (`WebTabLayout`) |

Local `modules/*` are redirected explicitly rather than by `.web.tsx`
resolution: the `@/…` alias goes through Metro's tsconfig-paths support, which
maps straight to `index.ts` and never consults platform extensions.

### The origin must stay stable

The bundle server binds a **fixed** loopback port (`APP_PORTS` in `main.js`).
This is not cosmetic. react-native-mmkv's web backend is `localStorage`, which
is scoped to the origin — including the port. Serving on an OS-assigned port
gives the app a brand-new, empty profile on every launch: signed out, settings
gone, saved accounts gone, logs gone. If all the fixed ports are taken the app
refuses to start rather than silently falling back to a random one.

### CORS preflights

Jellyseerr is a same-origin app with no CORS support. It answers a preflight
with `405 OPTIONS method not allowed` — verified directly against a live
instance. Browsers require a 2xx preflight before sending the real request, so
Streamyfin's login POST (JSON body ⇒ non-simple ⇒ preflighted) never left the
renderer and axios reported a bare `Network Error`.

`withRelaxedCors` rewrites preflight responses from non-app hosts to
`204 No Content`. Adding headers alone is not enough; the status has to change.
It also echoes the exact `Access-Control-Request-Headers`, because with
credentials a `*` in `Access-Control-Allow-Headers` is read literally rather
than as a wildcard.

### Cookies for Jellyseerr

Jellyseerr authenticates with a session cookie, and nothing gets it back to the
server unaided. The app's loopback origin is cross-site to Jellyseerr, so its
`SameSite=Lax` cookie is not returned on later XHRs, and Chromium's third-party
cookie restrictions may stop it being stored at all. Streamyfin's own cookie
handling cannot help: it reads `set-cookie` off the response, a forbidden header
in browsers that is always `undefined` on web.

`bridgeApiCookies` in `main.js` captures `Set-Cookie` from non-app hosts and
replays it as a `Cookie` header on outgoing requests to the same host, persisted
via the OS keystore. Without it, login looks like it works, the next call 403s,
Streamyfin's 403 handler wipes the stored user, and it reads as a bad password.

### Saved accounts

`expo-secure-store` is native-only and throws on web, which is what produced
"Account was not saved". `web-shims/expo-secure-store.ts` delegates to the main
process, which encrypts values with the OS keystore (DPAPI / Keychain /
libsecret) through Electron's `safeStorage`.

### Icon fonts

The web export writes `@expo/vector-icons` TTFs to
`dist-web/assets/node_modules/@expo/vector-icons/…`. That path contains
`node_modules`, which electron-builder **filters out of the asar** — so packing
the bundle via `files:` silently drops every font and all icons render as tofu
squares. The bundle therefore ships via `extraResources:` instead, and `main.js`
resolves it through `process.resourcesPath`.

The bundled HTTP server also 404s missing files rather than falling through to
`index.html`. Returning HTML for a `.ttf` is what made this failure invisible:
the font request "succeeded" with status 200 and the FontFace simply errored.

### Styling

`nativewind-web-output.ts` is imported first from `index.ts` and is **load
bearing**. NativeWind v2 defaults web output to `"css"`, meaning it passes raw
Tailwind class names to the DOM and assumes a compiled Tailwind stylesheet is on
the page. An Expo web export never produces one, so without this the app renders
with no styling at all. Switching output to `"native"` resolves the same classes
to React Native style objects, giving the desktop build styling identical to
mobile with no CSS build step.

## Known limitations

These are real gaps, not bugs to file:

- **No offline downloads.** Background downloading is an OS service with no
  browser equivalent.
- **No music playback.** `react-native-track-player` is native-only.
- **No Chromecast.**
- **Embedded audio/subtitle tracks cannot be switched client-side.** A `<video>`
  element cannot enumerate them; switching requires restarting the stream with
  different Jellyfin parameters. Side-loaded WebVTT subtitles do work.
- **No mpv subtitle styling** (ASS/SSA override, positioning, border styles).
- **Layouts are tuned for a phone viewport.** Styling is correct and rows fill
  the window, but nothing has been re-proportioned for a wide desktop screen and
  hit targets are still touch-sized.
- **Unsigned binaries.** Windows SmartScreen warns on first run, and Smart App
  Control may refuse to launch the `.exe` outright until you allow it. Signing
  needs a code-signing certificate.

## CORS

Jellyfin and Jellyseerr are separate origins from the app's loopback origin, and
Jellyseerr in particular is built to be same-origin. `main.js` therefore relaxes
CORS on the app's own Electron session. Requests still only go where the user
pointed the app, and the renderer keeps `contextIsolation: true`,
`nodeIntegration: false` and `sandbox: true`.
