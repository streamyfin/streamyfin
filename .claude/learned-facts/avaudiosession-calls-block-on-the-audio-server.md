# AVAudioSession Calls Block on the Audio Server

**Date**: 2026-10-06
**Category**: native-modules
**Key files**: `modules/mpv-player/ios/PlayerAudioSession.swift`, `modules/mpv-player/ios/PlayerEngine.swift`, `modules/mpv-player/ios/MPVLayerRenderer.swift`

## Detail

Every `AVAudioSession` call is a synchronous XPC round trip to the audio server. That covers the getters too, not only `setCategory` and `setActive`: `outputNumberOfChannels` alone held the main thread for 3 seconds from a route change notification (Sentry REACT-NATIVE-3G), and `setActive(true)` for up to 8 seconds on Apple TV (REACT-NATIVE-G7). The route change and interruption notifications are delivered on the main thread, so a handler that reads the session is on main unless it hops.

Rules that came out of it:

- Session changes go through `PlayerAudioSession`, which runs them on one serial queue. `modules/mpv-player/src/AudioSession.test.ts` fails if `setActive` or `setCategory` appears anywhere else in the module.
- Order comes from the mpv work queue waiting on that queue (`waitForPendingChanges()`) before `loadfile` and before unpausing. The session has to be in place before mpv opens its audio output, and active before the audio unit restarts.
- The session is still applied on every play(), not once per player session. Other audio code in the process shares it and can deactivate it with no notification: expo-audio's `AudioModule.deactivateSession()` does, 100 ms after its last player pauses (the TV theme music). Pausing and resuming is the recovery, and a "the session is already active" flag takes it away. mpv opening its audio output rewrites the category too, so `current-ao` applies ours again.
- Diagnostic reads get a queue of their own. Sharing the session queue would let a slow read delay the unpause that is waiting on it.
