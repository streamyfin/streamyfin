# An Ended Cast Session Forgets Its Id

**Date**: 2026-11-03
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/engine/CastEngine.kt`, `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/engine/GoogleCastPorts.kt`, `modules/mpv-player/ios/Cast/CastEngine.swift`

## Detail

On Android (play-services-cast-framework 22.3.1), `CastSession.getSessionId()` answers null once
the SDK has ended the session. It showed after a suspend the SDK could not resume: a sender
whose Wi-Fi came back about 20 s after it was cut, past the SDK's reconnect window, got the
suspend, then `onSessionEnded` on a session that no longer had an id. The session port reads
the id from the session object, so the end arrived with null.

The Cast engine matched the end against the id it read from its bound session, null by then
too, and returned early: it never lost its binding, kept the player on a session that was gone
and logged `detached from session null` when the player closed.

The engine keeps the id it bound with (`boundSessionId`) and matches suspend, end, resume and
bus readiness against it, on both platforms. A `GCKSession` (google-cast-sdk 4.8) was not seen
doing the same: iOS follows by parity, and the stored id equals the live one while the session
lives. Anything else that needs a session's id after it ended has to keep it from before.
