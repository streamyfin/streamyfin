# Robolectric's idle() Never Returns Over a Playing Player

**Date**: 2026-11-17
**Category**: build-and-tooling
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/nativeplayer/PlayerViewModel.kt`, `modules/mpv-player/android/src/test/java/expo/modules/mpvplayer/nativeplayer/remote/RemotePlayerSessionTest.kt`

## Detail

When `PlayerViewModel.onPauseChanged(false)` runs, the view model posts a Choreographer frame callback (`frameCallback`), and the callback posts itself again on each frame while the player plays. Under Robolectric the main looper then always has a frame due, so `shadowOf(getMainLooper()).idle()` never returns. The Gradle test task does not fail and prints nothing: it runs until something kills it. `jstack` on the `GradleWorkerMain` process shows the `Test worker` thread inside `PlayerViewModel$frameCallback$1.doFrame`, under the spec that called `idle()`.

The remote screen ran into it when the holder started replaying the engine's state to a screen as it attaches: a fake TV that already plays makes the view model play during `present()`, before the spec's `idle()`. In the app this callback is expected, it drives the position on screen.

A spec that presents over a playing engine either pauses the engine first (the session specs pause the fake TV after it loads) or presents with `idle = false` and asserts without idling. `willTeardown()` stops the callback, so idling after a dismiss is fine. Run Gradle with a `timeout` in front, so a hang ends instead of holding the build lock.
