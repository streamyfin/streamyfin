# Amlogic's DTS decoder outputs silence on DTS-HD, and ExoPlayer never learns

**Date**: 2026-10-11
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/nativeplayer/engine/ExoPlayerEngine.kt`, `modules/exoplayer-player/android/src/main/java/expo/modules/exoplayerplayer/ExoPlayerView.kt`

## Detail

DTS-HD direct play on an Amlogic Android TV box (SEI Robotics, API 34) plays
video with no audio and no error. The logcat chain: the sink reports
bitstream caps for Dolby only (`JOC=true, EAC3=true, AC3=true`, no DTS), so
`EXTENSION_RENDERER_MODE_ON` puts MediaCodecAudioRenderer ahead of
FfmpegAudioRenderer. The DTS track maps to the platform decoder
`c2.amlogic.audio.decoder.dtshd`, which runs in decode mode (`digital_raw:0`)
and then logs `process Invalid dts frame` for the SoftDCA 2.1.0 (2021) build —
every frame rejected, zero output, pure silence.

The trap is that it never throws: `setEnableDecoderFallback(true)` only helps
when a decoder fails to initialize, and the engine's audio-renderer recovery
retry (`recoverFromAudioRendererError`) needs a `TYPE_RENDERER` exception.
A decoder that accepts frames and emits nothing defeats both — ExoPlayer
believes playback is fine.

**Shipped fix** (both engine files, lockstep — see the LoadControl ⚠ TWIN):
on bitstream-capable output, set a `MediaCodecSelector` that returns no
platform decoders for the DTS formats FFmpeg decodes (`FfmpegLibrary
.supportsFormat`: `audio/vnd.dts` and `audio/vnd.dts.hd` in the Jellyfin
1.9.0 build), so those tracks fall through to FfmpegAudioRenderer, which
decodes them to PCM. DTS Express and DTS-UHD, which that build does not
decode, keep their platform decoders, and DTS-UHD keeps the DTS core fallback
media3 looks up under `audio/vnd.dts` (`MediaCodecUtil
.getAlternativeCodecMimeType`): see `dtsAwareDecoderInfos`. A build whose
FFmpeg library fails to load decodes nothing, so every DTS lookup stays with
the platform. DTS *passthrough* is unaffected: when the sink accepts the
bitstream, `MediaCodecAudioRenderer.supportsFormat` (media3 1.11.1) hands the
track to it directly and asks the selector for no decoder unless the track has
DRM. PCM-only output keeps the default selector: `PREFER` mode already orders
FFmpeg ahead of MediaCodec, which is why this only bites on Dolby-capable
sinks.

**⚠ TWIN**: the selector is duplicated in both engine files (the Kotlin
modules are independent). Change them in lockstep.

Diagnostic help: the "Audio output bitstream-capable=..." log line now also
prints DTS/DTSHD caps, and `onAudioDecoderInitialized` + `getTechnicalInfo()`
report which decoder actually took the track ("FFmpegAudioRenderer" vs a
`c2.amlogic.*` name).
