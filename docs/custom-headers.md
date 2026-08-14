# Custom auth headers

Some people put Jellyfin (and its companions) behind an access gateway —
Cloudflare Zero Trust, Pangolin, an authenticating reverse proxy — which
demands an extra HTTP header before it forwards anything. Without that header
every request answers `403`, so the app cannot even reach `/System/Info/Public`.

Custom headers let the user configure those headers per service. They are
attached to every request the app makes to that service, and to nothing else.

## Where they are configured

| Surface | What it configures |
| --- | --- |
| Login → *Advanced: custom headers* (mobile and TV) | Jellyfin, before the first connection |
| Settings → Network → *Custom headers* (mobile) | Jellyfin, for the connected server |
| Settings → *Custom headers* (TV) | Jellyfin plus every integration |
| Settings → Plugins → Jellyseerr / Streamystats / Marlin (mobile) | That integration |

Each integration picks one of three sources:

- **Jellyfin** — reuse the headers configured for the Jellyfin server (the
  usual case: one gateway in front of everything).
- **Custom** — its own set of headers.
- **None** — send nothing (the default).

## Storage

Header **values are secrets** and go to `expo-secure-store` (Keychain /
Keystore). MMKV only ever holds the metadata: the header name, whether it is
enabled, and the SecureStore key holding the value. The editors read the values
back (masked) so a header can be corrected without retyping all of them.

- Per-server headers live on the `SavedServer` entry in `previousServers`
  (`utils/secureCredentials.ts`).
- Per-integration configuration lives under `custom_headers_config_<key>`
  (`utils/customHeaders/integrations.ts`).
- Removing a server, or a header row, deletes the SecureStore values behind it.

`customHeadersVersionAtom` is bumped on every write. Anything that builds a
long-lived client from the headers (the Jellyseerr client, image sources)
depends on it, so an edit applies without a restart — and it also invalidates
the resolution cache in `resolve.ts`, which keeps every image from re-parsing
the server list and re-reading the Keychain.

## Which requests get headers

Headers are attached only when the URL belongs to a configured service —
`isUrlForBaseUrl` compares origin and base path. A poster on TMDB, an
OpenSubtitles download, or a remote stream referenced by an item never sees
them.

| Path | How |
| --- | --- |
| Jellyfin SDK calls | request interceptor installed by `createApiWithCustomHeaders` |
| Server check on login | `checkJellyfinServer` |
| Reachability probe | `jellyfinProbe` via `NetworkStatusProvider` |
| Session WebSocket | third argument of RN's `WebSocket` in `WebSocketProvider` |
| Images | `<Image>` from `components/common/ServerImage` (it carries expo-image's statics, so it is the only import a screen needs) and `getItemImage`, whose source wins when it already resolved them |
| Image prefetch | `prefetchServerImage` |
| Video playback | `MpvVideoSource.headers` in `direct-player` |
| Now Playing artwork (iOS) | `nowPlayingMetadata.artworkHeaders` |
| Video downloads | `BackgroundDownloader.enqueueDownload(..., headers)` |
| Trickplay, subtitles, posters | `File.downloadFileAsync(..., optionsWithOptionalHeaders(...))` |
| Music streams and artwork | `itemToTrack` (TrackPlayer) |
| Jellyseerr / Streamystats / Marlin | `getIntegrationHeaders(key)` |

## Rules worth knowing

- **`Authorization` is dropped.** Jellyfin and Streamystats authenticate with
  that header themselves; a custom one would replace the session token. It is
  filtered out in `normalizeCustomHeaders`, so no preset offers it.
- **Nothing is attached when nothing is configured.** The helpers in
  `optionalHeaders.ts` leave request options byte-for-byte unchanged rather
  than adding an empty `headers` object — several native APIs behave
  differently once the key exists.
- **Disabled, blank, malformed and duplicated rows never reach a request.**
  `normalizeCustomHeaders` is the single gate.
- **Local network URLs get no headers.** Headers are keyed on the remote
  address; a LAN URL reaches the server directly, bypassing the gateway.

## Known limitations

- **MPV applies headers globally, not per URL.** They are only sent when the
  main stream is served by the Jellyfin server. If an item's stream is a remote
  URL while its external subtitles are on Jellyfin, those subtitles load
  without headers and fail. Fixing that needs a prefetch-to-local-file path for
  protected subtitle URLs.
- **Headers are not persisted natively for downloads.** The iOS background
  downloader persists its queue to an App Group container, which is not
  encrypted; writing credentials there would undo the SecureStore protection.
  `useDownloadReconciliation` supplies them again on startup — a download still
  waiting in the native queue is cancelled and re-queued with its headers. A
  transfer that native already restarted keeps the request URLSession stored
  for it, so it is unaffected.
