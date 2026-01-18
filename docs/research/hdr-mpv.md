# HDR Support on tvOS with mpv - Research Document

## Problem Statement

HDR content appears washed out on Apple TV when using the mpv-based player. The TV doesn't show an HDR indicator and colors look flat compared to other apps like Infuse.

## Current Implementation

Streamyfin uses MPVKit with the `vo_avfoundation` video output driver, which renders video to `AVSampleBufferDisplayLayer`. This enables Picture-in-Picture (PiP) support but has HDR limitations.

**Current code in `MpvPlayerView.swift`:**
```swift
#if !os(tvOS)
if #available(iOS 17.0, *) {
    displayLayer.wantsExtendedDynamicRangeContent = true
}
#endif
```

The tvOS exclusion was intentional because `wantsExtendedDynamicRangeContent` was believed to be iOS-only, but this may not be accurate for tvOS 17.0+.

---

## Research Findings

### 1. This is a Known Industry-Wide Limitation

The same HDR issue exists in multiple projects:

| Project | Player | HDR Status |
|---------|--------|------------|
| [Swiftfin](https://github.com/jellyfin/Swiftfin/issues/811) | VLCKit | Washed out, no HDR signal |
| [Plex](https://freetime.mikeconnelly.com/archives/8360) | mpv (Enhanced Player) | No HDR support |
| Infuse | Custom Metal engine | Works correctly |

**Key quote from mpv maintainer** ([issue #9633](https://github.com/mpv-player/mpv/issues/9633)):
> "mpv doesn't support metal at all (likely won't ever)"

### 2. Why Infuse Works

Infuse uses a **custom Metal-based video rendering engine** built from scratch - not mpv, not VLCKit, not AVPlayer. This allows them to properly handle HDR passthrough with the correct pixel formats and color spaces.

Source: [Firecore Community](https://community.firecore.com/t/what-player-does-infuse-use/38003)

### 3. Swiftfin's Solution

Swiftfin offers two players:
- **VLCKit player** (default) - No HDR support
- **Native player (AVPlayer)** - HDR works correctly

When using the native player with proper stream configuration (HEVC `hvc1`, fMP4-HLS), Apple TV correctly switches to HDR mode.

Source: [Swiftfin Issue #331](https://github.com/jellyfin/Swiftfin/issues/331)

### 4. Apple's HDR Requirements

According to [WWDC22: Display HDR video in EDR with AVFoundation and Metal](https://developer.apple.com/videos/play/wwdc2022/110565/):

**Required for EDR (Extended Dynamic Range):**
```swift
// On CAMetalLayer
layer.wantsExtendedDynamicRangeContent = true
layer.pixelFormat = MTLPixelFormatRGBA16Float
layer.colorspace = kCGColorSpaceExtendedLinearDisplayP3
```

**For AVPlayerItemVideoOutput:**
```swift
let videoColorProperties = [
    AVVideoColorPrimariesKey: AVVideoColorPrimaries_P3_D65,
    AVVideoTransferFunctionKey: AVVideoTransferFunction_Linear,
    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_2020
]
```

### 5. CVPixelBuffer HDR Metadata

For pixel buffers to be recognized as HDR, they need colorspace attachments:

```c
CVBufferSetAttachment(pixelBuffer, kCVImageBufferColorPrimariesKey,
                      kCVImageBufferColorPrimaries_ITU_R_2020,
                      kCVAttachmentMode_ShouldPropagate);
CVBufferSetAttachment(pixelBuffer, kCVImageBufferTransferFunctionKey,
                      kCVImageBufferTransferFunction_SMPTE_ST_2084_PQ,  // HDR10
                      kCVAttachmentMode_ShouldPropagate);
CVBufferSetAttachment(pixelBuffer, kCVImageBufferYCbCrMatrixKey,
                      kCVImageBufferYCbCrMatrix_ITU_R_2020,
                      kCVAttachmentMode_ShouldPropagate);
```

### 6. macOS EDR Research

From [mpv issue #7341](https://github.com/mpv-player/mpv/issues/7341), testing showed:
- **mpv playback**: `maximumExtendedDynamicRangeColorComponentValue: 1.0`
- **QuickTime playback**: `maximumExtendedDynamicRangeColorComponentValue: 2.0`

QuickTime uses `CAOpenGLLayer.wantsExtendedDynamicRangeContent` to enable EDR.

### 7. iOS/tvOS OpenGL Limitations

From [mpv issue #8467](https://github.com/mpv-player/mpv/issues/8467):
> "Disabling HDR peak computation (one or more of the following is not supported: compute shaders=0, SSBO=0)"

Apple's OpenGL implementation lacks compute shader and SSBO support, making traditional HDR peak computation impossible.

---

## Potential Solutions

### ~~Option A: Enable EDR on tvOS (Quick Test)~~ - RULED OUT

**Status:** Tested and failed - `wantsExtendedDynamicRangeContent` is **not available on tvOS**.

The API is iOS-only. Attempting to use it on tvOS results in:
> 'wantsExtendedDynamicRangeContent' is unavailable in tvOS

This confirms tvOS requires a different approach for HDR.

### Option B: Modify vo_avfoundation in MPVKit

Add HDR colorspace metadata when creating CVPixelBuffers.

**Location:** `streamyfin/MPVKit` fork, vo_avfoundation driver

**Required changes:**
1. Detect HDR content (check video color primaries/transfer function)
2. Attach colorspace metadata to pixel buffers
3. Possibly configure AVSampleBufferDisplayLayer for HDR

**Pros:** Fixes the root cause
**Cons:** Requires modifying and rebuilding MPVKit

### Option C: Dual Player Approach (Like Swiftfin)

Implement AVPlayer-based playback for HDR content, keep mpv for everything else.

**Pros:** Proven solution, full HDR/DV support
**Cons:** Significant development effort, two player implementations to maintain

### Option D: Accept Limitation

Document that HDR passthrough is not supported with the mpv player on tvOS.

**Pros:** No development work
**Cons:** Poor user experience for HDR content

---

## Recommended Approach

1. **First:** Try Option A (enable EDR on tvOS) - simple test
2. **If that fails:** Investigate Option B (modify vo_avfoundation in MPVKit)
3. **Long-term:** Consider Option C (dual player) for full HDR support

---

## Technical References

### Apple Documentation
- [AVDisplayManager](https://developer.apple.com/documentation/avkit/avdisplaymanager)
- [AVDisplayCriteria](https://developer.apple.com/documentation/avkit/avdisplaycriteria)
- [WWDC22: Display HDR video in EDR](https://developer.apple.com/videos/play/wwdc2022/110565/)
- [WWDC20: Edit and play back HDR video](https://developer.apple.com/videos/play/wwdc2020/10009/)

### Related Projects
- [Swiftfin HDR Issues](https://github.com/jellyfin/Swiftfin/issues/811)
- [Swiftfin Match Content](https://github.com/jellyfin/Swiftfin/issues/331)
- [mpv HDR on iOS](https://github.com/mpv-player/mpv/issues/9633)
- [mpv macOS EDR](https://github.com/mpv-player/mpv/issues/7341)
- [mpv HDR passthrough](https://github.com/mpv-player/mpv/issues/11812)

### Articles
- [Plex's mpv Player](https://freetime.mikeconnelly.com/archives/8360)
- [Rendering HDR Video with AVFoundation and Metal](https://metalbyexample.com/hdr-video/)

---

## Current Implementation Status

**What we've implemented so far:**

1. **HDR Detection** (`MPVLayerRenderer.swift`)
   - Reads `video-params/primaries` and `video-params/gamma` from mpv
   - Detects HDR10 (bt.2020 + pq), HLG, Dolby Vision
   - Logs: `HDR Detection - primaries: bt.2020, gamma: pq, fps: 23.976`

2. **AVDisplayCriteria** (`MpvPlayerView.swift`)
   - Sets `preferredDisplayCriteria` on tvOS 17.0+ when HDR detected
   - Creates CMFormatDescription with proper HDR color extensions
   - Logs: `🎬 HDR: Setting display criteria to hdr10, fps: 23.976`

3. **target-colorspace-hint** (`MPVLayerRenderer.swift`)
   - Added `target-colorspace-hint=yes` for tvOS to signal colorspace to display

**What's NOT working:**
- TV doesn't show HDR indicator
- Colors still appear washed out
- The display mode switch may not be happening

---

## Next Steps for Investigation

1. **Verify AVDisplayCriteria is being honored:**
   - Check if Apple TV settings allow app-requested display mode changes
   - Verify the CMFormatDescription is correctly formed

2. **Examine vo_avfoundation pixel buffer creation:**
   - Clone MPVKit source
   - Find where CVPixelBuffers are created
   - Check if colorspace attachments are being set

3. **Test with AVSampleBufferDisplayLayer debugging:**
   - Log pixel buffer attachments
   - Verify layer configuration

4. **Consider testing with VLCKit:**
   - Swiftfin's VLCKit has same issue
   - Their solution: use AVPlayer for HDR content
