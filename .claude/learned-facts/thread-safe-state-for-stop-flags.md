# Thread-Safe State for Stop Flags

**Date**: 2026-01-22
**Category**: native-modules
**Key files**: `modules/mpv-player/ios/MPVLayerRenderer.swift`

## Detail

When using flags like `isStopping` that control loop termination across threads, the setter must be synchronous (`stateQueue.sync`) not async, otherwise the value may not be visible to other threads in time.
