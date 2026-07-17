# HDR Support on tvOS with mpv - Research Document

## Problem Statement

HDR content appears washed out on Apple TV when using the mpv-based player. The TV doesn't show an HDR indicator and colors look flat compared to other apps like Infuse.

**Key Discovery:** HDR works correctly on iPhone but not on tvOS, despite using the same mpv player.

---

## Why HDR Works on iPhone

In `MpvPlayerView.swift`:
```swift
#if !os(tvOS)
if #available(iOS 17.0, *) {
    displayLayer.wantsExtendedDynamicRangeContent = true
}
#endif
```

On iOS 17+, setting `wantsExtendedDynamicRangeContent = true` on `AVSampleBufferDisplayLayer` enables Extended Dynamic Range (EDR). This tells the display layer to preserve HDR metadata and render in high dynamic range.

**This API does not exist on tvOS.** Attempting to use it results in:
> 'wantsExtendedDynamicRangeContent' is unavailable in tvOS

tvOS uses a different HDR architecture designed for external displays via HDMI.

---

## tvOS HDR Architecture

Unlike iPhone (integrated display), Apple TV connects to external TVs. Apple expects apps to:

1. **Use `AVDisplayCriteria`** to request display mode changes
2. **Attach proper colorspace metadata** to pixel buffers
3. **Let the TV handle HDR rendering** via HDMI passthrough

This is how Netflix, Infuse, and the TV app work - they signal "I'm playing HDR10 at 24fps" and tvOS switches the TV to that mode.

---

## MPVKit vo_avfoundation Analysis

**Location:** `/MPVKit/Sources/BuildScripts/patch/libmpv/0004-avfoundation-video-output.patch`

### Existing HDR Infrastructure

The driver has comprehensive HDR support already built in:

#### 1. HDR Metadata Copy Function (lines 253-270)
```c
static void copy_hdr_metadata(CVPixelBufferRef src, CVPixelBufferRef dst)
{
    const CFStringRef keys[] = {
        kCVImageBufferTransferFunctionKey,      // PQ for HDR10, HLG for HLG
        kCVImageBufferColorPrimariesKey,        // BT.2020 for HDR
        kCVImageBufferYCbCrMatrixKey,
        kCVImageBufferMasteringDisplayColorVolumeKey,  // HDR10 static metadata
        kCVImageBufferContentLightLevelInfoKey,        // MaxCLL, MaxFALL
    };

    for (size_t i = 0; i < MP_ARRAY_SIZE(keys); i++) {
        CFTypeRef value = CVBufferGetAttachment(src, keys[i], NULL);
        if (value) {
            CVBufferSetAttachment(dst, keys[i], value, kCVAttachmentMode_ShouldPropagate);
        }
    }
}
```

#### 2. 10-bit HDR Format Support (lines 232-247)
```c
// For 10-bit HDR content (P010), use RGBA half-float to preserve HDR precision
if (format == kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange ||
    format == kCVPixelFormatType_420YpCbCr10BiPlanarFullRange) {
    outputFormat = kCVPixelFormatType_64RGBAHalf;
}
```

#### 3. HDR-Safe GPU Compositing (lines 694-695)
```c
CGColorSpaceRef workingColorSpace = CGColorSpaceCreateWithName(
    kCGColorSpaceExtendedLinearDisplayP3);
```

### The Problem: Metadata Not Attached in Main Code Path

**Critical Finding:** `copy_hdr_metadata()` is only called during OSD compositing (line 609-610):

```c
// In composite mode, render OSD and composite onto frame
if (p->composite_osd) {
    render_osd(vo, pts);
    CVPixelBufferRef composited = composite_frame(vo, pixbuf);
    // copy_hdr_metadata() called inside composite_frame()
}
```

If `composite_osd` is false (default), **HDR metadata is never attached**.

### Frame Flow Analysis

```
draw_frame() called
    │
    ├─► Hardware decoded (IMGFMT_VIDEOTOOLBOX)
    │   └─► pixbuf = mpi->planes[3]  // Direct from VideoToolbox
    │       └─► Metadata SHOULD be attached by decoder, but not verified
    │
    └─► Software decoded (NV12, 420P, P010)
        └─► upload_software_frame()
            └─► Creates new CVPixelBuffer
            └─► Copies pixel data only
            └─► ❌ NO colorspace metadata attached!

    ▼
    CMVideoFormatDescriptionCreateForImageBuffer(finalBuffer)
    └─► Format description created FROM pixel buffer
    └─► If buffer lacks HDR metadata, format won't have it

    ▼
    [displayLayer enqueueSampleBuffer:buf]
    └─► Sent to display layer without HDR signal
```

