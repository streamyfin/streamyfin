package expo.modules.mpvplayer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MpvPlayerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("MpvPlayer")

        // Defines event names that the module can send to JavaScript.
        Events("onChange")

        // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
        Function("hello") {
            "Hello from MPV Player! 👋"
        }

        // Defines a JavaScript function that always returns a Promise and whose native code
        // is by default dispatched on the different thread than the JavaScript runtime runs on.
        AsyncFunction("setValueAsync") { value: String ->
            sendEvent("onChange", mapOf("value" to value))
        }

        // Enables the module to be used as a native view.
        View(MpvPlayerView::class) {
            // All video load options are passed via a single "source" prop
            Prop("source") { view: MpvPlayerView, source: Map<String, Any?>? ->
                if (source == null) return@Prop
                
                val urlString = source["url"] as? String ?: return@Prop
                
                @Suppress("UNCHECKED_CAST")
                val config = VideoLoadConfig(
                    url = urlString,
                    headers = source["headers"] as? Map<String, String>,
                    externalSubtitles = source["externalSubtitles"] as? List<String>,
                    startPosition = (source["startPosition"] as? Number)?.toDouble(),
                    autoplay = (source["autoplay"] as? Boolean) ?: true,
                    initialSubtitleId = (source["initialSubtitleId"] as? Number)?.toInt(),
                    initialAudioId = (source["initialAudioId"] as? Number)?.toInt()
                )
                
                view.loadVideo(config)
            }

            // Async function to play video
            AsyncFunction("play") { view: MpvPlayerView ->
                view.play()
            }

            // Async function to pause video
            AsyncFunction("pause") { view: MpvPlayerView ->
                view.pause()
            }

            // Async function to seek to position
            AsyncFunction("seekTo") { view: MpvPlayerView, position: Double ->
                view.seekTo(position)
            }

            // Async function to seek by offset
            AsyncFunction("seekBy") { view: MpvPlayerView, offset: Double ->
                view.seekBy(offset)
            }

            // Async function to set playback speed
            AsyncFunction("setSpeed") { view: MpvPlayerView, speed: Double ->
                view.setSpeed(speed)
            }

            // Function to get current speed
            AsyncFunction("getSpeed") { view: MpvPlayerView ->
                view.getSpeed()
            }

            // Function to check if paused
            AsyncFunction("isPaused") { view: MpvPlayerView ->
                view.isPaused()
            }

            // Function to get current position
            AsyncFunction("getCurrentPosition") { view: MpvPlayerView ->
                view.getCurrentPosition()
            }

            // Function to get duration
            AsyncFunction("getDuration") { view: MpvPlayerView ->
                view.getDuration()
            }

            // Picture in Picture functions
            AsyncFunction("startPictureInPicture") { view: MpvPlayerView ->
                view.startPictureInPicture()
            }

            AsyncFunction("stopPictureInPicture") { view: MpvPlayerView ->
                view.stopPictureInPicture()
            }

            AsyncFunction("isPictureInPictureSupported") { view: MpvPlayerView ->
                view.isPictureInPictureSupported()
            }

            AsyncFunction("isPictureInPictureActive") { view: MpvPlayerView ->
                view.isPictureInPictureActive()
            }

            // Subtitle functions
            AsyncFunction("getSubtitleTracks") { view: MpvPlayerView ->
                view.getSubtitleTracks()
            }

            AsyncFunction("setSubtitleTrack") { view: MpvPlayerView, trackId: Int ->
                view.setSubtitleTrack(trackId)
            }

            AsyncFunction("disableSubtitles") { view: MpvPlayerView ->
                view.disableSubtitles()
            }

            AsyncFunction("getCurrentSubtitleTrack") { view: MpvPlayerView ->
                view.getCurrentSubtitleTrack()
            }

            AsyncFunction("addSubtitleFile") { view: MpvPlayerView, url: String, select: Boolean ->
                view.addSubtitleFile(url, select)
            }

            // Subtitle positioning functions
            AsyncFunction("setSubtitlePosition") { view: MpvPlayerView, position: Int ->
                view.setSubtitlePosition(position)
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

            AsyncFunction("setSubtitleFontSize") { view: MpvPlayerView, size: Int ->
                view.setSubtitleFontSize(size)
            }

            // Audio track functions
            AsyncFunction("getAudioTracks") { view: MpvPlayerView ->
                view.getAudioTracks()
            }

            AsyncFunction("setAudioTrack") { view: MpvPlayerView, trackId: Int ->
                view.setAudioTrack(trackId)
            }

            AsyncFunction("getCurrentAudioTrack") { view: MpvPlayerView ->
                view.getCurrentAudioTrack()
            }

            // Video scaling functions
            AsyncFunction("setZoomedToFill") { view: MpvPlayerView, zoomed: Boolean ->
                view.setZoomedToFill(zoomed)
            }

            AsyncFunction("isZoomedToFill") { view: MpvPlayerView ->
                view.isZoomedToFill()
            }

            // Technical info function
            AsyncFunction("getTechnicalInfo") { view: MpvPlayerView ->
                view.getTechnicalInfo()
            }

            // Defines events that the view can send to JavaScript
            Events("onLoad", "onPlaybackStateChange", "onProgress", "onError", "onTracksReady")
        }
    }
}
