# The Cast Session That Launched the Receiver App Stops It at Its End

**Date**: 2026-11-04
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/target/RemoteTargetHub.kt`, `modules/mpv-player/ios/Cast/RemoteTargetHub.swift`, `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/CastModule.kt`, `modules/mpv-player/ios/Cast/CastModule.swift`, `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/CastOptionsProvider.kt`, `components/JellyfinCastStopReporter.tsx`

## Detail

Ending a session without a stop (`SessionManager.endCurrentSession(false)` on Android,
`GCKSessionManager.endSessionAndStopCasting(false)` on iOS) leaves the TV playing only when this
session joined a receiver app that was already running. The session that launched the receiver app
stops it at its end, whatever it asks. The Jellyfin receiver has no part in it: it sets
`disableIdleTimeout` and handles no sender disconnection.

Bench of 2026-11-04, a 3rd gen Chromecast, the Jellyfin receiver, a long movie playing:

- **iOS (google-cast-sdk 4.8, `stopReceiverApplicationWhenEndingSession` true)**: launched by this
  session, then left without a stop: the TV goes back to its idle screen. Joined (another sender
  launched it, or the app was relaunched and its new session joined), then left: it keeps playing,
  and the server keeps receiving its progress every 5 s.
- **Android (emulator API 37, Play Services 26.43, play-services-cast-framework 22.3.1)**: launched,
  then left: idle screen with the option true, with it false, and with
  `MediaRouter.unselect(UNSELECT_REASON_DISCONNECTED)` instead of `endCurrentSession(false)`.
  Joined, then left: it keeps playing with the option false, and stops with it true.
- Google's iOS reference for `endSessionAndStopCasting:` says it from the other side: with one
  sender connected, the receiver stops whatever `stopCasting` says.

Trap on the bench: arming the iOS debug probe relaunches the app, so the probe's session joins the
receiver app the previous process launched. A "the TV keeps playing" run from the probe proves only
the joined case; the launched case needs the probe to start from the TV's idle screen.

## What the app does with it

- The output sheet has one action, "Stop playback": a "Disconnect, the TV keeps playing" button
  would lie in the usual case, where Streamyfin launched the receiver app.
- `disconnect(stopPlayback = false)` stays in the hub for the joined case. The hub remembers it
  (`disconnectedWithoutStop`) until the next connection, and the module marks the `ended` it brings
  with `withoutStop: true`.
- `JellyfinCastStopReporter` no longer takes such an end for a closed receiver: it reports with
  `receiverClosed: false`, so `reportOrphanedReceiverStop` first checks whether the receiver still
  checks in (3 s grace, then 15 s). A TV still playing keeps its server session; a TV that closed
  gets its stop reported about 20 s later instead of at once.
- Android keeps `setStopReceiverApplicationWhenEndingSession(true)`: a switch by route selection
  then stops the old TV, and a joined session's disconnect stops it too, which the reporter's check
  covers.
