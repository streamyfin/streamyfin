package expo.modules.exoplayerplayer

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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

class ExoPlayerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ExoPlayer")

        // Whether the device ships a hardware decoder that accepts a Dolby
        // Vision Profile 5 MediaFormat (see acceptsDolbyVisionProfile5). On
        // certified Android TV boxes/TVs the SoC's HEVC decoder is DV-aware:
        // handed a single-layer DV stream (Profile 5/8) with its codec
        // identity intact, it renders real Dolby Vision and the vendor
        // pipeline signals DV over HDMI. Used by the JS device profile to
        // decide whether pure Profile 5 may direct play instead of being
        // transcoded away. The literal string is used because the
        // MIMETYPE_VIDEO_DOLBY_VISION constant is API 27+ while our minSdk
        // is 26.
        Function("supportsDolbyVisionDecode") {
            try {
                val codecList = MediaCodecList(MediaCodecList.REGULAR_CODECS)
                codecList.codecInfos.any { info ->
                    !info.isEncoder && info.supportedTypes.any { type ->
                        type.equals("video/dolby-vision", ignoreCase = true) &&
                            acceptsDolbyVisionProfile5(info, type)
                    }
                }
            } catch (e: Exception) {
                false
            }
        }

        // Enables the module to be used as a native view.
        View(ExoPlayerView::class) {
            // All video load options are passed via a single "source" prop,
            // mirroring MpvPlayerView. MPV-only fields (voDriver, extra
            // cacheConfig fields) are silently ignored.
            Prop("source") { view: ExoPlayerView, source: Map<String, Any?>? ->
                if (source == null) return@Prop

                val urlString = source["url"] as? String ?: return@Prop

                @Suppress("UNCHECKED_CAST")
                val cacheConfig = source["cacheConfig"] as? Map<String, Any?>

                val config = VideoLoadConfig(
                    url = urlString,
                    headers = source["headers"] as? Map<String, String>,
                    externalSubtitles = source["externalSubtitles"] as? List<String>,
                    startPosition = (source["startPosition"] as? Number)?.toDouble(),
                    autoplay = (source["autoplay"] as? Boolean) ?: true,
                    initialSubtitleId = (source["initialSubtitleId"] as? Number)?.toInt(),
                    initialAudioId = (source["initialAudioId"] as? Number)?.toInt(),
                    loop = (source["loop"] as? Boolean) ?: false,
                    cacheEnabled = cacheConfig?.get("enabled") as? String,
                    cacheSeconds = (cacheConfig?.get("cacheSeconds") as? Number)?.toInt(),
                    demuxerMaxBytes = (cacheConfig?.get("maxBytes") as? Number)?.toInt(),
                    demuxerMaxBackBytes = (cacheConfig?.get("maxBackBytes") as? Number)?.toInt()
                )

                view.loadVideo(config)
            }

            // Now Playing metadata is iOS-only on MPV; no-op here (TV has
            // no Control Center equivalent — Android handles media sessions
            // via MediaSessionCompat which we don't wire up for TV).
            // Typed loosely on purpose: the metadata carries nested values
            // (artworkHeaders), and a Map<String, String> signature makes Expo
            // reject the whole prop rather than ignore what it can't convert.
            Prop("nowPlayingMetadata") { _: ExoPlayerView, _: Map<String, Any?>? ->
                // No-op
            }

            AsyncFunction("play") { view: ExoPlayerView ->
                view.play()
            }

            AsyncFunction("pause") { view: ExoPlayerView ->
                view.pause()
            }

            AsyncFunction("destroy") { view: ExoPlayerView ->
                view.destroy()
            }

            AsyncFunction("seekTo") { view: ExoPlayerView, position: Double ->
                view.seekTo(position)
            }

            AsyncFunction("seekBy") { view: ExoPlayerView, offset: Double ->
                view.seekBy(offset)
            }

            AsyncFunction("setSpeed") { view: ExoPlayerView, speed: Double ->
                view.setSpeed(speed)
            }

            AsyncFunction("getSpeed") { view: ExoPlayerView ->
                view.getSpeed()
            }

            AsyncFunction("isPaused") { view: ExoPlayerView ->
                view.isPaused()
            }

            AsyncFunction("getCurrentPosition") { view: ExoPlayerView ->
                view.getCurrentPosition()
            }

            AsyncFunction("getDuration") { view: ExoPlayerView ->
                view.getDuration()
            }

            // Picture in Picture — TV does not use PiP; safe no-ops.
            AsyncFunction("startPictureInPicture") { _: ExoPlayerView ->
                // No-op
            }

            AsyncFunction("stopPictureInPicture") { _: ExoPlayerView ->
                // No-op
            }

            AsyncFunction("isPictureInPictureSupported") { _: ExoPlayerView ->
                false
            }

            AsyncFunction("isPictureInPictureActive") { _: ExoPlayerView ->
                false
            }

            // Subtitle functions
            AsyncFunction("getSubtitleTracks") { view: ExoPlayerView ->
                view.getSubtitleTracks()
            }

            AsyncFunction("setSubtitleTrack") { view: ExoPlayerView, trackId: Int ->
                view.setSubtitleTrack(trackId)
            }

            AsyncFunction("disableSubtitles") { view: ExoPlayerView ->
                view.disableSubtitles()
            }

            AsyncFunction("getCurrentSubtitleTrack") { view: ExoPlayerView ->
                view.getCurrentSubtitleTrack()
            }

            AsyncFunction("addSubtitleFile") { view: ExoPlayerView, url: String, select: Boolean ->
                view.addSubtitleFile(url, select)
            }

            // Subtitle positioning / styling
            AsyncFunction("setSubtitlePosition") { view: ExoPlayerView, position: Int ->
                view.setSubtitlePosition(position)
            }

            AsyncFunction("setSubtitleScale") { view: ExoPlayerView, scale: Double ->
                view.setSubtitleScale(scale)
            }

            AsyncFunction("setSubtitleMarginY") { view: ExoPlayerView, margin: Int ->
                view.setSubtitleMarginY(margin)
            }

            AsyncFunction("setSubtitleAlignX") { _: ExoPlayerView, _: String ->
                // No-op — SubtitleView follows authored cue alignment.
            }

            AsyncFunction("setSubtitleAlignY") { view: ExoPlayerView, alignment: String ->
                view.setSubtitleAlignY(alignment)
            }

            AsyncFunction("setSubtitleFontSize") { view: ExoPlayerView, size: Int ->
                view.setSubtitleFontSize(size)
            }

            AsyncFunction("setSubtitleColor") { view: ExoPlayerView, color: String ->
                view.setSubtitleColor(color)
            }

            AsyncFunction("setSubtitleFont") { view: ExoPlayerView, font: String ->
                view.setSubtitleFont(font)
            }

            AsyncFunction("setSubtitleBorderStyle") { view: ExoPlayerView, style: String ->
                view.setSubtitleBorderStyle(style)
            }

            AsyncFunction("setSubtitleBackgroundColor") { view: ExoPlayerView, color: String ->
                view.setSubtitleBackgroundColor(color)
            }

            AsyncFunction("setSubtitleAssOverride") { _: ExoPlayerView, _: String ->
                // No-op — libass-specific, no Media3 equivalent.
            }

            // Audio track functions
            AsyncFunction("getAudioTracks") { view: ExoPlayerView ->
                view.getAudioTracks()
            }

            AsyncFunction("setAudioTrack") { view: ExoPlayerView, trackId: Int ->
                view.setAudioTrack(trackId)
            }

            AsyncFunction("getCurrentAudioTrack") { view: ExoPlayerView ->
                view.getCurrentAudioTrack()
            }

            // Video scaling
            AsyncFunction("setZoomedToFill") { view: ExoPlayerView, zoomed: Boolean ->
                view.setZoomedToFill(zoomed)
            }

            AsyncFunction("isZoomedToFill") { view: ExoPlayerView ->
                view.isZoomedToFill()
            }

            // Technical info
            AsyncFunction("getTechnicalInfo") { view: ExoPlayerView ->
                view.getTechnicalInfo()
            }

            // Events that the view can send to JavaScript — same set as MPV.
            Events("onLoad", "onPlaybackStateChange", "onProgress", "onError", "onTracksReady", "onPictureInPictureChange")
        }
    }
}