---

## Root Cause Summary

| Issue | Impact |
|-------|--------|
| `wantsExtendedDynamicRangeContent` unavailable on tvOS | Can't use iOS EDR approach |
| `copy_hdr_metadata()` only runs during OSD compositing | Main playback path skips HDR metadata |
| Software decoded frames get no colorspace attachments | mpv knows colorspace but doesn't pass it to pixel buffer |
| VideoToolbox metadata not verified | May or may not have HDR attachments |

---

## mp_image Colorspace Structures

mpv uses libplacebo's colorspace structures. Here's how colorspace info flows:

### Structure Hierarchy

```
mp_image (video/mp_image.h)
    └─► params: mp_image_params
            └─► color: pl_color_space
            │       ├─► primaries: pl_color_primaries  (BT.2020, etc.)
            │       ├─► transfer: pl_color_transfer    (PQ, HLG, etc.)
            │       └─► hdr: pl_hdr_metadata           (MaxCLL, MaxFALL, etc.)
            └─► repr: pl_color_repr
                    ├─► sys: pl_color_system           (BT.2100_PQ, etc.)
                    └─► levels: pl_color_levels        (TV/Full range)
```

### Key Enums

#### Color Primaries (`enum pl_color_primaries`)
```c
PL_COLOR_PRIM_UNKNOWN = 0,
PL_COLOR_PRIM_BT_709,           // HD/SDR standard
PL_COLOR_PRIM_BT_2020,          // UHD/HDR wide gamut ← HDR
PL_COLOR_PRIM_DCI_P3,           // DCI P3 (cinema)
PL_COLOR_PRIM_DISPLAY_P3,       // Display P3 (Apple)
// ... more
```

#### Transfer Functions (`enum pl_color_transfer`)
```c
PL_COLOR_TRC_UNKNOWN = 0,
PL_COLOR_TRC_BT_1886,           // SDR gamma
PL_COLOR_TRC_SRGB,              // sRGB
PL_COLOR_TRC_PQ,                // SMPTE 2084 PQ (HDR10/DolbyVision) ← HDR
PL_COLOR_TRC_HLG,               // ITU-R BT.2100 HLG ← HDR
// ... more
```

#### Color Systems (`enum pl_color_system`)
```c
PL_COLOR_SYSTEM_BT_709,         // HD/SDR
PL_COLOR_SYSTEM_BT_2020_NC,     // UHD (non-constant luminance)
PL_COLOR_SYSTEM_BT_2100_PQ,     // HDR10 ← HDR
PL_COLOR_SYSTEM_BT_2100_HLG,    // HLG ← HDR
PL_COLOR_SYSTEM_DOLBYVISION,    // Dolby Vision ← HDR
// ... more
```

### HDR Metadata Structure (`struct pl_hdr_metadata`)
```c
struct pl_hdr_metadata {
    struct pl_raw_primaries prim;   // CIE xy primaries
    float min_luma, max_luma;       // Luminance range (cd/m²)
    float max_cll;                  // Maximum Content Light Level
    float max_fall;                 // Maximum Frame-Average Light Level
    // ... more
};
```

### Accessing Colorspace in vo_avfoundation

```c
// In draw_frame():
struct mp_image *mpi = frame->current;

// Color primaries
enum pl_color_primaries prim = mpi->params.color.primaries;

// Transfer function
enum pl_color_transfer trc = mpi->params.color.transfer;

// HDR metadata
struct pl_hdr_metadata hdr = mpi->params.color.hdr;

// HDR detection
bool is_hdr = (trc == PL_COLOR_TRC_PQ || trc == PL_COLOR_TRC_HLG);
bool is_wide_gamut = (prim == PL_COLOR_PRIM_BT_2020);
```

---

## The Fix

### Required Changes in vo_avfoundation

**File:** `MPVKit/Sources/BuildScripts/patch/libmpv/0004-avfoundation-video-output.patch`

