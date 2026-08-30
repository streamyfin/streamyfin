package expo.modules.mpvplayer.nativeplayer

import android.os.Handler
import android.os.HandlerThread
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PlayerAlreadyPresentedException :
    CodedException("A native player is already presented; call load() to swap the stream instead")

class NoActivePlayerException :
    CodedException("No native player is currently presented")

class InvalidStreamUrlException :
    CodedException("The stream config contains an unparseable URL")

class NativePlayerModule : Module() {

    private var session: NativePlayerSession? = null

    // HandlerThread for off-main MPV property reads to prevent UI thread blockage
    private val propsThread = HandlerThread("mpv-props").apply { start() }
    private val propsHandler = Handler(propsThread.looper)

    override fun definition() = ModuleDefinition {
        Name("NativePlayer")

        Events(
            "onLoad", "onProgress", "onPlaybackStateChange", "onError",
            "onTracksReady", "onPictureInPictureChange",
            "onTrackSelectionRequested", "onSpeedChange",
            "onQualitySelected", "onSubtitleScaleChange",
            "onOrientationChangeRequested",
            "onNextEpisodeRequested", "onPreviousEpisodeRequested",
            "onEpisodeSelected", "onPlaybackEnded", "onDismiss",
            "onSubtitleSearchRequested", "onSubtitleDownloadRequested",
            "onMuteStateChanged"
        )

        // MARK: - Lifecycle

        AsyncFunction("presentPlayer") { config: PlayerPresentConfigRecord, promise: Promise ->
            if (this@NativePlayerModule.session != null) {
                promise.reject(PlayerAlreadyPresentedException())
                return@AsyncFunction
            }
            if (config.stream.toVideoLoadConfig() == null) {
                promise.reject(InvalidStreamUrlException())
                return@AsyncFunction
            }

            val newSession = NativePlayerSession(
                emit = { name, payload ->
                    sendEvent(name, payload)
                },
                onTornDown = {
                    this@NativePlayerModule.session = null
                },
                presenterProvider = {
                    appContext.currentActivity
                }
            )
            this@NativePlayerModule.session = newSession

            try {
                newSession.present(config, promise)
            } catch (e: Exception) {
                this@NativePlayerModule.session = null
                promise.reject("PRESENT_FAILED", e.message, e)
            }
        }

        AsyncFunction("load") { config: PlayerPresentConfigRecord, promise: Promise ->
            val s = this@NativePlayerModule.session
            if (s == null) {
                promise.reject(NoActivePlayerException())
                return@AsyncFunction
            }
            if (config.stream.toVideoLoadConfig() == null) {
                promise.reject(InvalidStreamUrlException())
                return@AsyncFunction
            }
            s.load(config)
            promise.resolve(null)
        }

        AsyncFunction("dismiss") { promise: Promise ->
            val s = this@NativePlayerModule.session
            if (s == null) {
                promise.resolve(null)
                return@AsyncFunction
            }
            s.dismiss(reason = "programmatic") {
                promise.resolve(null)
            }
        }

        Function("isPresented") {
            this@NativePlayerModule.session != null
        }

        // MARK: - Late-Arriving Data Pushes

        AsyncFunction("updateSegments") { segments: List<MediaSegmentRecord> ->
            this@NativePlayerModule.session?.viewModel?.updateSegments(segments)
        }

        AsyncFunction("updateNextEpisode") { next: NextEpisodeRecord? ->
            this@NativePlayerModule.session?.viewModel?.updateNextEpisode(next)
        }

        AsyncFunction("updateChapters") { chapters: List<ChapterRecord> ->
            this@NativePlayerModule.session?.viewModel?.updateChapters(chapters)
        }

        AsyncFunction("updateTrickplay") { trickplay: TrickplayRecord? ->
            this@NativePlayerModule.session?.viewModel?.updateTrickplay(trickplay)
        }

        AsyncFunction("updateTrackMenus") { menus: TrackMenusRecord ->
            this@NativePlayerModule.session?.viewModel?.updateTrackMenus(menus)
        }

        AsyncFunction("updateMetadata") { metadata: MetadataRecord ->
            this@NativePlayerModule.session?.viewModel?.updateMetadata(metadata)
        }

        AsyncFunction("updateEpisodeList") { episodes: List<EpisodeListItemRecord> ->
            this@NativePlayerModule.session?.viewModel?.updateEpisodeList(episodes)
        }

        AsyncFunction("updateSubtitleSearch") { state: SubtitleSearchStateRecord ->
            this@NativePlayerModule.session?.viewModel?.updateSubtitleSearch(state)
        }

        // Transient one-line notice on the player's own notice surface, for
        // things the JS coordinator decides (automatic subtitles on mute).
        AsyncFunction("showNotice") { text: String ->
            this@NativePlayerModule.session?.viewModel?.showNotice(text)
        }

        // Jellyfin remote ToggleMute. Same entry point as the TV mute button.
        AsyncFunction("toggleMute") {
            this@NativePlayerModule.session?.viewModel?.toggleMute()
        }

        AsyncFunction("addExternalSubtitle") { url: String ->
            this@NativePlayerModule.session?.renderer?.addSubtitleFile(url, select = true)
        }

        // MARK: - Transport

        AsyncFunction("play") {
            this@NativePlayerModule.session?.viewModel?.play()
        }

        AsyncFunction("pause") {
            this@NativePlayerModule.session?.viewModel?.pause()
        }

        // Main queue, as on iOS: viewModel.seekTo syncs the window's
        // keep-screen-on flag, which only the main thread may touch. On the
        // default background queue that threw mid-call, after the mpv seek but
        // before the tick that moves JS's tracked position, so a backward
        // remote seek followed by an exit reported the pre-seek position.
        AsyncFunction("seekTo") { positionSec: Double ->
            this@NativePlayerModule.session?.viewModel?.seekTo(positionSec)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("setSpeed") { speed: Double ->
            this@NativePlayerModule.session?.viewModel?.setSpeed(speed)
        }

        AsyncFunction("getCurrentPosition") {
            this@NativePlayerModule.session?.viewModel?.displayPosition ?: 0.0
        }

        AsyncFunction("getDuration") {
            this@NativePlayerModule.session?.viewModel?.duration ?: 0.0
        }

        // MARK: - Track plumbing & technical info (executed off-main)

        AsyncFunction("getSubtitleTracks") { promise: Promise ->
            val r = this@NativePlayerModule.session?.renderer
            if (r == null) {
                promise.resolve(emptyList<Map<String, Any>>())
                return@AsyncFunction
            }
            propsHandler.post {
                val tracks = r.getSubtitleTracks()
                promise.resolve(tracks)
            }
        }

        AsyncFunction("setSubtitleTrack") { mpvId: Int ->
            this@NativePlayerModule.session?.renderer?.setSubtitleTrack(mpvId)
        }

        AsyncFunction("disableSubtitles") {
            this@NativePlayerModule.session?.renderer?.disableSubtitles()
        }

        AsyncFunction("getAudioTracks") { promise: Promise ->
            val r = this@NativePlayerModule.session?.renderer
            if (r == null) {
                promise.resolve(emptyList<Map<String, Any>>())
                return@AsyncFunction
            }
            propsHandler.post {
                val tracks = r.getAudioTracks()
                promise.resolve(tracks)
            }
        }

        AsyncFunction("setAudioTrack") { mpvId: Int ->
            this@NativePlayerModule.session?.renderer?.setAudioTrack(mpvId)
        }

        AsyncFunction("getTechnicalInfo") { promise: Promise ->
            val r = this@NativePlayerModule.session?.renderer
            if (r == null) {
                promise.resolve(emptyMap<String, Any>())
                return@AsyncFunction
            }
            propsHandler.post {
                val info = r.getTechnicalInfo()
                promise.resolve(info)
            }
        }

        OnDestroy {
            this@NativePlayerModule.session?.teardownImmediately()
            this@NativePlayerModule.session = null
            propsThread.quitSafely()
        }
    }
}
