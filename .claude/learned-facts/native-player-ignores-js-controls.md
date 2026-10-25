# The native player does not render the JS Controls

**Date**: 2026-10-25
**Category**: native modules
**Key files**: `modules/mpv-player/ios/NativePlayer/NativePlayerViewController.swift`, `components/video-player/controls/Controls.tsx`, `utils/atoms/settings.ts`

## Detail

On iPhone and iPad the native player is the default (`isNativeChromeActive`, an unset `videoPlayer`). It is presented as its own view controller with SwiftUI controls, so `Controls.tsx` never mounts and anything wired there, hooks like `useKeyEventListener` included, does nothing in the default player. Input that must work in both players needs a native counterpart: the hardware keyboard (space, arrows) is a `UIKeyCommand` set in `NativePlayerViewController`, which claims first responder in `viewDidAppear`.
