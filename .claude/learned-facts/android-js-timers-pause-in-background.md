# Android Pauses JS Timers While the App Is in the Background

**Date**: 2026-09-16
**Category**: platform
**Key files**: `utils/cast/reportOrphanedReceiverStop.ts`, `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/core/JavaTimerManager.kt`

## Detail

On Android, `setTimeout` / `setInterval` with a delay above zero do not fire
while the host activity is paused. `JavaTimerManager.onHostPause` drops the
Choreographer frame callback that drives them, and they only run again once
the app is resumed. A zero-delay timeout is the exception: `createTimer` calls
it straight away, which is why `fetch` (whose polyfill resolves through
`setTimeout(fn, 0)`) and native events keep working in the background.

"Background" includes more than the home screen: a native activity opened on
top of ours, such as the Cast SDK's expanded controls, pauses it too.

So work triggered by a native event that may arrive while the app is paused
(a Cast session ending from the notification, the Cast dialog closing the
expanded controls just before the user leaves) must not await a delayed timer.
The cast stop report did, and sat frozen until the app was reopened.

## Symptom pattern

Something works when tested with the app on screen and "gets stuck" when the
user leaves the app right after triggering it, then completes by itself as
soon as the app is opened again.
