package expo.modules.exoplayerplayer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExoPlayerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ExoPlayer")

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
