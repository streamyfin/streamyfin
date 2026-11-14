# A Cast Receiver Switch Ends the Old Session First, and Says So Differently on Each Platform

**Date**: 2026-11-04
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/target/RemoteTarget.kt`, `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/target/GoogleCastTargetPort.kt`, `modules/mpv-player/ios/Cast/RemoteTarget.swift`, `modules/mpv-player/ios/Cast/GoogleCastTargetPort.swift`

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
connecting, with no error. A refusal of the asked receiver before that end keeps the old one, with
the cause; a disconnection drops the switch. An end that names another receiver than the one
connecting, connected or ending is ignored, since nothing promises the old end arrives before the
new start.

**Asking back for the receiver a switch is leaving** (the last request wins) is where the two SDKs
part again. iOS: the end is already asked for, so the port starts that receiver again once it comes.
Android: the old route cannot be selected again until the SDK is done with the old session. When a
session ends, the SDK's cleanup checks whether that session's route is the selected one and, if so,
selects the default route (logcat: `SessionManagerImpl: Select default route from route with the
selected route ID`). It decides after the session listeners have run and applies it a moment later.
Selected before the end, or inside `onSessionEnded`, the old route was unselected again right after
and nothing started (bench, 04/11, twice). The port holds the request until that session's end and
selects the route on the next main loop turn; the receiver then connects in about 2 s.

Also seen on the iOS simulator: right after a relaunch the SDK resumes its last session about
2 s in. A connection asked in that window races the resume: the state follows the SDK's events
(it can show the resumed receiver before the asked one) and ends on the asked receiver, and the
old receiver keeps its app open since no stop was sent.
