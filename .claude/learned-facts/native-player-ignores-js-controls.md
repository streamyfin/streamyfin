# The native player does not render the JS Controls

**Date**: 2026-10-25
**Category**: native-modules
**Key files**: `modules/mpv-player/ios/NativePlayer/NativePlayerViewController.swift`, `modules/mpv-player/ios/NativePlayer/PlayerKeyboardPolicy.swift`, `components/video-player/controls/Controls.tsx`, `utils/atoms/settings.ts`

## Detail

On iPhone and iPad the native player is the default (`isNativeChromeActive`, an unset `videoPlayer`). It is presented as its own view controller with SwiftUI controls, so `Controls.tsx` never mounts and anything wired there, hooks like `useKeyEventListener` included, does nothing in the default player. Input that must work in both players needs a native counterpart: the hardware keyboard is handled in `NativePlayerViewController`, which claims first responder in `viewDidAppear`. The arrows are `UIKeyCommand`s, so they repeat while held, except in SyncPlay, where they are presses and send one seek request per press. Space is a press, so a held one toggles once.

What each key does for what is on screen lives in `PlayerKeyboardPolicy.swift`, which `scripts/ios/test-player-keyboard-policy.sh` runs on macOS. Six overlays own every key, as they own the touches: the still-watching prompt, the episode list, the subtitle search and SyncPlay queue sheets, the error overlay and the lock mode. A seventh, the subtitle size panel, is not modal and keeps only the arrows. An overlay left out of `keyboardState` keeps the priority arrow commands registered under it, so the arrows seek there: on an iPad simulator, three presses of Right with the subtitle search open moved playback 90 seconds. The arrows also wait for a loaded stream with a duration. Without that, one press of Right while the next episode loaded made it start at 0:30 instead of 0:00.
