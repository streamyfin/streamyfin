# ExoPlayer LoadControl: the veto fix, the heap it shares, and the pool recipe

**Date**: 2026-10-02 (updated 2026-11-05: OOM rerun evidence, pool shipped)
**Category**: native-modules
**Key files**: `modules/exoplayer-player/android/src/main/java/expo/modules/exoplayerplayer/ExoPlayerView.kt`, `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/nativeplayer/engine/ExoPlayerEngine.kt`

## Detail

ExoPlayer direct play buffered randomly on LAN, and the native chrome's
engine pinned `cacheSeconds` at ~0.x until a seek. Root cause: media3 1.10.1
`DefaultLoadControl.shouldContinueLoading` with
`prioritizeTimeOverSizeThresholds=false` (media3's default — the original
mapping never set it). There, a reached `targetBufferBytes` vetoes loading
even below the resume floor. With a 150/75 MB byte target and a 30-50s
retained back buffer counting against the same allocator, streams at
≳20 Mbps kept the veto permanently on once the forward buffer drained —
buffer stuck at ~0.x until a seek discarded back-buffer bytes (media3 logs
"Target buffer size reached with less than 500ms of buffered media data" in
that state). Pausing accelerated it: the idle connection dies while paused,
and on resume the drained buffer met a vetoed loader.

**Shipped fix** (both engines, lockstep): `setPrioritizeTimeOverSizeThresholds(true)`
— below `minBufferMs` loading is then forced on regardless of bytes, making
the stuck-at-0.x state impossible.

## The heap is the constraint the old byte target was hiding

**Crucial follow-up**: the same prioritize=false byte target was ALSO the
silent cap on total allocator memory. ExoPlayer's `DefaultAllocator` byte[]
segments live in the app's Java heap (256 MB growth limit on this Acer
Amlogic box — `dumpsys dropbox` showed two `OutOfMemoryError ... target
footprint 268435456` crashes ~1.5–3 min into playback). With the veto
disabled and a 50s retained back buffer restored, total allocator memory
became bitrate × (forward 10s + back 50s): ~337 MB at 45 Mbps → OOM. The
back buffer is now `BACK_BUFFER_MS = 10_000` (10s forward + 10s back ≈
160 MB at 64 Mbps worst case). Never lengthen it without a binding byte
target.

**Shipped 2026-11-05** — the deferred pool went in after the OOM came back
with evidence that pins it. Values: `TARGET_BUFFER_BYTES = 100663296`
(96 MiB), `MIN_BUFFER_MS = 5_000`, `MAX_BUFFER_MS = 30_000`,
`BACK_BUFFER_MS = 3_000`.

Evidence (logcat, ~100-150 Mbps Dolby Vision remux, direct play through the
reverse proxy): heap filled 35 → 255 MB in the first ~12 s of playback
(~19 MB/s of LIVE heap — each GC freed only KBs), then every thread OOM'd.
The failing allocations were `65548` bytes — exactly a DefaultAllocator
64 KiB segment — and on player release one GC freed `3550(235MB) LOS
objects`: the allocator pool was ~92% of the whole heap. With
min == max = 10s and no byte target, allocator memory ≈ bitrate × 20s, so
anything ≳100 Mbps needs more heap than the 256 MB limit.

Two failure surfaces for the same disease:
- Loader thread OOM → Loader wraps it in `UnexpectedLoaderException` →
  ExoPlaybackException SOURCE error → JS sees `error_code_io_unspecified`;
  playback dies, process survives (allocator freed on release).
- Any OTHER thread OOMs first (observed: RN's OkHttp dispatcher inside
  WebView's `ForwardingCookieHandler.get` — RN routes every fetch's cookies
  through the WebView CookieManager) → uncaught OOM → Chromium's
  `JniAndroid.handleException` rethrows → `FATAL EXCEPTION` → process
  killed. An app crash whose only stack is `GURL.<init>` / cookie code is a
  heap-exhaustion symptom, not a WebView bug.

Why `BACK_BUFFER_MS = 3_000` and not the 10s the first fix shipped with:
the byte target only gates NEW loads; back-buffer RETENTION is purely
time-gated in media3 (SampleQueue back policy), so at 10s the retained back
buffer alone was ~120-190 MB on this file and no byte target capped it.
Worst case now ≈ bitrate × (back 3s + min floor 5s): ~150 MB at 150 Mbps,
and under the 96 MiB target for anything up to ~96 Mbps. Longer backwards
seeks re-fetch over the LAN.

Known trade: where the byte target binds in-band, the forward buffer saws
between ~min and the byte ceiling (buffered≈0 dips at speed 1.0 that
recover on their own) — accepted over OOM; revisit only if dips become
visible stalls.

Still open from the deferred list: a 10s `DefaultHttpDataSource` read
timeout (8s default is too eager; a >10s silent gap on LAN means a dead
connection — tear down and re-open with Range). 128 MiB pool was tried
earlier and rejected: half the heap.

Crash triage: `logcat -b crash` is often EMPTY after a reboot even when
crashes happened — `adb shell dumpsys dropbox --print data_app_crash`
persists them (full stack, process runtime). A process that dies with
`DeadObjectException` + `Sending signal. PID ... SIG: 9` and no crash entry
is a kill, not a crash.

**⚠ TWIN**: the LoadControl constants live duplicated in both files (the
Kotlin modules are independent). The original bug survived in one copy after
being fixed in the other — change them in lockstep.
