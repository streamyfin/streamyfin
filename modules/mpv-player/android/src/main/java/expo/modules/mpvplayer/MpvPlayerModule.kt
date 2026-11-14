package expo.modules.mpvplayer

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.mpvplayer.nativeplayer.engine.VideoLoadConfig

class MpvPlayerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("MpvPlayer")

        // mpv decodes AV1 on any Android device (dav1d in software), so direct play never
        // needs this. It decides whether Jellyfin may transcode *to* AV1: mpv only hands
        // AV1 to MediaCodec (hwdec-codecs includes av1) when a hardware decoder exists,
        // otherwise every transcoded frame would be decoded on the CPU.
        Function("supportsAv1HardwareDecode") {
            hasHardwareAv1Decoder()
        }

        // Used by the JS device profile to decide whether pure Dolby Vision
        // Profile 5 may direct play on Android TV instead of being transcoded
        // away (see hasDolbyVisionProfile5Decoder).
        Function("supportsDolbyVisionDecode") {
            hasDolbyVisionProfile5Decoder()
        }

        // The embedded view: only the subtitle preview in Settings, which plays a
        // silent clip and restyles its subtitles.
        View(MpvPlayerView::class) {
            Prop("source") { view: MpvPlayerView, source: Map<String, Any?>? ->
                if (source == null) return@Prop
                val urlString = source["url"] as? String ?: return@Prop
                view.loadVideo(
                    VideoLoadConfig(
                        url = urlString,
                        autoplay = (source["autoplay"] as? Boolean) ?: true,
                        initialSubtitleId = (source["initialSubtitleId"] as? Number)?.toInt(),
                        loop = (source["loop"] as? Boolean) ?: false,
                    )
                )
            }

            AsyncFunction("setSubtitleScale") { view: MpvPlayerView, scale: Double ->
                view.setSubtitleScale(scale)
            }

            AsyncFunction("setSubtitleMarginY") { view: MpvPlayerView, margin: Int ->
                view.setSubtitleMarginY(margin)
            }

            AsyncFunction("setSubtitleAlignX") { view: MpvPlayerView, alignment: String ->
                view.setSubtitleAlignX(alignment)
            }

            AsyncFunction("setSubtitleAlignY") { view: MpvPlayerView, alignment: String ->
                view.setSubtitleAlignY(alignment)
            }

            AsyncFunction("setSubtitleStyle") { view: MpvPlayerView, config: Map<String, Any> ->
                view.setSubtitleStyle(config)
            }

            AsyncFunction("setSubtitleAssOverride") { view: MpvPlayerView, mode: String ->
                view.setSubtitleAssOverride(mode)
            }

            Events("onTracksReady")
        }
    }
}

/** Whether a hardware MediaCodec decoder advertises AV1 (`video/av01`). */
private fun hasHardwareAv1Decoder(): Boolean =
    try {
        MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any { info ->
            !info.isEncoder &&
                info.supportedTypes.any { it.equals("video/av01", ignoreCase = true) } &&
                isHardwareCodec(info)
        }
    } catch (e: Exception) {
        // A vendor codec list that fails to load is no reason to advertise AV1.
        false
    }

private fun isHardwareCodec(info: MediaCodecInfo): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        info.isHardwareAccelerated && !info.isSoftwareOnly
    } else {
        // Before API 29 the platform's software codecs are only recognisable by name.
        val name = info.name.lowercase()
        !name.startsWith("omx.google.") && !name.startsWith("c2.android.")
    }

/**
 * Whether the device ships a decoder that accepts a Dolby Vision Profile 5
 * MediaFormat (see acceptsDolbyVisionProfile5). On certified Android TV
 * boxes/TVs the SoC's HEVC decoder is DV-aware: handed a single-layer DV
 * stream (Profile 5/8) with its codec identity intact, it renders real Dolby
 * Vision and the vendor pipeline signals DV over HDMI. The literal string is
 * used because the MIMETYPE_VIDEO_DOLBY_VISION constant is API 27+ while our
 * minSdk is 26.
 */
private fun hasDolbyVisionProfile5Decoder(): Boolean =
    try {
        MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any { info ->
            !info.isEncoder && info.supportedTypes.any { type ->
                type.equals("video/dolby-vision", ignoreCase = true) &&
                    acceptsDolbyVisionProfile5(info, type)
            }
        }
    } catch (e: Exception) {
        false
    }

/**
 * Whether the decoder's `video/dolby-vision` CodecCapabilities accept a
 * MediaFormat describing Dolby Vision Profile 5 (dvh1 — single-layer IPTPQc2,
 * the profile Jellyfin reports as plain "DOVI" that renders purple/green on a
 * non-DV pipeline). Advertising the MIME alone is not enough: a decoder may
 * ship `video/dolby-vision` only for Profiles 7/8 enhancement/base-layer
 * handling, and `isFormatSupported` rejects formats whose KEY_PROFILE is not
 * among the decoder's declared profileLevels.
 *
 * Profile 5's CodecProfileLevel value is `DolbyVisionProfileDvheStn` (0x20):
 * Android's DV constant names follow Dolby's 4CC layer codes rather than the
 * profile numbers, and this matches Media3's `CodecSpecificDataUtil`
 * dvh1→0x20 mapping — the exact value Media3 puts in KEY_PROFILE when
 * configuring the decoder for a `dvh1.05` stream, so a pass here answers
 * precisely "will Media3's configure() succeed". (The value was different in
 * the API 27-era numbering and 0x20 had no meaning there, so old-firmware
 * decoders fail this probe and keep transcoding — the safe direction.)
 * 1080p keeps the format inside any decoder's block-count caps; Media3
 * re-checks the real stream's dimensions against the profile's max level
 * during its own capability query.
 */
private fun acceptsDolbyVisionProfile5(info: MediaCodecInfo, mimeType: String): Boolean {
    val profile5Format = MediaFormat.createVideoFormat(mimeType, 1920, 1080).apply {
        setInteger(
            MediaFormat.KEY_PROFILE,
            MediaCodecInfo.CodecProfileLevel.DolbyVisionProfileDvheStn, // DV Profile 5
        )
    }
    return info.getCapabilitiesForType(mimeType).isFormatSupported(profile5Format)
}
