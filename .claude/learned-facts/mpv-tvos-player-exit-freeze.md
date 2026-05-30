# MPV tvOS Player Exit Freeze

**Date**: 2026-01-22
**Category**: native-modules
**Key files**: `modules/mpv-player/ios/MPVLayerRenderer.swift`

## Detail

On tvOS, `mpv_terminate_destroy` can deadlock if called while blocking the main thread (e.g., via `queue.sync`). The fix is to run `mpv_terminate_destroy` on `DispatchQueue.global()` asynchronously, allowing it to access main thread for AVFoundation/GPU cleanup. Send `quit` command and drain events first.
