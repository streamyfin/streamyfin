# Trickplay memory OOM fix (Android TV)

**Status:** Planning — not yet implemented.
**Branch to work on:** `develop` (originally diagnosed on `fix/auto-skip-stop`).
**Related files:** `hooks/useTrickplay.ts`, `components/video-player/controls/TrickplayBubble.tsx`, `components/video-player/controls/SliderScrubbter.tsx`, `components/video-player/controls/Controls.tv.tsx`, `components/video-player/controls/Controls.tsx`, `app/_layout.tsx`, `utils/scaleSize.ts`.

## TL;DR

Streamyfin was killed by the Android kernel's **lowmemorykiller (LMK)** during playback — an OOM, not a code crash. The trigger is the trickplay (scrubbing preview) pipeline: on player mount we decode **every** trickplay sprite sheet for the whole item into memory, even though each decoded sheet (~23 MB) is larger than the entire 8 MB in-memory image cap on TV, so they're decoded and immediately evicted in a churn loop. Fix: prefetch to **disk only**, prefetch only the **neighborhood** of the current playhead, add **cancellation**, and tighten the bubble render path on TV. Plus: the trickplay preview icons render too large on Android TV — route their sizes through `scaleSize()` and trim the base constant.

## The crash (evidence)

From `logcat` on an Amlogic 4K Android TV box (display `2160p60hz`, ~1–2 GB RAM):

```
lowmemorykiller: Kill 'com.fredrikburmester.streamyfin' (30683), uid 10118, oom_score_adj 0
  to free 538508kB rss, 480220kB swap;
  reason: min watermark is breached and swap is low (32kB < 64808kB)
…
ActivityManager: Process com.fredrikburmester.streamyfin (pid 30683) has died: fg TOP
ActivityTaskManager: Force removing ActivityRecord{…/.MainActivity …}: app died, no saved state
```

- `oom_score_adj 0` → the app was the foreground/top process. LMK only kills TOP as a last resort.
- ~538 MB RSS + ~480 MB swap ≈ **1 GB** held by the app when it was killed.
- Swap was exhausted (32 KB left of a ~64 MB floor). LMK had already killed `com.google.android.ext.services` and `com.google.android.apps.mediashell` seconds earlier; Streamyfin was next.
- Killed with `signal 9 (Killed)` — no native fault, no Java exception. The SELinux `avc: denied { getattr } for … dev="dmabuf"` lines in the same log are a **red herring**: benign statfs denials, unrelated to the kill.

Right before the kill, the app was loading trickplay tiles into memory:

```
Glide: Finished loading BitmapDrawable from MEMORY_CACHE for
  …/Videos/054383b5…/Trickplay/320/0.jpg   (and /1.jpg, /2.jpg, …)
```

## Root cause: decode-then-evict death spiral

The existing memory cap in `app/_layout.tsx:109-118` is correct and was added for exactly this class of OOM:

```ts
Image.configureCache({
  maxMemoryCost: Platform.isTV
    ? 8 * 1024 * 1024            // ~8 MB on TV
    : 128 * 1024 * 1024,         // ~128 MB on mobile
  maxDiskSize: 200 * 1024 * 1024,
});
```

But trickplay defeats it:

1. **Every trickplay sheet is huge.** A `/Trickplay/320/` sheet is a sprite atlas of 320 px-wide tiles (Jellyfin default 10×10 → ~3200×1800 px). Decoded to ARGB8888 that's **~23 MB per sheet** — nearly 3× the 8 MB cap. No sheet can ever live in the memory cache; each is decoded then immediately LRU-evicted.

2. **`prefetchAllTrickplayImages` decodes all of them on mount** (`hooks/useTrickplay.ts:64-83`), invoked unconditionally (`Controls.tv.tsx:377`, `Controls.tsx:140`):

   ```ts
   (url) => Image.prefetch(url).catch(() => {}),
   ```

   No cache policy is passed. `Image.prefetch` defaults to `"memory-disk"`. Every **other** prefetch in the codebase passes `"disk"` explicitly to avoid this — `Home.tv.tsx:147`, `TVHeroCarousel.tsx:264`, `TVActorPage.tsx:161`. Trickplay is the one that forgot. For a long movie (~20 sheets) at `maxConcurrent = 4`, you get ~4 sheets (~92 MB) decoded simultaneously, each instantly evicted by the 8 MB cap — pure allocator churn that inflates RSS toward the 538 MB seen in the crash.

3. **No cancellation.** The `for` loop keeps launching batches after the player unmounts, so backing out mid-prefetch doesn't stop the decodes.

4. **The render path double-dips.** `TrickplayBubble.tsx:86` and `SliderScrubbter.tsx:90` use `cachePolicy='memory-disk'`. Since each decoded sheet exceeds the cap, this buys nothing on TV and forces pointless insert/evict cycles on every scrub.

## The plan (three tiers + icon sizing)

Tier 1 is the fix that stops the OOM. Tier 2 trims steady-state memory. Tier 3 is a smaller, more cosmetic tightening. Implement **all three**, plus the `scaleSize` icon-sizing item at the end.

