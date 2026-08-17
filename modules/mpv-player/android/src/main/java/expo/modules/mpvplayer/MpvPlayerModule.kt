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

                // Parse cache config if provided (mirrors iOS)
                @Suppress("UNCHECKED_CAST")
                val cacheConfig = source["cacheConfig"] as? Map<String, Any?>

                @Suppress("UNCHECKED_CAST")
                val config = VideoLoadConfig(
                    url = urlString,
                    headers = source["headers"] as? Map<String, String>,
                    externalSubtitles = source["externalSubtitles"] as? List<String>,
                    startPosition = (source["startPosition"] as? Number)?.toDouble(),
                    autoplay = (source["autoplay"] as? Boolean) ?: true,
                    initialSubtitleId = (source["initialSubtitleId"] as? Number)?.toInt(),
                    initialAudioId = (source["initialAudioId"] as? Number)?.toInt(),
                    voDriver = source["voDriver"] as? String,
                    cacheEnabled = cacheConfig?.get("enabled") as? String,
                    cacheSeconds = (cacheConfig?.get("cacheSeconds") as? Number)?.toInt(),
                    demuxerMaxBytes = (cacheConfig?.get("maxBytes") as? Number)?.toInt(),
                    demuxerMaxBackBytes = (cacheConfig?.get("maxBackBytes") as? Number)?.toInt()
                )
                
                view.loadVideo(config)
            }

            // Now Playing metadata for media controls (iOS-only, no-op on Android)
            // Android handles media session differently via MediaSessionCompat.
            // Typed loosely on purpose: the metadata carries nested values
            // (artworkHeaders), and a Map<String, String> signature makes Expo
            // reject the whole prop rather than ignore what it can't convert.
            Prop("nowPlayingMetadata") { _: MpvPlayerView, _: Map<String, Any?>? ->
                // No-op on Android - media session integration would require MediaSessionCompat
            }

            // Async function to play video
            AsyncFunction("play") { view: MpvPlayerView ->
                view.play()
            }

            // Async function to pause video
            AsyncFunction("pause") { view: MpvPlayerView ->
                view.pause()
            }

            // Stop playback and release the MediaCodec decoder + demuxer.
            // Does not synchronously tear down the native mpv handle (see
            // MPVLib / MpvPlayerView.destroy docs). Call before navigating
            // away from the player screen to avoid OOM during screen
            // transitions on low-RAM devices.
            AsyncFunction("destroy") { view: MpvPlayerView ->
                view.destroy()
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

            AsyncFunction("setSubtitleBorderStyle") { view: MpvPlayerView, style: String ->
                view.setSubtitleBorderStyle(style)
            }

            AsyncFunction("setSubtitleBackgroundColor") { view: MpvPlayerView, color: String ->
                view.setSubtitleBackgroundColor(color)
            }

            AsyncFunction("setSubtitleAssOverride") { view: MpvPlayerView, mode: String ->
                view.setSubtitleAssOverride(mode)
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
            Events("onLoad", "onPlaybackStateChange", "onProgress", "onError", "onTracksReady", "onPictureInPictureChange")
        }
    }
}
