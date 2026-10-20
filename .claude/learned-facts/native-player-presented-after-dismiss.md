# The Native Player Is Still Presented After onDismiss

**Date**: 2026-10-20
**Category**: native-modules
**Key files**: `providers/NativePlayerProvider.tsx`, `modules/mpv-player/ios/NativePlayer/NativePlayerSession.swift`, `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/nativeplayer/NativePlayerSession.kt`, `providers/NativePlayerProvider.test.tsx`

## Detail

On iOS, `NativePlayerSession.dismiss` emits `onDismiss` first and clears the module's session only in the completion of the cross-dissolve (`finish` then `onTornDown`). For those few hundred milliseconds JS has already torn its own session down, `isPresented()` is still true, and `presentPlayer` is refused with `PlayerAlreadyPresentedException`. Android clears its session at the end of the same main-thread pass, after stopping the engine, so its refusal window is that stop; a request that lands after it is accepted and the player that was just closed opens again. The Android half is read from the code and the spec's double, not observed on a device.

`beginSession` picks between swapping and presenting from the session ref it reads after the stream negotiation. A swap whose player closed during that round trip (a close tap or the end of the stream racing a quality change, an episode change, a remote Play) used to fall through to a fresh present: Sentry REACT-NATIVE-BR, where all 36 events carried `replace: true`, iPhone, iPad and Apple TV alike. Such a swap is now dropped and resolves true, the same rule as the dismiss check after the stop report. The log line `NativePlayer swap dropped: the player closed during negotiation` marks it.

Reading a native player trail: `PiP: controller created (possible=true)` followed by `PiP: controller prepared after hosted playback became ready` is logged at every playback start, once the first frame is on screen with picture in picture allowed. Picture in picture actually starting logs `PiP: will start` and `PiP: did start`. Nothing dismisses the iOS player view controller when picture in picture starts (`isPipActive` only swaps the button icon), so the app's own Play buttons are not reachable while it runs.

The same refusal with `replace: false` is a different failure. On Android, a host activity destroyed while the process lives (low memory in the background, a dock event) leaves the module holding a session that no JS session owns, because `onActivityDestroyed` does nothing. Every later present is refused and `usePlayMedia` drops the play until the process dies. Those events land in REACT-NATIVE-28: the only frame is expo's `CodedError` constructor, the same as the screen orientation rejections.
