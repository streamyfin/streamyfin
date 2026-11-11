# Android 17 Mutes Background Audio Without a Foreground Service

**Date**: 2026-11-05
**Category**: native-modules
**Key files**: `modules/mpv-player/android/.../playback/MediaPlaybackController.kt`,
`PlaybackService.kt`, `MpvPlayerView.kt`, `nativeplayer/MediaSessionController.kt`

## Detail

Android 17's background audio hardening applies to every app, whatever its
target SDK: an app that has no visible activity and runs no foreground service
(other than a short service) has its playback muted, and the audio and volume
APIs fail silently. The system logs it, and only there:

```
W AS.AudioService: AudioHardening background playback muted for com.fredrikburmester.streamyfin (10235), level: partial, reason: 6, usage: USAGE_MEDIA
```

`level: partial` means no foreground service at all; `level: full` means one
runs but without while-in-use capability (enforced for apps targeting API 37).

The mute lands about five seconds after the screen goes off. mpv's clock follows
its audio output, so a muted AudioTrack stalls the whole player: no more
progress ticks, no progress reports, the Jellyfin session drops. The process is
not frozen (`isFrozen=false`, proc state TOP_SLEEPING), which is why battery
settings, the cached apps freezer and wake locks change nothing. It hits
downloaded files and streams alike; a stream also loses its connection.

The surface loss on screen off is NOT the cause: mpv's VO fails, the video track
is deselected ("Video: no video") and audio carries on, and the resume recovery
brings the picture back.

The fix is a `mediaPlayback` foreground service, started while the app is still
visible (the play request), and kept for the player's lifetime, paused included:
starting it again from the background is refused. A start that was refused anyway
(the player attached with the app already in the background) leaves the player
unprotected until the next play, which retries it (`PlaybackService.ensureStarted`). `MpvPlayerView` keeps its
controller across `destroy()` because direct-player reuses the view for the next
episode, possibly with the screen off.

To check: `adb logcat | grep AudioHardening`, or force the behavior with
`adb shell cmd audio set-enable-hardening enable|disable|throw`.

## Symptom pattern

Playback stops a few seconds after the screen turns off and resumes the moment
it comes back on (upstream #1743); no crash, no error in the app's own log.