### Tier 1 — disk-only prefetch + cancellation + TV concurrency  *(the real fix)*

**File:** `hooks/useTrickplay.ts` — rewrite `prefetchAllTrickplayImages` (lines 64-83).

- Pass `"disk"`: `Image.prefetch(url, "disk")`. Prefetch now just downloads the JPEG; decode happens lazily, one sheet at a time, only when the bubble renders.
- Add an `isCancelled` flag (closure ref). Check it before each batch and before each `Promise.all` so unmount stops queuing. expo-image's `prefetch` returns a `Promise<void>` with no built-in abort, so cancellation = stop launching new batches; in-flight ones are tolerated.
- Drop `maxConcurrent` on TV to ~2 (keep 4 on mobile). Disk-only prefetch is cheap, but lower concurrency bounds transient RSS during the download/decode-to-disk pass.

Sketch:

```ts
const prefetchAllTrickplayImages = useCallback(async () => {
  if (!trickplayInfo || !item.Id) return;
  const maxConcurrent = Platform.isTV ? 2 : 4;
  const urls: string[] = [];
  for (let index = 0; index < trickplayInfo.totalImageSheets; index++) {
    const url = getTrickplayUrl(item, index);
    if (url) urls.push(url);
  }
  let cancelled = false;
  cancelRef.current = () => { cancelled = true; };   // new ref
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    if (cancelled) return;
    const batch = urls.slice(i, i + maxConcurrent);
    await Promise.all(batch.map((url) => Image.prefetch(url, "disk").catch(() => {})));
    await Promise.resolve();
  }
}, [trickplayInfo, item, getTrickplayUrl]);
```

Expose `cancelRef` (or return a cancel function) and call it from the player's cleanup `useEffect`, alongside the existing `prefetchAllTrickplayImages()` call in `Controls.tv.tsx:376-378` and `Controls.tsx:139-141`. Alternative if you don't want to plumb a cancel function: capture an `isMounted` boolean in the `useEffect` and bail between batches — simpler, slightly less prompt.

**Files touched:** `hooks/useTrickplay.ts`, `components/video-player/controls/Controls.tv.tsx`, `components/video-player/controls/Controls.tsx`.
**Risk:** Low. Disk-cached sheets still decode on render; scrubbing responsiveness is unchanged because the decode happens at render time from local disk. Verify scrubbing still feels instant on TV.

### Tier 2 — neighborhood prefetch *(stop paying for sheets the user will never view)*

**File:** `hooks/useTrickplay.ts` — replace "prefetch all on mount" with on-demand neighborhood prefetch.

- On scrub start, prefetch only the **current sheet ± 1** (disk-only). Adjacent sheets are already on disk, so a scrub across a sheet boundary is still instant; you just stop decoding the entire runtime upfront.
- Approach: expose a `prefetchAround(progress)` that computes `sheetIndex` for the current progress (reuse `calculateTrickplayTile`) and prefetches `[sheetIndex - 1, sheetIndex, sheetIndex + 1]` clamped to `[0, totalImageSheets)`.
- Call it from the scrub handlers in `Controls.tv.tsx` (the `calculateTrickplayUrl(msToTicks(newPosition))` cluster around lines 700-963) on scrub start / first move, and keep the mount-time prefetch either removed or reduced to the current sheet only.
- Keep Tier 1's cancellation and disk-only policy.

**Files touched:** `hooks/useTrickplay.ts`, `components/video-player/controls/Controls.tv.tsx` (and `Controls.tsx` if you want parity on mobile — optional).
**Risk:** Medium — touches the scrub interaction. Must confirm scrubbing across sheet boundaries doesn't stutter because the next sheet wasn't prefetched far enough ahead. If it does, widen the window to ±2.

### Tier 3 — `cachePolicy='disk'` on TV for the bubble render path

**Files:** `components/video-player/controls/TrickplayBubble.tsx:86`, `components/video-player/controls/SliderScrubbter.tsx:90`.

Since each decoded sheet already exceeds the 8 MB TV cap, `memory-disk` buys nothing on TV. Gate by platform:

```ts
// TrickplayBubble.tsx
import { Platform } from "react-native";
…
cachePolicy={Platform.isTV ? "disk" : "memory-disk"}
```

Mobile keeps `memory-disk` (128 MB cap — sheets can actually fit there and scrubbing benefits).

**Risk:** Low. On TV the memory cache was never retaining these anyway.

---

## Icon sizing: route trickplay bubble sizes through `scaleSize()`

**Problem:** the trickplay preview is reported "a bit big on Android TV." Current sizing is hardcoded constants, and `BASE_IMAGE_SCALE` was already bumped 1.4 → 1.6 (`TrickplayBubble.tsx:7-9`), which made it larger.

**Tool:** `utils/scaleSize.ts` normalizes against a 1920×1080 reference:

```ts
const widthRatio = W / 1920;
const heightRatio = H / 1080;
return size * Math.min(widthRatio, heightRatio);
```

**⚠️ Caveat:** on a display that reports exactly 1920×1080 (common for Android TVs that render the UI at 1080p even on a 4K panel), `scaleSize(x) === x` — a no-op. So fixing "too big" requires **both** routing sizes through `scaleSize` (for cross-resolution consistency) **and** trimming the base constants (for the actual size reduction). Measure on the target box: log `Dimensions.get("window")` first to know which lever is doing the work.

