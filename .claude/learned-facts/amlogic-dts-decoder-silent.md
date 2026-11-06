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
decoders for `audio/vnd.dts*` mimes, so the DTS track falls through to
FfmpegAudioRenderer (which decodes DTS/DTS-HD to PCM). DTS *passthrough* is
unaffected — a sink that accepts DTS bitstream routes through the static
`MediaCodecSelector.getPassthroughDecoderInfos()`, which never consults the
custom selector. PCM-only output keeps the default selector: `PREFER` mode
already orders FFmpeg ahead of MediaCodec, which is why this only bites on
Dolby-capable sinks. Gated on `Class.forName(FfmpegAudioRenderer)` so a
future build without the FFmpeg extension keeps the platform decoder instead
of losing DTS audio entirely.

**⚠ TWIN**: the selector is duplicated in both engine files (the Kotlin
modules are independent). Change them in lockstep.

Diagnostic help: the "Audio output bitstream-capable=..." log line now also
prints DTS/DTSHD caps, and `onAudioDecoderInitialized` + `getTechnicalInfo()`
report which decoder actually took the track ("FFmpegAudioRenderer" vs a
`c2.amlogic.*` name).
