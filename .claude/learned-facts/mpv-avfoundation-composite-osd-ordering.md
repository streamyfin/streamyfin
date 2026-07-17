# MPV avfoundation-composite-osd Ordering

**Date**: 2026-01-22
**Category**: native-modules
**Key files**: `modules/mpv-player/ios/MPVLayerRenderer.swift`

## Detail

On tvOS, the `avfoundation-composite-osd` option MUST be set immediately after `vo=avfoundation`, before any `hwdec` options. Skipping or reordering this causes the app to freeze when exiting the player. Set to "no" on tvOS (prevents gray tint), "yes" on iOS (for PiP subtitle support).