**Hardcoded values to convert** (all in `components/video-player/controls/TrickplayBubble.tsx`, plus `constants.ts`):

- `CONTROLS_CONSTANTS.TILE_WIDTH = 150` — `components/video-player/controls/constants.ts:5` (shared; gating TV vs mobile here keeps mobile untouched).
- `BASE_IMAGE_SCALE = 1.6` — `TrickplayBubble.tsx:9` (candidate to drop back toward 1.4 on TV).
- `BUBBLE_LEFT_OFFSET = 62` — `TrickplayBubble.tsx:10`.
- `BUBBLE_WIDTH_MULTIPLIER = 1.5` — `TrickplayBubble.tsx:11`.
- Overlay text sizes: `fontSize: 7` (chapter) and `fontSize: 8` (timestamp) at `TrickplayBubble.tsx:127, 137` — these will look wrong if the bubble scales but the text doesn't. Route them through `scaleSize` too for proportionality, or leave fixed if they should stay tiny.

**Approach:** compute scaled constants once at module/instance scope, e.g.:

```ts
const TILE_W = scaleSize(150);          // e.g. try 140 as the base on TV
const BASE_IMAGE_SCALE = Platform.isTV ? 1.4 : 1.6;
const BUBBLE_LEFT_OFFSET = scaleSize(62);
const BUBBLE_WIDTH_MULTIPLIER = 1.5;
```

Then use `TILE_W` in place of `CONTROLS_CONSTANTS.TILE_WIDTH` inside `TrickplayBubble.tsx` (lines 49-50, 67, 77, 88-91). Leave the mobile `SliderScrubbter.tsx` path on its hardcoded `150` unless you want parity — its complaint was TV-specific.

**Note:** the bubble uses `transform: [{ scale: finalScale }]` on the inner View and translate offsets in tile units, so changing `tileWidth` rescales the whole bubble and its positioning consistently. Verify the bubble stays centered over the scrub thumb after resizing.

## Verification plan (next session)

1. **Repro the baseline first** on the same TV box (long movie with trickplay enabled, /Trickplay/320/). Capture: `adb logcat | grep -E "lowmemorykiller|com.fredrikburmester.streamyfin"` and note the RSS/swap figures before fixing.
2. **After Tier 1:** repeat. Expect the `Kill … to free … kB rss` figure for Streamyfin to drop sharply (prefetch no longer decodes into memory). Scrub the full bar — confirm preview still appears instantly.
3. **After Tier 2:** scrub across sheet boundaries slowly and quickly; confirm no stutter. Confirm `adb logcat` doesn't show the LMK kill under the same repro.
4. **After Tier 3 + icon sizing:** visually confirm the bubble is smaller and centered; confirm mobile is unchanged.
5. **Memory sniff:** `adb shell dumpsys meminfo com.fredrikburmester.streamyfin` while scrubbing — watch `TOTAL` and `Graphics` before/after.

The LMK line to watch for (absence = success):

```
lowmemorykiller: Kill 'com.fredrikburmester.streamyfin' … reason: … swap is low
```

## Out of scope / considered

- **Video decoder footprint.** The crash log showed ~75 MB of `BufferPoolAccessor2.0` buffers plus decoded HEVC frames for the live decode (`C2VdecComponent` / `VDA` teardown). This is inherent to MediaCodec playback on Amlogic and not reducible from JS. If OOMs persist after the trickplay fix, this is the next lever (e.g. capping max streaming bitrate / resolution on low-RAM TV) — but trickplay is the clear first target given the evidence.
- **API key in cached URLs.** `generateTrickplayUrl` (`utils/trickplay.ts:64`) embeds `?ApiKey=…` in the URL that gets disk-cached. Pre-existing pattern, not related to this OOM. Not touched here.
- **Mobile behavior.** Intentionally preserved (128 MB cap, `memory-disk`, concurrency 4). All TV-specific tightening is gated behind `Platform.isTV`.

## File map

| File | Role |
|---|---|
| `hooks/useTrickplay.ts` | Tiers 1 + 2 — prefetch policy, cancellation, neighborhood. Core of the fix. |
| `components/video-player/controls/TrickplayBubble.tsx` | Tier 3 (`cachePolicy`) + icon sizing (`scaleSize`). TV bubble. |
| `components/video-player/controls/SliderScrubbter.tsx` | Tier 3 (`cachePolicy`) on mobile — keep `memory-disk`. |
| `components/video-player/controls/constants.ts` | `TILE_WIDTH` source — gate TV/mobile if you scale here. |
| `components/video-player/controls/Controls.tv.tsx` | Call site for prefetch (376-378) + scrub handlers (700-963) for Tier 2. |
| `components/video-player/controls/Controls.tsx` | Mobile prefetch call site (139-141). |
| `app/_layout.tsx` | Existing memory cap (109-118) — already correct, leave as-is. |
| `utils/scaleSize.ts` | The scaling helper (1920×1080 reference). |
