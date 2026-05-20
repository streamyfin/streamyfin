# Chromecast Device Profiles & Capability Detection — Design

**Date:** 2026-05-21
**Branch:** `refactor-chromecast` (PR #1402)
**Sub-project:** A (cornerstone) of the Chromecast refactor
**Status:** Approved design — pending implementation plan

---

## 1. Problem

Casting to Chromecast crashes for a large class of media:

- `Media control channel status code 2100` (LOAD_FAILED) on movies and high-bitrate media.
- 5.1 / multichannel audio crashes the receiver (issue #1085).
- Casting reportedly only works at video bitrate ≤ 2 Mb/s (issue #1423).
- Movies fail to load entirely; some media loads forever.

**Root cause:** the sender ships a device profile that does not match the actual
Chromecast. Two near-identical static profiles (`utils/profiles/chromecast.ts`,
`utils/profiles/chromecasth265.ts`) are selected by a single global boolean
`enableH265ForChromecast`. A 1st/2nd/3rd-gen Chromecast (H.264-only, 1080p, 2-channel
audio, no HEVC) can receive an HEVC / 10-bit / high-bitrate stream it cannot decode,
producing status 2100.

Secondary defects in the load path:

- `getStreamUrl` defaults `audioStreamIndex` to `0`, which is the video stream — wrong
  audio track selection.
- `getStreamUrl` always takes `MediaSources[0]`, ignoring a requested `mediaSourceId`.
- Progress reporting uses `mediaInfo.contentId` (the item id) as `PlaySessionId` — the
  Jellyfin dashboard cannot correlate the session.
- The load sequence (`getStreamUrl` → `buildCastMediaInfo` → `client.loadMedia`) is
  duplicated in three places: `PlayButton.tsx`, and `casting-player.tsx`
  (`reloadWithSettings` and `loadEpisode`).
- `loadMedia` failures are swallowed into `console.error` — the user sees nothing.

## 2. Scope

**In scope**

- Per-device Chromecast capability detection.
- A profile builder replacing the two static profile files.
- A single unified cast-load function.
- The load-path bug fixes listed above.
- Settings migration from `enableH265ForChromecast` to an explicit profile mode.
- Failure resilience (downgrade-on-failure retry, user-visible errors).
- A test matrix to empirically calibrate conservative defaults.

**Out of scope** (later sub-projects)

- Audio / subtitle / quality track switching — sub-project B.
- Splitting the 52 KB `casting-player.tsx` — sub-project C.
- Episode navigation, remote controller, UX features — sub-project D.
- Custom Cast receiver (PR #1521) — separate later sub-project.

## 3. Approach

Approach 3 of the brainstorm: a **profile builder** driven by a **capability
registry** with a **conservative default**, plus **advanced override settings**.

Detection produces smart defaults; power users can override. An unknown device always
falls back to a safe baseline (H.264 / 1080p / 2 channels) that cannot crash the
receiver. The user's test hardware (Chromecast 1/2/3 HD) maps exactly onto that
baseline.

## 4. Architecture

### New modules

| File | Responsibility |
|---|---|
| `utils/casting/capabilities.ts` | `ChromecastCapabilities` type, model registry, `detectCapabilities(device, settings)` |
| `utils/casting/buildProfile.ts` | `buildChromecastProfile(caps)` → Jellyfin `DeviceProfile` |
| `utils/casting/castLoad.ts` | `loadCastMedia(...)` — unified load, used by all call sites |

### Removed

- `utils/profiles/chromecast.ts`
- `utils/profiles/chromecasth265.ts`

### Modified

- `components/PlayButton.tsx` — use `loadCastMedia`.
- `app/(auth)/casting-player.tsx` — `reloadWithSettings` and `loadEpisode` use `loadCastMedia`.
- `utils/atoms/settings.ts` — replace `enableH265ForChromecast`.
- Chromecast settings UI (`ChromecastSettings.tsx` / `ChromecastSettingsMenu.tsx`) — new controls.

## 5. Capability model

```ts
export interface ChromecastCapabilities {
  /** HEVC 8-bit (Main profile) decode support. */
  hevc: boolean;
  /** HEVC 10-bit (Main10) decode support. */
  hevc10bit: boolean;
  /** Maximum video resolution height. */
  maxResolution: 1080 | 2160;
  /** Maximum video bitrate in bits/second. */
  maxVideoBitrate: number;
  /** Maximum audio channels the receiver can output. */
  maxAudioChannels: number;
}
```

### Conservative default

Used for any unrecognised device. Equals a 1st/2nd/3rd-gen Chromecast:

```ts
const CONSERVATIVE: ChromecastCapabilities = {
  hevc: false,
  hevc10bit: false,
  maxResolution: 1080,
  maxVideoBitrate: 8_000_000, // initial guess — calibrated by the test matrix
  maxAudioChannels: 2,
};
```

> `maxVideoBitrate` starts at 8 Mb/s. Issue #1423 (≤ 2 Mb/s) is suspicious — 2 Mb/s is
> below any real hardware limit and likely points to a transcode-readiness or HLS
> issue rather than a bitrate ceiling. The test matrix (§9) confirms the true value
> before this number is finalised.

### Registry

Keyed by `device.modelName`. Initial entries:

- `"Chromecast"` — gen 1/2/3 → conservative baseline.
- `"Chromecast Ultra"` — HEVC, 2160p, higher bitrate, multichannel passthrough.
- `"Chromecast with Google TV"` — HEVC, HEVC 10-bit.
- `"Google TV Streamer"` — HEVC, HEVC 10-bit, 2160p.

`modelName` is ambiguous (gen 1/2/3 all report `"Chromecast"`, and Google TV devices
may report a TV model string). This is acceptable: the registry only *upgrades* away
from the conservative baseline for confidently-identified devices; everything else
stays safe.

### `detectCapabilities(device, settings)`

1. Look up `device.modelName` in the registry; fall back to `CONSERVATIVE`.
2. Apply advanced settings overrides:
   - `chromecastProfile: "force-hevc"` → `hevc: true`.
   - `chromecastProfile: "force-h264"` → `hevc: false, hevc10bit: false`.
   - `chromecastMaxBitrate` set → clamp `maxVideoBitrate`.
3. Return the merged capabilities.

## 6. Profile builder

`buildChromecastProfile(caps)` returns a Jellyfin `DeviceProfile`:

- **Video codecs:** `h264` always; `hevc` only when `caps.hevc`. When `hevc` is
  enabled but `caps.hevc10bit` is false, add a codec condition rejecting 10-bit so the
  server transcodes 10-bit sources down.
- **Audio:** both `DirectPlayProfiles` and `CodecProfiles` constrained to
  `caps.maxAudioChannels`. This forces multichannel audio to transcode to stereo —
  fixes the 5.1 crash (#1085). The current profiles only constrain `CodecProfiles`,
  leaving a direct-play path open.
- **Bitrate:** `MaxStreamingBitrate` / `MaxStaticBitrate` = `caps.maxVideoBitrate`.
- **Resolution:** codec condition capping height at `caps.maxResolution`.
- Subtitle and container profiles preserved from the current working profile.

## 7. Unified cast load

```ts
loadCastMedia({
  client,        // RemoteMediaClient
  device,        // Cast Device — for capability detection
  api, item, userId,
  settings,
  options: { audioStreamIndex?, subtitleStreamIndex?, maxBitrate?, mediaSourceId?, startPositionMs? },
}): Promise<{ ok: true } | { ok: false; error }>
```

Sequence:

1. `detectCapabilities(device, settings)` → `buildChromecastProfile`.
2. `getStreamUrl` with the built profile.
3. `buildCastMediaInfo`.
4. `client.loadMedia`.

Replaces all three duplicated call sites. Bug fixes folded in:

- **Audio index:** when `options.audioStreamIndex` is absent, resolve the media
  source's `DefaultAudioStreamIndex` (or the first `Audio`-type stream) instead of
  defaulting to `0`.
- **Media source:** pass and honour `mediaSourceId`; select the matching
  `MediaSource` rather than `[0]`.
- **PlaySessionId:** use the real `PlaySessionId` returned by `getStreamUrl`'s
  `getPlaybackInfo` call, not `contentId`.

## 8. Settings

Replace `enableH265ForChromecast: boolean` with:

| Setting | Type | Default |
|---|---|---|
| `chromecastProfile` | `"auto" \| "force-hevc" \| "force-h264"` | `"auto"` |
| `chromecastMaxBitrate` | `number \| undefined` | `undefined` |

**Migration:** existing `enableH265ForChromecast === true` → `chromecastProfile:
"force-hevc"`; `false` or unset → `"auto"`.

UI: a profile-mode selector and an optional max-bitrate field in the Chromecast
settings screen. `"auto"` is presented as the recommended default; the overrides are
advanced controls.

## 9. Resilience

- **Downgrade-on-failure:** if `client.loadMedia` rejects with status 2100, retry
  exactly once with a forced conservative profile (`force-h264`, 2 channels, low
  bitrate). Handles unknown / mis-detected devices gracefully. A second failure
  surfaces to the user.
- **User-visible errors:** a failed load shows an alert with an actionable message
  instead of a silent `console.error`.

## 10. Verification — test matrix

A document, `docs/chromecast-test-matrix.md`, lists sample-file casting tests run
against the Chromecast HD test device:

| Dimension | Values |
|---|---|
| Video codec | H.264, HEVC 8-bit, HEVC 10-bit |
| Audio | AAC stereo, AAC 5.1, AC3 5.1, DTS, TrueHD |
| Container | MP4, MKV, TS |
| Bitrate | low, ~8 Mb/s, ~16 Mb/s, source-max |

Each row records: direct-play vs transcode, load result (OK / 2100 / infinite), notes.
Results calibrate `CONSERVATIVE.maxVideoBitrate` and confirm the true cause of #1423
and the 5.1 crash before the conservative defaults are finalised.

## 11. Success criteria

- A movie that previously failed with 2100 plays on the Chromecast HD.
- 5.1 / multichannel media plays (transcoded to stereo) without crashing.
- High-bitrate media plays or transcodes cleanly within the calibrated limit.
- Audio track defaults to the correct (non-video) stream.
- The Jellyfin dashboard shows a correctly correlated cast session.
- The load sequence exists in exactly one place.
- `bun run typecheck` and `bun run check` pass.

## 12. Risks

- The true cause of #1423 / the 5.1 crash is not yet confirmed; the test matrix
  (§10) is the gate before defaults are locked. If the cause is HLS handling rather
  than a profile mismatch, the design extends with a targeted fix at that point.
- `modelName` ambiguity limits registry precision — mitigated by the conservative
  default never producing an unplayable stream.
