# The Native Player Is Still Presented After onDismiss

**Date**: 2026-10-20
**Category**: native-modules
**Key files**: `providers/NativePlayerProvider.tsx`, `modules/mpv-player/ios/NativePlayer/NativePlayerModule.swift`, `modules/mpv-player/ios/NativePlayer/NativePlayerSession.swift`, `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/nativeplayer/NativePlayerModule.kt`, `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/nativeplayer/NativePlayerSession.kt`, `providers/NativePlayerProvider.test.tsx`

## Detail

On iOS, `NativePlayerSession.dismiss` emits `onDismiss` first and clears the module's session only in the completion of the cross-dissolve (`finish` then `onTornDown`, which empties `NativePlayerModule.session`). For those few hundred milliseconds JS has already torn its own session down, `isPresented()` is still true, and `presentPlayer` is refused with `PlayerAlreadyPresentedException`. Android clears its session at the end of the same main-thread pass, after stopping the engine, so its refusal window is that stop. The Android half is read from the code and the spec's double, not observed on a device.

`beginSession` picks between swapping and presenting from the session it reads after the stream negotiation. A swap whose player closed during that round trip (a close tap or the end of the stream racing a quality change, an episode change, a remote Play) used to fall through to a fresh present: Sentry REACT-NATIVE-BR, where all 36 events carried `replace: true`, iPhone, iPad and Apple TV alike. Now the reason the player closed decides, after the negotiation and again after the stop report: closed by its stream ending (`onDismiss` reason `playbackEnded`), a request for another item still plays in a new player; closed any other way, or for the same item, the swap is dropped and logs `NativePlayer swap dropped: the player closed during negotiation`. Every new player first waits, up to `NATIVE_PLAYER_CLOSE_WAIT_MS`, for a closing one to be gone.

Reading a native player trail: `PiP: controller created (possible=true)` followed by `PiP: controller prepared after hosted playback became ready` is logged at every playback start, once the first frame is on screen with picture in picture allowed. Picture in picture starting logs `PiP: will start`, then `PiP: did start = <bool>`, which is false when AVKit failed to start it. Nothing dismisses the iOS player view controller when picture in picture starts (`isPipActive` only swaps the button icon), so the app's own Play buttons are not reachable while it runs.

The same refusal with `replace: false` is a different failure. On Android, a host activity destroyed while the process lives (low memory in the background, a dock event) leaves the module holding a session that no JS session owns, because `onActivityDestroyed` does nothing. Every later present is refused and `usePlayMedia` drops the play until the process dies (issue #2309).
