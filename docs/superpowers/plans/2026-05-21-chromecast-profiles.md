# Chromecast Device Profiles & Capability Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two static Chromecast device profiles with per-device capability detection and a unified cast-load path, so casting stops crashing (status 2100, 5.1 audio, high bitrate) on all Chromecast generations.

**Architecture:** A pure capability registry maps `device.modelName` to a `ChromecastCapabilities` object, falling back to a conservative baseline (H.264 / 1080p / 2-channel). A pure builder turns capabilities into a Jellyfin `DeviceProfile`. A single `loadCastMedia()` function owns the `getStreamUrl → buildCastMediaInfo → loadMedia` sequence, with a downgrade-on-failure retry. Three duplicated call sites are rewired to it.

**Tech Stack:** TypeScript (strict), React Native / Expo, `@jellyfin/sdk`, `react-native-google-cast`, Jotai. Tests use Bun's native test runner (`bun test`) — no new dependency.

**Spec:** `docs/superpowers/specs/2026-05-21-chromecast-profiles-design.md`

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `utils/casting/capabilities.ts` | Capability type, conservative default, model registry, `detectCapabilities()` | 1 |
| `utils/casting/capabilities.test.ts` | Unit tests for capability detection | 1 |
| `utils/casting/buildProfile.ts` | `buildChromecastProfile()` → `DeviceProfile` | 2 |
| `utils/casting/buildProfile.test.ts` | Unit tests for the profile builder | 2 |
| `utils/atoms/settings.ts` | New `chromecastProfile` + `chromecastMaxBitrate` settings | 3 |
| `utils/casting/castErrors.ts` | `isLoadFailedError()` — pure error classifier | 4 |
| `utils/casting/castErrors.test.ts` | Unit tests for the error classifier | 4 |
| `utils/casting/castLoad.ts` | Unified `loadCastMedia()` | 4 |
| `utils/casting/mediaInfo.ts` | `buildCastMediaInfo()` gains `playSessionId` | 4 |
| `components/PlayButton.tsx` | Rewired to `loadCastMedia()` | 5 |
| `app/(auth)/casting-player.tsx` | `reloadWithSettings` / `loadEpisode` rewired | 5 |
| `hooks/useCasting.ts` | Progress reporting reads real `playSessionId` | 5 |
| `utils/profiles/chromecast.ts`, `chromecasth265.ts` | **Deleted** | 5 |
| `components/settings/ChromecastSettings.tsx` | Profile-mode dropdown + max-bitrate field | 6 |
| `docs/chromecast-test-matrix.md` | Manual cast verification matrix | 7 |

---

## Task 1: Capability model, conservative default & registry

**Files:**
- Create: `utils/casting/capabilities.ts`
- Test: `utils/casting/capabilities.test.ts`

- [ ] **Step 1: Write the failing test**

Create `utils/casting/capabilities.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  CONSERVATIVE_CAPABILITIES,
  detectCapabilities,
} from "./capabilities";

describe("detectCapabilities", () => {
  test("unknown device falls back to the conservative baseline", () => {
    const caps = detectCapabilities(
      { modelName: "Some Unknown TV" },
      { profileMode: "auto" },
    );
    expect(caps).toEqual(CONSERVATIVE_CAPABILITIES);
  });

  test("null device falls back to the conservative baseline", () => {
    const caps = detectCapabilities(null, { profileMode: "auto" });
    expect(caps).toEqual(CONSERVATIVE_CAPABILITIES);
  });

  test('plain "Chromecast" (gen 1/2/3) gets the conservative baseline', () => {
    const caps = detectCapabilities(
      { modelName: "Chromecast" },
      { profileMode: "auto" },
    );
    expect(caps.hevc).toBe(false);
    expect(caps.maxResolution).toBe(1080);
    expect(caps.maxAudioChannels).toBe(2);
  });

  test("Chromecast Ultra is recognised with HEVC + 4K", () => {
    const caps = detectCapabilities(
      { modelName: "Chromecast Ultra" },
      { profileMode: "auto" },
    );
    expect(caps.hevc).toBe(true);
    expect(caps.maxResolution).toBe(2160);
  });

  test('"force-h264" override disables HEVC even on a capable device', () => {
    const caps = detectCapabilities(
      { modelName: "Chromecast Ultra" },
      { profileMode: "force-h264" },
    );
    expect(caps.hevc).toBe(false);
    expect(caps.hevc10bit).toBe(false);
  });

  test('"force-hevc" override enables HEVC on the conservative baseline', () => {
    const caps = detectCapabilities(
      { modelName: "Chromecast" },
      { profileMode: "force-hevc" },
    );
    expect(caps.hevc).toBe(true);
  });

  test("maxBitrate override clamps but never raises the bitrate", () => {
    const lowered = detectCapabilities(
      { modelName: "Chromecast" },
      { profileMode: "auto", maxBitrate: 3_000_000 },
    );
    expect(lowered.maxVideoBitrate).toBe(3_000_000);

    const raised = detectCapabilities(
      { modelName: "Chromecast" },
      { profileMode: "auto", maxBitrate: 999_000_000 },
    );
    expect(raised.maxVideoBitrate).toBe(CONSERVATIVE_CAPABILITIES.maxVideoBitrate);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test utils/casting/capabilities.test.ts`
