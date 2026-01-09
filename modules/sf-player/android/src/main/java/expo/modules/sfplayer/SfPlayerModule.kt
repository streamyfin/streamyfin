package expo.modules.sfplayer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SfPlayerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("SfPlayer")

        View(SfPlayerView::class) {
            Prop("source") { view: SfPlayerView, source: Map<String, Any>? ->
                // Android stub - KSPlayer is iOS only
            }

            AsyncFunction("play") { view: SfPlayerView ->
            }

            AsyncFunction("pause") { view: SfPlayerView ->
            }

            AsyncFunction("seekTo") { view: SfPlayerView, position: Double ->
            }

            AsyncFunction("seekBy") { view: SfPlayerView, offset: Double ->
            }

            AsyncFunction("setSpeed") { view: SfPlayerView, speed: Double ->
            }

            AsyncFunction("getSpeed") { view: SfPlayerView ->
                1.0
            }

            AsyncFunction("isPaused") { view: SfPlayerView ->
                true
            }

            AsyncFunction("getCurrentPosition") { view: SfPlayerView ->
                0.0
            }

            AsyncFunction("getDuration") { view: SfPlayerView ->
                0.0
            }

            AsyncFunction("startPictureInPicture") { view: SfPlayerView ->
            }

            AsyncFunction("stopPictureInPicture") { view: SfPlayerView ->
            }

            AsyncFunction("isPictureInPictureSupported") { view: SfPlayerView ->
                false
            }

            AsyncFunction("isPictureInPictureActive") { view: SfPlayerView ->
                false
            }

            AsyncFunction("getSubtitleTracks") { view: SfPlayerView ->
                emptyList<Map<String, Any>>()
            }

            AsyncFunction("setSubtitleTrack") { view: SfPlayerView, trackId: Int ->
            }

            AsyncFunction("disableSubtitles") { view: SfPlayerView ->
            }

            AsyncFunction("getCurrentSubtitleTrack") { view: SfPlayerView ->
                0
            }

            AsyncFunction("addSubtitleFile") { view: SfPlayerView, url: String, select: Boolean ->
            }

            AsyncFunction("setSubtitlePosition") { view: SfPlayerView, position: Int ->
            }

            AsyncFunction("setSubtitleScale") { view: SfPlayerView, scale: Double ->
            }

            AsyncFunction("setSubtitleMarginY") { view: SfPlayerView, margin: Int ->
            }

            AsyncFunction("setSubtitleAlignX") { view: SfPlayerView, alignment: String ->
            }

            AsyncFunction("setSubtitleAlignY") { view: SfPlayerView, alignment: String ->
            }

            AsyncFunction("setSubtitleFontSize") { view: SfPlayerView, size: Int ->
            }

            AsyncFunction("getAudioTracks") { view: SfPlayerView ->
                emptyList<Map<String, Any>>()
            }

            AsyncFunction("setAudioTrack") { view: SfPlayerView, trackId: Int ->
            }

            AsyncFunction("getCurrentAudioTrack") { view: SfPlayerView ->
                0
            }

            AsyncFunction("setVideoZoomToFill") { view: SfPlayerView, enabled: Boolean ->
            }

            AsyncFunction("getVideoZoomToFill") { view: SfPlayerView ->
                false
            }

            AsyncFunction("setAutoPipEnabled") { view: SfPlayerView, enabled: Boolean ->
            }

            Events("onLoad", "onPlaybackStateChange", "onProgress", "onError", "onTracksReady", "onPictureInPictureChange")
        }
    }
}