**Location:** After line 821 in `draw_frame()`, before the sample buffer is created.

#### Add Required Include
```c
#include "video/csputils.h"  // For pl_color_* enums (if not already included)
```

#### Add HDR Metadata Attachment Function
```c
// Add after copy_hdr_metadata() function (around line 270)
static void attach_hdr_metadata(struct vo *vo, CVPixelBufferRef pixbuf,
                                 struct mp_image *mpi)
{
    enum pl_color_primaries prim = mpi->params.color.primaries;
    enum pl_color_transfer trc = mpi->params.color.transfer;

    // Attach BT.2020 color primaries (HDR wide color gamut)
    if (prim == PL_COLOR_PRIM_BT_2020) {
        CVBufferSetAttachment(pixbuf, kCVImageBufferColorPrimariesKey,
                              kCVImageBufferColorPrimaries_ITU_R_2020,
                              kCVAttachmentMode_ShouldPropagate);
        CVBufferSetAttachment(pixbuf, kCVImageBufferYCbCrMatrixKey,
                              kCVImageBufferYCbCrMatrix_ITU_R_2020,
                              kCVAttachmentMode_ShouldPropagate);

        MP_VERBOSE(vo, "HDR: Attached BT.2020 color primaries\n");
    }

    // Attach PQ transfer function (HDR10/Dolby Vision)
    if (trc == PL_COLOR_TRC_PQ) {
        CVBufferSetAttachment(pixbuf, kCVImageBufferTransferFunctionKey,
                              kCVImageBufferTransferFunction_SMPTE_ST_2084_PQ,
                              kCVAttachmentMode_ShouldPropagate);

        MP_VERBOSE(vo, "HDR: Attached PQ transfer function (HDR10)\n");
    }
    // Attach HLG transfer function
    else if (trc == PL_COLOR_TRC_HLG) {
        CVBufferSetAttachment(pixbuf, kCVImageBufferTransferFunctionKey,
                              kCVImageBufferTransferFunction_ITU_R_2100_HLG,
                              kCVAttachmentMode_ShouldPropagate);

        MP_VERBOSE(vo, "HDR: Attached HLG transfer function\n");
    }

    // Attach HDR static metadata if available
    struct pl_hdr_metadata hdr = mpi->params.color.hdr;
    if (hdr.max_cll > 0 || hdr.max_fall > 0) {
        // ContentLightLevelInfo is a 4-byte structure:
        // - 2 bytes: MaxCLL (max content light level)
        // - 2 bytes: MaxFALL (max frame-average light level)
        uint16_t cll_data[2] = {
            (uint16_t)fminf(hdr.max_cll, 65535.0f),
            (uint16_t)fminf(hdr.max_fall, 65535.0f)
        };

        CFDataRef cllInfo = CFDataCreate(NULL, (const UInt8 *)cll_data, sizeof(cll_data));
        if (cllInfo) {
            CVBufferSetAttachment(pixbuf, kCVImageBufferContentLightLevelInfoKey,
                                  cllInfo, kCVAttachmentMode_ShouldPropagate);
            CFRelease(cllInfo);

            MP_VERBOSE(vo, "HDR: Attached CLL metadata (MaxCLL=%d, MaxFALL=%d)\n",
                       cll_data[0], cll_data[1]);
        }
    }
}
```

#### Call the Function in draw_frame()

```c
// In draw_frame(), after line 821 (after getting pixbuf), add:

// Attach HDR colorspace metadata to pixel buffer
// This ensures the display layer receives proper HDR signaling
attach_hdr_metadata(vo, pixbuf, mpi);
```

### Complete draw_frame() Modification

The modified section should look like:

```c
CVPixelBufferRef pixbuf = NULL;
bool pixbufNeedsRelease = false;

// Handle different input formats
if (mpi->imgfmt == IMGFMT_VIDEOTOOLBOX) {
    // Hardware decoded: zero-copy passthrough
    pixbuf = (CVPixelBufferRef)mpi->planes[3];
} else {
    // Software decoded: upload to CVPixelBuffer
    pixbuf = upload_software_frame(vo, mpi);
    if (!pixbuf) {
        MP_ERR(vo, "Failed to upload software frame\n");
        mp_image_unrefp(&mpi);
        return false;
    }
    pixbufNeedsRelease = true;
}

// >>> NEW: Attach HDR colorspace metadata <<<
attach_hdr_metadata(vo, pixbuf, mpi);

CVPixelBufferRef finalBuffer = pixbuf;
bool needsRelease = false;
// ... rest of the function
```