Expected: FAIL — `Export named 'detectCapabilities' not found` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `utils/casting/capabilities.ts`:

```ts
/**
 * Chromecast device capability detection.
 *
 * The Cast SDK exposes a device's `modelName` but no codec-level capability API.
 * We map known model names to a capability profile and fall back to a conservative
 * baseline (H.264 / 1080p / stereo) for anything unrecognised — a baseline that
 * cannot produce an unplayable stream on any Cast receiver.
 */

/** Profile selection mode, surfaced as an advanced setting. */
export type ChromecastProfileMode = "auto" | "force-hevc" | "force-h264";

export interface ChromecastCapabilities {
  /** HEVC 8-bit (Main profile) decode support. */
  hevc: boolean;
  /** HEVC 10-bit (Main10) decode support. */
  hevc10bit: boolean;
  /** Maximum video resolution height. */
  maxResolution: 1080 | 2160;
  /** Maximum video bitrate in bits per second. */
  maxVideoBitrate: number;
  /** Maximum audio channels the receiver can output. */
  maxAudioChannels: number;
}

/** Minimal shape we need from the Cast SDK `Device` — keeps this module import-free. */
interface DeviceLike {
  modelName?: string;
}

/** Overrides derived from user settings. */
export interface CapabilityOverrides {
  profileMode: ChromecastProfileMode;
  /** Optional manual cap in bits per second. */
  maxBitrate?: number;
}

/**
 * Baseline for a 1st/2nd/3rd-gen Chromecast and any unrecognised device.
 * `maxVideoBitrate` is an initial estimate — see docs/chromecast-test-matrix.md.
 */
export const CONSERVATIVE_CAPABILITIES: ChromecastCapabilities = {
  hevc: false,
  hevc10bit: false,
  maxResolution: 1080,
  maxVideoBitrate: 8_000_000,
  maxAudioChannels: 2,
};

/** Known Cast devices keyed by `Device.modelName`. Unlisted models stay conservative. */
const CHROMECAST_REGISTRY: Record<string, ChromecastCapabilities> = {
  "Chromecast Ultra": {
    hevc: true,
    hevc10bit: false,
    maxResolution: 2160,
    maxVideoBitrate: 20_000_000,
    maxAudioChannels: 6,
  },
  "Chromecast with Google TV": {
    hevc: true,
    hevc10bit: true,
    maxResolution: 2160,
    maxVideoBitrate: 20_000_000,
    maxAudioChannels: 6,
  },
  "Google TV Streamer": {
    hevc: true,
    hevc10bit: true,
    maxResolution: 2160,
    maxVideoBitrate: 25_000_000,
    maxAudioChannels: 8,
  },
};

/**
 * Resolve the effective capabilities for a Cast device.
 * Registry lookup → conservative fallback → user overrides applied last.
 */
export const detectCapabilities = (
  device: DeviceLike | null,
  overrides: CapabilityOverrides,
): ChromecastCapabilities => {
  const base =
    (device?.modelName && CHROMECAST_REGISTRY[device.modelName]) ||
    CONSERVATIVE_CAPABILITIES;

  const caps: ChromecastCapabilities = { ...base };

  if (overrides.profileMode === "force-hevc") {
    caps.hevc = true;
  } else if (overrides.profileMode === "force-h264") {
    caps.hevc = false;
    caps.hevc10bit = false;
  }

  if (overrides.maxBitrate && overrides.maxBitrate > 0) {
    caps.maxVideoBitrate = Math.min(caps.maxVideoBitrate, overrides.maxBitrate);
  }

  return caps;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test utils/casting/capabilities.test.ts`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add utils/casting/capabilities.ts utils/casting/capabilities.test.ts
git commit -m "feat(casting): add Chromecast capability detection"
```

---

## Task 2: Profile builder

**Files:**
- Create: `utils/casting/buildProfile.ts`
- Test: `utils/casting/buildProfile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `utils/casting/buildProfile.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildChromecastProfile } from "./buildProfile";
import { CONSERVATIVE_CAPABILITIES } from "./capabilities";

describe("buildChromecastProfile", () => {
  test("conservative caps produce an H.264-only video codec list", () => {
    const profile = buildChromecastProfile(CONSERVATIVE_CAPABILITIES);
    const videoCodecProfile = profile.CodecProfiles?.find(
      (c) => c.Type === "Video",
    );
    expect(videoCodecProfile?.Codec).toBe("h264");
  });

  test("HEVC-capable caps include hevc in the video codec list", () => {
    const profile = buildChromecastProfile({
      ...CONSERVATIVE_CAPABILITIES,
      hevc: true,
    });
    const videoCodecProfile = profile.CodecProfiles?.find(
      (c) => c.Type === "Video",
    );
    expect(videoCodecProfile?.Codec).toContain("hevc");
  });

  test("maxVideoBitrate drives MaxStreamingBitrate", () => {
    const profile = buildChromecastProfile({
      ...CONSERVATIVE_CAPABILITIES,
      maxVideoBitrate: 5_000_000,
    });
    expect(profile.MaxStreamingBitrate).toBe(5_000_000);
  });

  test("maxAudioChannels constrains transcoding profiles", () => {
    const profile = buildChromecastProfile(CONSERVATIVE_CAPABILITIES);
    const videoTranscode = profile.TranscodingProfiles?.find(
      (p) => p.Type === "Video",
    );
    expect(videoTranscode?.MaxAudioChannels).toBe("2");
  });

  test("non-10bit HEVC caps add a video bit-depth condition", () => {
    const profile = buildChromecastProfile({
      ...CONSERVATIVE_CAPABILITIES,
      hevc: true,
      hevc10bit: false,
    });
    const videoCodecProfile = profile.CodecProfiles?.find(
      (c) => c.Type === "Video",
    );
    const bitDepthCondition = videoCodecProfile?.Conditions?.find(
      (cond) => cond.Property === "VideoBitDepth",
    );
    expect(bitDepthCondition).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test utils/casting/buildProfile.test.ts`
