# The MPV View's First Progress Tick Says 0:00

**Date**: 2026-10-04
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/MPVLayerRenderer.kt`, `modules/mpv-player/ios/MPVLayerRenderer.swift`, `utils/directPlayer/sessionPosition.ts`, `app/(auth)/player/direct-player.tsx`

## Detail

On both platforms `MPVLayerRenderer` emits a position from the `duration` property change as well as from `time-pos`, and the duration event carries the renderer's position cache. That cache used to be 0 until the first `time-pos` arrived (or still the previous file's position after an in-place load), so a session that resumes at 19 minutes got a first tick at position 0, before MPV had decoded a frame. `load()` now seeds the cache from `startPosition`. The renderer is shared by the inline `MpvPlayerView` and the native player's engine, so both see the seeded value.

In the JS player that tick used to be taken at face value. It zeroed the tracked position, was reported to the server as progress (the first tick always passes the interval check) and was written to the route as `playbackPosition`. Leaving the player before the first real tick then sent the stop report at 0, and Jellyfin clears the resume point of an item stopped below its minimum resume percentage.

The JS player keeps its own guard, because it also hosts the ExoPlayer engine and relays whatever `time-pos` mpv reports first. `isPlaceholderTick` drops a tick at 0 on a session that starts further in, a seek made before the first position is recorded by the page's `seek` as the position, and every report reads its position through `resolveSessionPositionTicks`: the start position until MPV has reported one for the current stream, the tracked position afterwards. "Current stream" is the stream object, not its URL: a refetch takes the view off screen and the one that comes back loads from the start position again, even when the URL is unchanged (a downloaded file, a remote path). Do not read `progress.get()` directly for a report or for the position a stream is re-negotiated from. Before the first real tick it holds the reset value or whatever the controls seeded for the scrubber.

The route must also be opened without a position when the caller has none (`toDirectPlayerQuery`). A `playbackPosition` of 0 means "start at the beginning", so defaulting to it made a top shelf play link or a remote Play command skip the resume point, which no amount of care in the reports can put back.

The native player's JS session (`NativePlayerProvider`) is seeded from `startTicks` and its view model from the stream's start position, but the view model takes the renderer's ticks as authoritative, so it was fed the same 0 before the cache was seeded.
