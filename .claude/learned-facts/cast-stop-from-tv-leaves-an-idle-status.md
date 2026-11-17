# A Stop From the TV Leaves an Idle Status

**Date**: 2026-11-03
**Category**: native-modules
**Key files**: `hooks/useMusicCastRemote.ts`, `providers/MusicPlayerProvider.tsx`,
`modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/engine/CastEngine.kt`

## Detail

Stopped from the TV's remote (the Stop key of a Google TV Streamer, Jellyfin receiver 1.3.2),
the receiver ends its media session, but on Android (play-services-cast-framework 22.3.1) the
Cast session stays connected and the SDK keeps reporting the last media status: player state
idle, with the media info of the track it stopped on. A `play()` on the remote media client then
does nothing, as there is no media session left to resume. The end of a queue reads the same.

That status reports the stream at 0: the approximate stream position drops from where the item
stopped to 0 (the Cast engine's probe, run 12: paused at 5.4 s, idle at 0.0), while the receiver's
`playbackstop` on the bus still carries the stop position. Whatever replays from there keeps its own
position instead of reading the idle status' one, as the Cast engine does on every idle status.

An idle status that still carries media is therefore not a paused player: whatever offers Play
has to send the item or the queue again, from where it stopped. The music remote calls that
state `stopped` (`useMusicCastRemote`), and `resumeRemote` in `MusicPlayerProvider` casts the
queue again from the track the receiver stopped on.