Expected: FAIL — `Export named 'buildChromecastProfile' not found`.

- [ ] **Step 3: Write the implementation**

Create `utils/casting/buildProfile.ts`:

```ts
import type {
  DeviceProfile,
  ProfileCondition,
} from "@jellyfin/sdk/lib/generated-client/models";
import type { ChromecastCapabilities } from "./capabilities";

/**
 * Build a Jellyfin `DeviceProfile` for a Chromecast from its detected capabilities.
 * Replaces the former static `chromecast.ts` / `chromecasth265.ts` profiles.
 */
export const buildChromecastProfile = (
  caps: ChromecastCapabilities,
): DeviceProfile => {
  const videoCodecs = caps.hevc ? "hevc,h264" : "h264";
  const maxHeight = caps.maxResolution === 2160 ? "2160" : "1080";
  const maxChannels = String(caps.maxAudioChannels);

  const videoConditions: ProfileCondition[] = [
    {
      Condition: "LessThanEqual",
      Property: "Height",
      Value: maxHeight,
      IsRequired: false,
    },
  ];
  // When HEVC is allowed but 10-bit is not, force the server to transcode
  // 10-bit sources down to 8-bit.
  if (caps.hevc && !caps.hevc10bit) {
    videoConditions.push({
      Condition: "LessThanEqual",
      Property: "VideoBitDepth",
      Value: "8",
      IsRequired: false,
    });
  }

  return {
    Name: "Chromecast Video Profile",
    MaxStreamingBitrate: caps.maxVideoBitrate,
    MaxStaticBitrate: caps.maxVideoBitrate,
    MusicStreamingTranscodingBitrate: 384000,
    CodecProfiles: [
      {
        Type: "Video",
        Codec: videoCodecs,
        Conditions: videoConditions,
      },
      {
        Type: "Audio",
        Codec: "aac,mp3,flac,opus,vorbis",
        // Force transcode of multichannel audio the receiver cannot output.
        Conditions: [
          {
            Condition: "LessThanEqual",
            Property: "AudioChannels",
            Value: maxChannels,
            IsRequired: false,
          },
        ],
      },
    ],
    ContainerProfiles: [],
    DirectPlayProfiles: [
      {
        Container: caps.hevc ? "mp4,mkv" : "mp4",
        Type: "Video",
        VideoCodec: videoCodecs,
        AudioCodec: "aac,mp3,opus,vorbis",
      },
      { Container: "mp3", Type: "Audio" },
      { Container: "aac", Type: "Audio" },
      { Container: "flac", Type: "Audio" },
      { Container: "wav", Type: "Audio" },
    ],
    TranscodingProfiles: [
      {
        Container: "ts",
        Type: "Video",
        VideoCodec: videoCodecs,
        AudioCodec: "aac,mp3",
        Protocol: "hls",
        Context: "Streaming",
        MaxAudioChannels: maxChannels,
        MinSegments: 2,
        BreakOnNonKeyFrames: true,
      },
      {
        Container: "mp3",
        Type: "Audio",
        AudioCodec: "mp3",
        Protocol: "http",
        Context: "Streaming",
        MaxAudioChannels: maxChannels,
      },
      {
        Container: "aac",
        Type: "Audio",
        AudioCodec: "aac",
        Protocol: "http",
        Context: "Streaming",
        MaxAudioChannels: maxChannels,
      },
    ],
    SubtitleProfiles: [{ Format: "vtt", Method: "Encode" }],
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test utils/casting/buildProfile.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Verify types**

Run: `bun run typecheck`
Expected: PASS — no errors.

- [ ] **Step 6: Commit**

```bash
git add utils/casting/buildProfile.ts utils/casting/buildProfile.test.ts
git commit -m "feat(casting): add Chromecast device profile builder"
```

---

## Task 3: Settings — add new fields (additive)

**Files:**
- Modify: `utils/atoms/settings.ts`

This task is purely additive. `enableH265ForChromecast` is left in place until Task 6, so type-checking stays green throughout.

- [ ] **Step 1: Add the new fields to the `Settings` type**

In `utils/atoms/settings.ts`, find this line (around line 183):

```ts
  enableH265ForChromecast: boolean;
