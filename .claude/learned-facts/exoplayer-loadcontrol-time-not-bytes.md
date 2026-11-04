# ExoPlayer LoadControl: the veto fix, the heap it shares, and the pool recipe

**Date**: 2026-10-02
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

**Deferred recipe** if dip-driven buffering resurfaces (buffered≈0 at speed
1.0 in the logs, recovering on its own after refills): a binding byte pool —
`TARGET_BUFFER_BYTES = 100663296` (96 MiB), `MIN_BUFFER_MS = 5_000`,
`MAX_BUFFER_MS = 30_000`. min < max lets the byte target stop loading in
the (min, max) band under prioritize=true, bounding TOTAL allocator memory
≈ 96 MB + floor overshoot while the below-min forced load keeps starvation
impossible. Size the pool ≤ ~40% of the heap growth limit (the allocator
shares the heap with React Native). Also: a 10s `DefaultHttpDataSource`
read timeout (8s default is too eager; a >10s silent gap on LAN means a
dead connection — tear down and re-open with Range). 128 MiB was tried and
rejected: half the heap.

Crash triage: `logcat -b crash` is often EMPTY after a reboot even when
crashes happened — `adb shell dumpsys dropbox --print data_app_crash`
persists them (full stack, process runtime). A process that dies with
`DeadObjectException` + `Sending signal. PID ... SIG: 9` and no crash entry
is a kill, not a crash.

**⚠ TWIN**: the LoadControl constants live duplicated in both files (the
Kotlin modules are independent). The original bug survived in one copy after
being fixed in the other — change them in lockstep.
