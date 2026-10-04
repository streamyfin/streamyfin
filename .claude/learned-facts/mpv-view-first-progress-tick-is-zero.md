# The MPV View's First Progress Tick Says 0:00

**Date**: 2026-10-04
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/MPVLayerRenderer.kt`, `modules/mpv-player/ios/MPVLayerRenderer.swift`, `utils/directPlayer/sessionPosition.ts`, `app/(auth)/player/direct-player.tsx`

## Detail

On both platforms the inline `MpvPlayerView` emits `onProgress` from the `duration` property change as well as from `time-pos`, and the duration event carries the renderer's position cache. That cache is 0 until the first `time-pos` arrives: `load()` does not seed it from `startPosition`. So a session that resumes at 19 minutes gets a first tick at position 0, before MPV has decoded a frame.

In the JS player that tick used to be taken at face value. It zeroed the tracked position, was reported to the server as progress (the first tick always passes the interval check) and was written to the route as `playbackPosition`. Leaving the player before the first real tick then sent the stop report at 0, and Jellyfin clears the resume point of an item stopped below its minimum resume percentage.

`isPlaceholderTick` drops it, and every report reads its position through `resolveSessionPositionTicks`: the start position until MPV has reported one for the current stream URL, the tracked position afterwards. Do not read `progress.get()` directly for a report. Before the first real tick it holds the reset value or whatever the controls seeded for the scrubber.

The native player (`NativePlayerProvider`) is not affected: its session position is seeded from `startTicks` and the view model's position is seeded from the stream's start position.