```

Replace it with:

```ts
  enableH265ForChromecast: boolean;
  /** Chromecast profile selection mode. "auto" detects per device. */
  chromecastProfile: ChromecastProfileMode;
  /** Optional manual Chromecast video bitrate cap, in bits per second. */
  chromecastMaxBitrate?: number;
```

- [ ] **Step 2: Import the `ChromecastProfileMode` type**

At the top of `utils/atoms/settings.ts`, with the other imports, add:

```ts
import type { ChromecastProfileMode } from "@/utils/casting/capabilities";
```

- [ ] **Step 3: Add defaults**

In `utils/atoms/settings.ts`, find this line in `defaultValues` (around line 274):

```ts
  enableH265ForChromecast: false,
```

Replace it with:

```ts
  enableH265ForChromecast: false,
  chromecastProfile: "auto",
  chromecastMaxBitrate: undefined,
```

- [ ] **Step 4: Verify types**

Run: `bun run typecheck`
Expected: PASS — no errors.

- [ ] **Step 5: Commit**

```bash
git add utils/atoms/settings.ts
git commit -m "feat(casting): add chromecastProfile and chromecastMaxBitrate settings"
```

---

## Task 4: Unified `loadCastMedia()`

**Files:**
- Create: `utils/casting/castErrors.ts`, `utils/casting/castLoad.ts`
- Test: `utils/casting/castErrors.test.ts`
- Modify: `utils/casting/mediaInfo.ts`

- [ ] **Step 1: Add `playSessionId` to `buildCastMediaInfo`**

In `utils/casting/mediaInfo.ts`, find the parameter object of `buildCastMediaInfo`:

```ts
  /** Set true for live TV streams to use MediaStreamType.LIVE. */
  isLive?: boolean;
}) => {
```

Replace it with:

```ts
  /** Set true for live TV streams to use MediaStreamType.LIVE. */
  isLive?: boolean;
  /** Jellyfin PlaySessionId, embedded in customData for progress reporting. */
  playSessionId?: string;
}) => {
```

- [ ] **Step 2: Destructure and embed `playSessionId`**

In `utils/casting/mediaInfo.ts`, find the function signature opening:

```ts
export const buildCastMediaInfo = ({
  item,
  streamUrl,
  api,
  contentType,
  isLive = false,
}: {
```

Replace it with:

```ts
export const buildCastMediaInfo = ({
  item,
  streamUrl,
  api,
  contentType,
  isLive = false,
  playSessionId,
}: {
```

Then find the `slimCustomData` declaration:

```ts
  const slimCustomData: Partial<BaseItemDto> = {
    Id: item.Id,
```

Replace it with:

```ts
  const slimCustomData: Partial<BaseItemDto> & { playSessionId?: string } = {
    playSessionId,
    Id: item.Id,
```

- [ ] **Step 3: Write the failing test**

Create `utils/casting/castErrors.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { isLoadFailedError } from "./castErrors";

describe("isLoadFailedError", () => {
  test("recognises a status 2100 error message", () => {
    const error = new Error(
      "java.lang.Exception: Media control channel status code 2100",
    );
    expect(isLoadFailedError(error)).toBe(true);
  });

  test("returns false for unrelated errors", () => {
    expect(isLoadFailedError(new Error("network timeout"))).toBe(false);
  });

  test("handles non-Error values without throwing", () => {
    expect(isLoadFailedError("status code 2100")).toBe(true);
    expect(isLoadFailedError(null)).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `bun test utils/casting/castErrors.test.ts`
Expected: FAIL — `Cannot find module './castErrors'`.

- [ ] **Step 5: Create the error classifier**

Create `utils/casting/castErrors.ts`:

```ts
/**
 * Cast load error classification. Kept dependency-free so it is unit-testable
 * without pulling React Native modules into the test runtime.
 */

/** True when an error is a Cast "LOAD_FAILED" (status 2100) rejection. */
export const isLoadFailedError = (error: unknown): boolean => {
  if (error == null) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("2100");
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun test utils/casting/castErrors.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 7: Write `loadCastMedia`**

Create `utils/casting/castLoad.ts`:

```ts
/**
 * Unified Chromecast media loading.
 *
 * Owns the getStreamUrl → buildCastMediaInfo → loadMedia sequence that was
 * previously duplicated across PlayButton and the casting player. Builds the
 * device profile from detected capabilities and retries once with a forced
 * conservative profile when the receiver rejects the initial load (status 2100).
 */

import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { RemoteMediaClient } from "react-native-google-cast";
import { buildChromecastProfile } from "@/utils/casting/buildProfile";
import {
  type ChromecastProfileMode,
  detectCapabilities,
} from "@/utils/casting/capabilities";
import { isLoadFailedError } from "@/utils/casting/castErrors";
import { buildCastMediaInfo } from "@/utils/casting/mediaInfo";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";

export interface CastLoadOptions {
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  maxBitrate?: number;
  mediaSourceId?: string;
  startPositionMs?: number;
}

export interface CastLoadParams {
  client: RemoteMediaClient;
  /** Cast device — only `modelName` is read, for capability detection. */
  device: { modelName?: string } | null;
  api: Api;
  item: BaseItemDto;
  userId: string;
  profileMode: ChromecastProfileMode;
  /** Manual bitrate cap from settings, in bits per second. */
  maxBitrateSetting?: number;
  options?: CastLoadOptions;
}

export type CastLoadResult = { ok: true } | { ok: false; error: unknown };

/**
 * Resolve the default audio stream index for an item.
 * Fixes the previous `audioStreamIndex = 0` default, which selected the video stream.
 */
export const resolveDefaultAudioIndex = (
  item: BaseItemDto,
  mediaSourceId?: string,
): number | undefined => {
  const source = mediaSourceId
    ? item.MediaSources?.find((s) => s.Id === mediaSourceId)
    : item.MediaSources?.[0];
  if (source?.DefaultAudioStreamIndex != null) {
    return source.DefaultAudioStreamIndex;
  }
  const audio =
    item.MediaStreams?.find((s) => s.Type === "Audio" && s.IsDefault) ??
    item.MediaStreams?.find((s) => s.Type === "Audio");
  return audio?.Index ?? undefined;
};

const attemptLoad = async (
  params: CastLoadParams,
  caps: Parameters<typeof buildChromecastProfile>[0],
): Promise<void> => {
  const { api, item, userId, client, options } = params;
  const profile = buildChromecastProfile(caps);
  const audioStreamIndex =
    options?.audioStreamIndex ??
    resolveDefaultAudioIndex(item, options?.mediaSourceId);
  const startPositionMs = options?.startPositionMs ?? 0;

  const data = await getStreamUrl({
    api,
    item,
    userId,
    startTimeTicks: Math.floor(startPositionMs * 10000),
    deviceProfile: profile,
    audioStreamIndex,
    subtitleStreamIndex: options?.subtitleStreamIndex,
    maxStreamingBitrate: options?.maxBitrate,
    mediaSourceId: options?.mediaSourceId,
  });

  if (!data?.url) {
    throw new Error("getStreamUrl returned no URL");
  }

  await client.loadMedia({
    mediaInfo: buildCastMediaInfo({
      item,
      streamUrl: data.url,
      api,
      playSessionId: data.sessionId ?? undefined,
    }),
    startTime: startPositionMs / 1000,
  });
};

/**
 * Load media onto the connected Chromecast.
 * On a status-2100 rejection, retries once with a forced conservative profile.
 */
export const loadCastMedia = async (
  params: CastLoadParams,
): Promise<CastLoadResult> => {
  const caps = detectCapabilities(params.device, {
    profileMode: params.profileMode,
    maxBitrate: params.maxBitrateSetting,
  });

  try {
    await attemptLoad(params, caps);
    return { ok: true };
  } catch (error) {
    if (!isLoadFailedError(error)) {
      return { ok: false, error };
    }
    // Downgrade-on-failure: one retry with the safest possible profile.
    try {
      const fallback = detectCapabilities(params.device, {
        profileMode: "force-h264",
      });
      await attemptLoad(params, {
        ...fallback,
        maxVideoBitrate: 4_000_000,
        maxAudioChannels: 2,
      });
      return { ok: true };
    } catch (retryError) {
      return { ok: false, error: retryError };
    }
  }
};
```

- [ ] **Step 8: Verify types**

Run: `bun run typecheck`
Expected: PASS — no errors.

- [ ] **Step 9: Commit**

```bash
git add utils/casting/castErrors.ts utils/casting/castErrors.test.ts utils/casting/castLoad.ts utils/casting/mediaInfo.ts
git commit -m "feat(casting): add unified loadCastMedia with downgrade-on-failure"
```

---

## Task 5: Rewire call sites & remove old profiles

**Files:**
- Modify: `components/PlayButton.tsx`
- Modify: `app/(auth)/casting-player.tsx`
- Modify: `hooks/useCasting.ts`
- Delete: `utils/profiles/chromecast.ts`, `utils/profiles/chromecasth265.ts`

- [ ] **Step 1: Rewire `PlayButton.tsx` imports**

In `components/PlayButton.tsx`, find these import lines (around lines 36-38):

```ts
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { chromecast } from "@/utils/profiles/chromecast";
import { chromecasth265 } from "@/utils/profiles/chromecasth265";
```

Replace them with:

```ts
import { loadCastMedia } from "@/utils/casting/castLoad";
```

> If `getStreamUrl` is still used elsewhere in `PlayButton.tsx`, keep its import.
> Verify with: `grep -n "getStreamUrl" components/PlayButton.tsx` — if Step 2 removes
> the only use, the import above is correctly dropped.

- [ ] **Step 2: Replace the cast-load block in `PlayButton.tsx`**

In `components/PlayButton.tsx`, replace the entire block from `// Check if user wants H265 for Chromecast` through the closing of its `try`/`catch` (currently lines ~141-219) with:

```tsx
                if (!api || !user?.Id || !item?.Id) {
                  console.warn("Missing parameters for Chromecast streaming");
                  Alert.alert(
                    t("player.client_error"),
                    t("player.missing_parameters"),
                  );
                  return;
                }

                const startPositionMs =
                  (item.UserData?.PlaybackPositionTicks ?? 0) / 10000;

                const result = await loadCastMedia({
                  client,
                  device: castDevice,
                  api,
                  item,
                  userId: user.Id,
                  profileMode: settings.chromecastProfile,
                  maxBitrateSetting: settings.chromecastMaxBitrate,
                  options: {
                    audioStreamIndex: selectedOptions.audioIndex,
                    subtitleStreamIndex: selectedOptions.subtitleIndex,
                    maxBitrate: selectedOptions.bitrate?.value,
                    mediaSourceId: selectedOptions.mediaSource?.Id,
                    startPositionMs,
                  },
                });

                if (!result.ok) {
                  console.error("[PlayButton] cast load failed:", result.error);
                  Alert.alert(
                    t("player.client_error"),
                    t("player.could_not_create_stream_for_chromecast"),
                  );
                  return;
                }

                if (!isOpeningCurrentlyPlayingMedia) {
                  router.push("/casting-player");
                }
```

> `castDevice` must be available in this scope. If `PlayButton.tsx` does not already
> call `useCastDevice()`, add `const castDevice = useCastDevice();` with the other
> cast hooks near the top of the component, and import `useCastDevice` from
> `react-native-google-cast`. Verify the existing cast imports with:
> `grep -n "react-native-google-cast" components/PlayButton.tsx`.

- [ ] **Step 3: Verify `PlayButton.tsx` types**

Run: `bun run typecheck`
Expected: PASS for `PlayButton.tsx`. (Errors in `casting-player.tsx` are expected until Step 5.)

- [ ] **Step 4: Rewire `casting-player.tsx` imports**

In `app/(auth)/casting-player.tsx`, find these import lines (around lines 55-57):

```ts
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { chromecast } from "@/utils/profiles/chromecast";
import { chromecasth265 } from "@/utils/profiles/chromecasth265";
```

Replace them with:

```ts
import { loadCastMedia } from "@/utils/casting/castLoad";
```

> Keep the `getStreamUrl` import only if `grep -n "getStreamUrl" app/(auth)/casting-player.tsx`
> shows uses outside `reloadWithSettings` / `loadEpisode`.

- [ ] **Step 5: Replace `reloadWithSettings` body**

In `app/(auth)/casting-player.tsx`, replace the body of the `reloadWithSettings`
`useCallback` (the `try { ... } catch { ... }` block, currently lines ~294-341) with:

```tsx
      try {
        const currentPosition = mediaStatus?.streamPosition ?? 0;

        let resolvedSubtitleIndex: number | undefined;
        if (options.subtitleIndex === undefined) {
          resolvedSubtitleIndex = selectedSubtitleTrackIndex ?? undefined;
        } else if (options.subtitleIndex === null) {
          resolvedSubtitleIndex = -1;
        } else {
          resolvedSubtitleIndex = options.subtitleIndex;
        }

        const result = await loadCastMedia({
          client: remoteMediaClient,
          device: castDevice,
          api,
          item: currentItem,
          userId: user.Id,
          profileMode: settings.chromecastProfile,
          maxBitrateSetting: settings.chromecastMaxBitrate,
          options: {
            audioStreamIndex:
              options.audioIndex ?? selectedAudioTrackIndex ?? undefined,
            subtitleStreamIndex: resolvedSubtitleIndex,
            maxBitrate: options.bitrateValue,
            startPositionMs: currentPosition * 1000,
          },
        });

        if (!result.ok) {
          console.error("[Casting Player] Failed to reload stream:", result.error);
        }
      } catch (error) {
        console.error("[Casting Player] Failed to reload stream:", error);
      }
```

Then update the `useCallback` dependency array of `reloadWithSettings`: remove
`settings.enableH265ForChromecast` and add `settings.chromecastProfile`,
`settings.chromecastMaxBitrate`, and `castDevice`. The array becomes:

```tsx
    [
      api,
      user?.Id,
      currentItem,
      remoteMediaClient,
      castDevice,
      mediaStatus?.streamPosition,
      settings.chromecastProfile,
      settings.chromecastMaxBitrate,
      selectedAudioTrackIndex,
      selectedSubtitleTrackIndex,
    ],
```

- [ ] **Step 6: Replace `loadEpisode` body**

In `app/(auth)/casting-player.tsx`, replace the body of the `loadEpisode`
`useCallback` (the `try { ... } catch { ... }` block, currently lines ~360-391) with:

```tsx
      try {
        const startPositionMs =
          (episode.UserData?.PlaybackPositionTicks ?? 0) / 10000;

        const result = await loadCastMedia({
          client: remoteMediaClient,
          device: castDevice,
          api,
          item: episode,
          userId: user.Id,
          profileMode: settings.chromecastProfile,
          maxBitrateSetting: settings.chromecastMaxBitrate,
          options: { startPositionMs },
        });

        if (!result.ok) {
          console.error(
            "[Casting Player] Failed to load episode:",
            result.error,
          );
          return;
        }

        setSelectedAudioTrackIndex(null);
        setSelectedSubtitleTrackIndex(null);
      } catch (error) {
        console.error("[Casting Player] Failed to load episode:", error);
      }
```

Then update the `loadEpisode` dependency array: remove
`settings.enableH265ForChromecast`, add `settings.chromecastProfile`,
`settings.chromecastMaxBitrate`, `castDevice`. The array becomes:

```tsx
    [
      api,
      user?.Id,
      remoteMediaClient,
      castDevice,
      settings.chromecastProfile,
      settings.chromecastMaxBitrate,
    ],
```

> `castDevice` must exist in `casting-player.tsx`. If it does not, add
> `const castDevice = useCastDevice();` near the other cast hooks and import
> `useCastDevice` from `react-native-google-cast`. Verify with:
> `grep -n "useCastDevice\|react-native-google-cast" app/(auth)/casting-player.tsx`.

- [ ] **Step 7: Fix `PlaySessionId` in `useCasting.ts`**

In `hooks/useCasting.ts`, the progress reporting uses `mediaStatus?.mediaInfo?.contentId`
as `PlaySessionId` in two places (`reportPlaybackStart` and `reportPlaybackProgress`).
Add this helper near the top of the `useCasting` function body, after the hooks:

```ts
  // Real Jellyfin PlaySessionId, embedded in customData by buildCastMediaInfo.
  const playSessionId =
    (mediaStatus?.mediaInfo?.customData as { playSessionId?: string } | undefined)
      ?.playSessionId ?? mediaStatus?.mediaInfo?.contentId;
```

Then replace both occurrences of:

```ts
            PlaySessionId: mediaStatus?.mediaInfo?.contentId,
```

with:

```ts
            PlaySessionId: playSessionId,
```

Add `playSessionId` to the dependency array of the progress-reporting `useEffect`
(replace `mediaStatus?.mediaInfo?.contentId` in that array with `playSessionId`).

- [ ] **Step 8: Delete the old profile files**

```bash
git rm utils/profiles/chromecast.ts utils/profiles/chromecasth265.ts
```

- [ ] **Step 9: Verify types and lint**

Run: `bun run typecheck`
Expected: PASS — no errors.

Run: `bun run check`
Expected: PASS — no errors.

> If typecheck reports a remaining import of the deleted profile files, find it with
> `grep -rn "profiles/chromecast" --include="*.ts" --include="*.tsx" .` and remove it.

- [ ] **Step 10: Commit**

```bash
git add components/PlayButton.tsx "app/(auth)/casting-player.tsx" hooks/useCasting.ts utils/profiles/
git commit -m "refactor(casting): route all cast loads through loadCastMedia"
```

---

## Task 6: Settings UI & remove `enableH265ForChromecast`

**Files:**
- Modify: `components/settings/ChromecastSettings.tsx`
- Modify: `utils/atoms/settings.ts`

- [ ] **Step 1: Rewrite `ChromecastSettings.tsx`**

Replace the entire contents of `components/settings/ChromecastSettings.tsx` with:

```tsx
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { View } from "react-native";
import type { ChromecastProfileMode } from "@/utils/casting/capabilities";
import { useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";

const PROFILE_LABELS: Record<ChromecastProfileMode, string> = {
  auto: "Automatic (recommended)",
  "force-hevc": "Force HEVC / H265",
  "force-h264": "Force H264",
};

export const ChromecastSettings: React.FC = ({ ...props }) => {
  const { settings, updateSettings } = useSettings();

  const profileOptions = useMemo(
    () => [
      {
        options: (
          ["auto", "force-hevc", "force-h264"] as ChromecastProfileMode[]
        ).map((mode) => ({
          type: "radio" as const,
          label: PROFILE_LABELS[mode],
          value: mode,
          selected: (settings.chromecastProfile ?? "auto") === mode,
          onPress: () => updateSettings({ chromecastProfile: mode }),
        })),
      },
    ],
    [settings.chromecastProfile, updateSettings],
  );

  return (
    <View {...props}>
      <ListGroup title={"Chromecast"}>
        <ListItem
          title={"Profile"}
          subtitle={
            "Automatic picks codecs per device. Override only if needed."
          }
        >
          <PlatformDropdown
            groups={profileOptions}
            title={"Chromecast profile"}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {PROFILE_LABELS[settings.chromecastProfile ?? "auto"]}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
```

> The max-bitrate setting (`chromecastMaxBitrate`) is intentionally not surfaced in
> the UI yet — it has no numeric-input ListItem pattern in this codebase, and the
> spec calibrates the conservative default via the test matrix first. The setting
> exists and is honoured by `loadCastMedia`; a UI control for it belongs to a later
> UX sub-project.

- [ ] **Step 2: Remove `enableH265ForChromecast` from the settings type**

In `utils/atoms/settings.ts`, find:

```ts
  enableH265ForChromecast: boolean;
  /** Chromecast profile selection mode. "auto" detects per device. */
  chromecastProfile: ChromecastProfileMode;
```

Replace it with:

```ts
  /** Chromecast profile selection mode. "auto" detects per device. */
  chromecastProfile: ChromecastProfileMode;
```

- [ ] **Step 3: Remove the `enableH265ForChromecast` default**

In `utils/atoms/settings.ts`, find:

```ts
  enableH265ForChromecast: false,
  chromecastProfile: "auto",
```

Replace it with:

```ts
  chromecastProfile: "auto",
```

- [ ] **Step 4: Verify no readers remain**

Run: `grep -rn "enableH265ForChromecast" --include="*.ts" --include="*.tsx" .`
Expected: no matches (outside `node_modules`).

- [ ] **Step 5: Verify types and lint**

Run: `bun run typecheck`
Expected: PASS — no errors.

Run: `bun run check`
Expected: PASS — no errors.

- [ ] **Step 6: Commit**

```bash
git add components/settings/ChromecastSettings.tsx utils/atoms/settings.ts
git commit -m "feat(casting): replace H265 toggle with Chromecast profile selector"
```

---

## Task 7: Test matrix document

**Files:**
- Create: `docs/chromecast-test-matrix.md`

- [ ] **Step 1: Create the test matrix**

Create `docs/chromecast-test-matrix.md`:

```markdown
# Chromecast Cast Test Matrix

Manual verification for the device-profile work. Run each row by casting the
matching media from the app to a physical Chromecast and recording the result.

**Test device:** ___________________  (model name as reported by the app)
**App build / commit:** ___________________
**Date:** ___________________

## How to run

1. Pick a library item matching the row's codec / audio / container.
2. Cast it. Note whether it direct-plays or transcodes (server logs show
   `Video is being transcoded` vs `Video is being direct played`).
3. Record the load result: OK / 2100 / infinite-loading / other.

## Matrix

| # | Video codec | Audio | Container | Approx bitrate | Direct/Transcode | Result | Notes |
|---|---|---|---|---|---|---|---|
| 1 | H.264 1080p | AAC stereo | MP4 | ~4 Mb/s | | | |
| 2 | H.264 1080p | AAC stereo | MKV | ~8 Mb/s | | | |
| 3 | H.264 1080p | AAC 5.1 | MKV | ~8 Mb/s | | | |
| 4 | H.264 1080p | AC3 5.1 | MKV | ~10 Mb/s | | | |
| 5 | H.264 1080p | DTS 5.1 | MKV | ~12 Mb/s | | | |
| 6 | H.264 1080p | TrueHD 7.1 | MKV | ~20 Mb/s | | | |
| 7 | H.264 1080p | AAC stereo | MP4 | ~16 Mb/s | | | |
| 8 | H.264 1080p | AAC stereo | MP4 | source-max | | | |
| 9 | HEVC 8-bit | AAC stereo | MKV | ~10 Mb/s | | | |
| 10 | HEVC 10-bit | AAC stereo | MKV | ~15 Mb/s | | | |

## Outcome

- Highest video bitrate that loads reliably on the test device: ___________
  → update `CONSERVATIVE_CAPABILITIES.maxVideoBitrate` in
  `utils/casting/capabilities.ts` accordingly.
- Confirmed cause of issue #1423 (≤ 2 Mb/s): ___________
- Confirmed cause of the 5.1 crash (#1085): ___________
- Cases where downgrade-on-failure retry rescued playback: ___________
```

- [ ] **Step 2: Commit**

```bash
git add docs/chromecast-test-matrix.md
git commit -m "docs(casting): add Chromecast cast test matrix"
```

---

## Final verification

- [ ] **Run the full check suite**

Run: `bun test utils/casting/`
Expected: PASS — all `utils/casting/*.test.ts` suites pass. (Scope to the
`utils/casting/` path — the repo's unrelated legacy `ThemedText-test.tsx` uses
Jest APIs and is not part of this work.)

Run: `bun run typecheck`
Expected: PASS — no errors.

Run: `bun run check`
Expected: PASS — no errors.

- [ ] **Manual verification**

Follow `docs/chromecast-test-matrix.md` on the Chromecast HD test device. The
previously failing movie (status 2100) must now play. Record results and, if
needed, adjust `CONSERVATIVE_CAPABILITIES.maxVideoBitrate` and commit that change.

---

## Notes for the implementer

- **Line numbers drift.** All line numbers are approximate anchors from the spec
  date. Match on the quoted code, not the number.
- **`bun test`** is Bun's built-in runner — no config or dependency needed. It
  resolves `tsconfig.json` path aliases. The three test files only import pure
  modules (no React Native runtime), so they run cleanly under Bun.
- **Out of scope** (do not touch): audio/subtitle/quality track-switching UX, the
  `casting-player.tsx` file split, episode navigation, the custom receiver. These
  are later sub-projects.
- **`getStreamUrl` is not modified.** Spec §7 mentions selecting the requested
  `MediaSource` instead of `[0]`. `loadCastMedia` passes `mediaSourceId` to
  `getStreamUrl`, and Jellyfin's `getPlaybackInfo` returns the requested source —
  the intent is satisfied without editing the shared `getStreamUrl` file. This is
  a deliberate, low-risk deviation.
- After this plan: the queued prep task is reconciling the segment-skip code with
  PR #1367 — separate from this plan.
