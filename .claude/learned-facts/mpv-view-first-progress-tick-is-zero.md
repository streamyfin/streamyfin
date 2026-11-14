# The MPV View's First Progress Tick Says 0:00

**Date**: 2026-10-04
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/MPVLayerRenderer.kt`, `modules/mpv-player/ios/MPVLayerRenderer.swift`, `utils/nativePlayer/playRequest.ts`

## Detail

On both platforms `MPVLayerRenderer` emits a position from the `duration` property change as well as from `time-pos`, and the duration event carries the renderer's position cache. That cache used to be 0 until the first `time-pos` arrived (or still the previous file's position after an in-place load), so a session that resumes at 19 minutes got a first tick at position 0, before MPV had decoded a frame. `load()` now seeds the cache from `startPosition`. The renderer is shared by the inline `MpvPlayerView` and the native player's engine, so both see the seeded value.

The JS player (since removed) took that tick at face value. It zeroed the tracked position and was reported to the server as progress. Leaving the player before the first real tick then sent the stop report at 0, and Jellyfin clears the resume point of an item stopped below its minimum resume percentage. Anything that reads the renderer's ticks has that exposure.

A play request must also be passed on without a position when the caller has none (`PlayRequest.playbackPositionTicks`). A 0 means "start at the beginning", so defaulting to it made a top shelf play link or a remote Play command skip the resume point, which no amount of care in the reports can put back.

The native player's JS session (`NativePlayerProvider`) is seeded from `startTicks` and its view model from the stream's start position, but the view model takes the renderer's ticks as authoritative, so it was fed the same 0 before the cache was seeded.
