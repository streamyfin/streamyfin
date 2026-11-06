# Losing the Surface Drops mpv's Video Track, and the Refresh Seek Can Crawl From Byte 0

**Date**: 2026-11-05
**Category**: native-modules
**Key files**: `modules/mpv-player/android/.../MPVLayerRenderer.kt` (`detachSurface`),
`OffscreenSurfaceSink.kt`

## Detail

When the SurfaceView's surface is destroyed (screen lock, app backgrounded, a PiP
window torn down by a lock), detaching it from mpv makes the gpu-next VO fail to
reinitialize ("Missing surface pointer"), and the core deselects the video track
("Video: no video"). Every track change is followed by a refresh seek to the
current position. In a downloaded MKV with no usable seek index that seek starts
at byte 0 and hr-seeks forward to the position, decoding everything in between:

```
[file:v] stream level seek from 654858566 to 5949
[cplayer:v] hr-seek, skipping to 8656.443617
```

Logged on a Galaxy S25 Edge (Android 17), 2h22 into a 3h podcast: about 20 s of
silence after the lock, and the same again when the surface came back, so the
lock screen widget and the PiP window showed a spinner for as long as it took.
The cost grows with the position, which is why a test a minute into a file never
showed it, and an emulator (software decode) seemed fine.

Fix: never leave mpv without a surface while it runs. `detachSurface` attaches
an `OffscreenSurfaceSink` (an ImageReader that drops every frame) in place of
the real surface, so the VO and the video track survive and the only seek is a
short hop near the position. The sink is kept until `stop()`: closing it right
after the real surface returns could pull it away under a frame in flight.

Turning the track off on purpose is different: `vid=no` set while the VO is
healthy deselects the stream with no seek at all, and setting the id back costs
only a short hop near the position (measured on the same file, 2h52 in). That is
what the "Audio only when screen is off" setting does, a few seconds after the
surface goes; it is the VO failure, not the deselect itself, that seeks.

## Symptom pattern

Background audio stops (AudioTrack `state:paused`, not muted, the foreground
service still running) and the media session shows buffering; it recovers by
itself after a delay that grows with how far into the file playback is.
