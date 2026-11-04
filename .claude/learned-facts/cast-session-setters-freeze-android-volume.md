# Android: CastSession's Volume Setters Freeze the Session's Volume

**Date**: 2026-11-04
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/target/GoogleCastTargetPort.kt`

## Detail

On Android (emulator API 37, Play Services 26.43, play-services-cast-framework 22.3.1), once the
app calls `CastSession.setVolume()` or `CastSession.setMute()`, the session stops following the
receiver: `getVolume()` and `isMute()` keep the values the app set, and `Cast.Listener.onVolumeChanged`
is no longer called when the level or the mute changes elsewhere (another sender, the TV). Seen on
the bench of 2026-11-04 with and without media playing, polled every 2 s for 40 s. Without a local
set, the same session follows every outside change.

The selected MediaRouter route keeps following (`onRouteVolumeChanged` with the new step), and
setting the level through it does not freeze the session:

- **Level**: `router.selectedRoute.requestSetVolume(step)`, the route of the Cast session,
  `volumeMax` steps (20 on a Chromecast). The Cast dialog's slider and the system Output Switcher
  do the same. The published level is still the session's, which keeps its full precision.
- **Mute**: there is no route mute. The app mutes the playing stream,
  `RemoteMediaClient.setStreamMute`, as the SDK's expanded controls do. It silences the media
  without muting the device (`media muted=True`, `device muted=False` on the receiver), needs a
  media session, and the published mute is the device's or the stream's.

iOS has no such freeze: `GCKCastSession.setDeviceVolume` and `setDeviceMuted` keep the session
following outside changes, so iOS sets the device's level and mute.

Also seen: a session that joins a receiver app on iOS starts before the receiver's first status, and
`currentDeviceVolume` reads 0 until then; the level comes with `didReceiveDeviceVolume`. Android reads
the right level at the start.

Phone volume buttons do not change the TV's level during a session on the Android emulator (two
presses, level unchanged); B4 owns them.
