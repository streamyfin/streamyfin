# The Track Player's Queue Is Not the App's Queue, and iOS `add` Rejects Like `skip`

**Date**: 2026-10-06
**Category**: native-modules
**Key files**: `providers/MusicPlayerProvider.tsx`, `utils/music/nativeQueue.ts`, `node_modules/react-native-track-player/ios/RNTrackPlayer/RNTrackPlayer.swift`

## Detail

`MusicPlayerProvider` keeps the whole queue in state, and the native queue only holds the part of it that has been loaded:

- `loadAndPlayQueue` resets the native queue to the one track that was tapped, then `loadRemainingTracksInBackground` adds the rest with a network round trip per track. The tracks before the tapped one go in as one batch at index 0 once all of them are prepared, so until then even the loaded tracks sit at other indexes than on screen.
- A queue restored after a restart is in state only. `resume` loads the one track it stopped on, and nothing loads the others.
- `toggleShuffle` reorders the state queue and leaves the native one alone.

So an index into the state queue does not address the native queue. Resolve the track by id against `TrackPlayer.getQueue()` right before the call, with `nativeIndexOf` and `nativeInsertIndexFor`.

On iOS the rejection message does not name the call. `rejectWhenTrackIndexOutOfBounds` is shared:

| Message | Raised by |
| --- | --- |
| `The track index is out of bounds` | `skip(index)`, `updateMetadataForTrack`, and `add(track, index)` when `index` is past the end |
| `One or more of the indexes were out of bounds.` | `remove` only |
| `The fromIndex is out of bounds` / `The toIndex is out of bounds` | `move` |

Sentry REACT-NATIVE-AW (`The track index is out of bounds`, no stack) read as a `skip` and was mostly an `add`: `jumpToIndex` inserted a track that was not loaded yet at its state index. Android words these differently (`MusicModule.kt`), so match on the platform before reading a message.

The player actions are typed as returning nothing and screens fire them from press handlers, so any rejection inside one is an unhandled rejection with no JS stack.