---

## Alternative Solutions

### Option A: Enable composite_osd Mode (Quick Test)

Since `copy_hdr_metadata()` works in composite mode, try enabling it:
```
--avfoundation-composite-osd=yes
```

This would trigger the existing HDR metadata path. Downside: OSD compositing has performance overhead.

### Option B: Full vo_avfoundation Fix (Recommended)

Modify the driver to always attach colorspace metadata based on `mp_image` params. This is the implementation described above.

### Option C: Dual Player Approach

Use AVPlayer for HDR content, mpv for everything else. This is what Swiftfin does.

---

## Implementation Checklist

- [ ] Clone MPVKit fork
- [ ] Modify `0004-avfoundation-video-output.patch`:
  - [ ] Add `attach_hdr_metadata()` function
  - [ ] Call it in `draw_frame()` after getting pixbuf
  - [ ] Add necessary includes if needed
- [ ] Rebuild MPVKit
- [ ] Test with HDR10 content on tvOS
- [ ] Verify TV shows HDR indicator
- [ ] Test with HLG content
- [ ] Test with Dolby Vision content (may need additional work)

---

## Current Implementation Status

**What's implemented in Streamyfin:**

1. **HDR Detection** (`MPVLayerRenderer.swift`)
   - Reads `video-params/primaries` and `video-params/gamma` from mpv
   - Detects HDR10 (bt.2020 + pq), HLG, Dolby Vision

2. **AVDisplayCriteria** (`MpvPlayerView.swift`)
   - Sets `preferredDisplayCriteria` on tvOS 17.0+ when HDR detected
   - Creates CMFormatDescription with HDR color extensions

3. **target-colorspace-hint** (`MPVLayerRenderer.swift`)
   - Added `target-colorspace-hint=yes` for tvOS

**What's NOT working:**
- TV doesn't show HDR indicator
- Colors appear washed out
- The pixel buffers lack HDR metadata attachments ← **This is what the fix addresses**

---

## Industry Context

| Project | Player | HDR Status |
|---------|--------|------------|
| [Swiftfin](https://github.com/jellyfin/Swiftfin/issues/811) | VLCKit | Washed out, uses AVPlayer for HDR |
| [Plex](https://freetime.mikeconnelly.com/archives/8360) | mpv | No HDR support |
| Infuse | Custom Metal engine | Works correctly |

**Key insight:** No mpv-based player has solved HDR on tvOS. This fix could be a first.

---

## Technical References

### Apple Documentation
- [AVDisplayManager](https://developer.apple.com/documentation/avkit/avdisplaymanager)
- [AVDisplayCriteria](https://developer.apple.com/documentation/avkit/avdisplaycriteria)
- [WWDC22: Display HDR video in EDR](https://developer.apple.com/videos/play/wwdc2022/110565/)

### CVImageBuffer Keys
- `kCVImageBufferColorPrimariesKey` - Color gamut (BT.709, BT.2020, P3)
- `kCVImageBufferTransferFunctionKey` - Transfer function (sRGB, PQ, HLG)
- `kCVImageBufferYCbCrMatrixKey` - YCbCr conversion matrix
- `kCVImageBufferMasteringDisplayColorVolumeKey` - Mastering display metadata
- `kCVImageBufferContentLightLevelInfoKey` - MaxCLL/MaxFALL

### mpv/libplacebo Source
- mp_image struct: `video/mp_image.h`
- Colorspace enums: libplacebo `pl_color.h`
- vo_avfoundation: `MPVKit/Sources/BuildScripts/patch/libmpv/0004-avfoundation-video-output.patch`

### Key Functions in vo_avfoundation
| Function | Line | Purpose |
|----------|------|---------|
| `draw_frame()` | 781 | Main frame rendering |
| `copy_hdr_metadata()` | 253 | Copy HDR metadata between buffers |
| `upload_software_frame()` | 295 | Upload SW frames to CVPixelBuffer |
| `composite_frame()` | 582 | OSD compositing with HDR support |
