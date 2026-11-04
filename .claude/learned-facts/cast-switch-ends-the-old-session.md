# A Cast Receiver Switch Ends the Old Session First, and Says So Differently on Each Platform

**Date**: 2026-11-04
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/target/RemoteTarget.kt`, `modules/mpv-player/ios/Cast/RemoteTarget.swift`, `modules/mpv-player/ios/Cast/GoogleCastTargetPort.swift`

## Detail

Moving a cast from one receiver to another is two sessions, the old one ended before the new one
starts, and neither SDK reports it as a switch.

- **iOS (google-cast-sdk 4.8)**: `GCKSessionManager.startSession(with:)` answers NO while a
  session is established (`GCKSessionManager.h`). The target port ends the running session with
  `endSessionAndStopCasting(true)` and starts the asked receiver once the SDK reports the end.
  Asking straight away left the old receiver playing and the published state at none.
- **Android (play-services-cast-framework 22.3.1)**: selecting another route makes the SDK end
  the old session itself, with status code **2155**, then start the new one. 2155 is also what
  a network loss ends a session with (the emulator's network cut, seen the same day), so the
  status cannot tell a switch from a failure.

Only the request does: `RemoteTargetMachine` remembers the receiver asked for over a live session
(`switchingTo`), and the old session's end, whatever its status, leads to the asked receiver,
connecting, with no error. A refusal of the asked receiver before that end keeps the old one; a
disconnection drops the switch. An end that names another receiver than the one connecting or
connected is ignored, since nothing promises the old end arrives before the new start.

Also seen on the iOS simulator: right after a relaunch the SDK resumes its last session about
2 s in. A connection asked in that window races the resume: the state follows the SDK's events
(it can show the resumed receiver before the asked one) and ends on the asked receiver, and the
old receiver keeps its app open since no stop was sent.
