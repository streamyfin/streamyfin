package expo.modules.mpvplayer.nativeplayer

import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.mpvplayer.DeviceKind
import expo.modules.mpvplayer.cast.engine.mainLooperSchedule
import expo.modules.mpvplayer.cast.target.RemoteTargets
import expo.modules.mpvplayer.nativeplayer.remote.FakeRemoteEngine
import expo.modules.mpvplayer.nativeplayer.remote.RemoteEngineLease
import expo.modules.mpvplayer.nativeplayer.remote.RemotePlayerSession
import expo.modules.mpvplayer.nativeplayer.engine.NativeEngineKind
import expo.modules.mpvplayer.nativeplayer.engine.technicalInfoOf

class PlayerAlreadyPresentedException :
    CodedException("A native player is already presented; call load() to swap the stream instead")

class NoActivePlayerException :
    CodedException("No native player is currently presented")

class InvalidStreamUrlException :
    CodedException("The stream config contains an unparseable URL")

class UnsupportedEngineException(name: String?) :
    CodedException("The native player does not run the engine \"$name\"")

class NoRemoteEngineException :
    CodedException("No remote engine to present a remote player over")

class RemotePlayerUnsupportedException :
    CodedException("This device does not present a remote player")

/**
 * Why presentRemotePlayer refuses, checked in this order: a player already up (local or remote), a TV (TVs
 * do not cast), then no remote engine to drive; null when it presents.
 */
internal fun remotePresentRefusal(presented: Boolean, hasRemoteEngine: Boolean, isTv: Boolean): CodedException? = when {
    presented -> PlayerAlreadyPresentedException()
    isTv -> RemotePlayerUnsupportedException()
    !hasRemoteEngine -> NoRemoteEngineException()
    else -> null
}

/** Why presentPlayer refuses [config] before it builds a session, checked in this order; null when it presents it. */
internal fun presentRefusal(presented: Boolean, config: PlayerPresentConfigRecord): CodedException? = when {
    presented -> PlayerAlreadyPresentedException()
    config.stream.toVideoLoadConfig() == null -> InvalidStreamUrlException()
    NativeEngineKind.of(config.engine) == null -> UnsupportedEngineException(config.engine)
    else -> null
}

class NativePlayerModule : Module() {

    /** The player presented, local or remote: one at a time. */
    private var presented: PresentedPlayer? = null

    /** The local player, for its own calls: load, mpv tracks, SyncPlay, technical info. */
    private val session: NativePlayerSession? get() = presented as? NativePlayerSession

    /** What JS's transport calls reach: the local player's view model, never the remote one's. */
    private val transport: PlayerViewModel? get() = jsTransportTarget(presented)

    // HandlerThread for off-main MPV property reads to prevent UI thread blockage
    private val propsThread = HandlerThread("mpv-props").apply { start() }
    private val propsHandler = Handler(propsThread.looper)

    /**
     * The remote engine a screen borrows, null without one. Tier 1 builds (fake Cast receivers) lend a fake
     * TV, stopped when the screen hands it back; the engine bound to a real Cast session comes later.
     */
    private fun remoteEngineLease(): RemoteEngineLease? {
        if (!RemoteTargets.fakeDevices) return null
        val main = Handler(Looper.getMainLooper())
        val fake = FakeRemoteEngine(
            schedule = mainLooperSchedule(),
            runOnMain = { block -> if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block) },
        )
        return RemoteEngineLease(fake) { fake.stop() }
    }

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
            "onMuteStateChanged", "onSyncPlayAction", "onCastHandOffRequested"
        )

        // MARK: - Lifecycle

        AsyncFunction("presentPlayer") { config: PlayerPresentConfigRecord, promise: Promise ->
            presentRefusal(this@NativePlayerModule.presented != null, config)?.let {
                promise.reject(it)
                return@AsyncFunction
            }

            val newSession = NativePlayerSession(
                emit = { name, payload ->
                    sendEvent(name, payload)
                },
                onTornDown = {
                    this@NativePlayerModule.presented = null
                },
                presenterProvider = {
                    appContext.currentActivity
                }
            )
            this@NativePlayerModule.presented = newSession

            try {
                newSession.present(config, promise)
            } catch (e: Exception) {
                this@NativePlayerModule.presented = null
                promise.reject("PRESENT_FAILED", e.message, e)
            }
        }

        // The remote player: the chrome over a remote engine, apart from the local player's entry.
        AsyncFunction("presentRemotePlayer") { config: RemotePlayerConfigRecord, promise: Promise ->
            val context = appContext.reactContext
            val isTv = context != null && DeviceKind.isTelevision(context)
            val alreadyPresented = this@NativePlayerModule.presented != null
            val lease = if (!alreadyPresented && !isTv) remoteEngineLease() else null
            remotePresentRefusal(presented = alreadyPresented, hasRemoteEngine = lease != null, isTv = isTv)?.let {
                promise.reject(it)
                return@AsyncFunction
            }
            val activity = appContext.currentActivity
            if (lease == null || activity == null) {
                lease?.release()
                promise.reject("NO_PRESENTER", "Could not find an Activity to present the remote player from", null)
                return@AsyncFunction
            }
            val remote = RemotePlayerSession(
                lease = lease,
                emit = { name, body -> sendEvent(name, body) },
                onTornDown = { this@NativePlayerModule.presented = null },
            )
            this@NativePlayerModule.presented = remote
            try {
                remote.present(activity, config)
                promise.resolve(null)
            } catch (e: Exception) {
                remote.teardownImmediately()
                this@NativePlayerModule.presented = null
                promise.reject("PRESENT_FAILED", e.message, e)
            }
        }.runOnQueue(Queues.MAIN)

        // The remote screen's colors, once JS knows the artwork's: nothing when no remote screen is up.
        AsyncFunction("updateRemotePlayerTint") { tint: RemoteTintRecord ->
            (this@NativePlayerModule.presented as? RemotePlayerSession)?.updateTint(tint)
        }.runOnQueue(Queues.MAIN)

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
            val s = this@NativePlayerModule.presented
            if (s == null) {
                promise.resolve(null)
                return@AsyncFunction
            }
            s.dismiss(reason = "programmatic") {
                promise.resolve(null)
            }
        }

        Function("isPresented") {
            this@NativePlayerModule.presented != null
        }

        // MARK: - Late-Arriving Data Pushes

        AsyncFunction("updateSyncPlay") { state: SyncPlayStateRecord? ->
            this@NativePlayerModule.session?.viewModel?.updateSyncPlay(state)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("applySyncPlayCommand") { command: SyncPlayCommandRecord, promise: Promise ->
            val vm = this@NativePlayerModule.session?.viewModel
            if (vm == null) promise.resolve(false)
            else vm.applySyncPlayCommand(command) { applied -> promise.resolve(applied) }
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("cancelSyncPlayCommands") {
            this@NativePlayerModule.session?.viewModel?.cancelSyncPlayCommands()
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("updateSegments") { segments: List<MediaSegmentRecord> ->
            this@NativePlayerModule.presented?.viewModel?.updateSegments(segments)
        }

        AsyncFunction("updateNextEpisode") { next: NextEpisodeRecord? ->
            this@NativePlayerModule.presented?.viewModel?.updateNextEpisode(next)
        }

        AsyncFunction("updateChapters") { chapters: List<ChapterRecord> ->
            this@NativePlayerModule.presented?.viewModel?.updateChapters(chapters)
        }

        AsyncFunction("updateTrickplay") { trickplay: TrickplayRecord? ->
            this@NativePlayerModule.presented?.viewModel?.updateTrickplay(trickplay)
        }

        AsyncFunction("updateTrackMenus") { menus: TrackMenusRecord ->
            this@NativePlayerModule.presented?.viewModel?.updateTrackMenus(menus)
        }

        AsyncFunction("updateMetadata") { metadata: MetadataRecord ->
            this@NativePlayerModule.presented?.viewModel?.updateMetadata(metadata)
        }

        AsyncFunction("updateEpisodeList") { episodes: List<EpisodeListItemRecord> ->
            this@NativePlayerModule.presented?.viewModel?.updateEpisodeList(episodes)
        }

        AsyncFunction("updateSubtitleSearch") { state: SubtitleSearchStateRecord ->
            this@NativePlayerModule.presented?.viewModel?.updateSubtitleSearch(state)
        }

        // Transient one-line notice on the player's own notice surface, for
        // things the JS coordinator decides (automatic subtitles on mute).
        AsyncFunction("showNotice") { text: String ->
            this@NativePlayerModule.presented?.viewModel?.showNotice(text)
        }

        // Jellyfin remote ToggleMute. Same entry point as the TV mute button.
        AsyncFunction("toggleMute") {
            this@NativePlayerModule.transport?.toggleMute()
        }

        AsyncFunction("addExternalSubtitle") { url: String ->
            this@NativePlayerModule.session?.engine?.addSubtitleFile(url, select = true)
        }

        // MARK: - Transport

        AsyncFunction("play") {
            this@NativePlayerModule.transport?.playLocal()
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("pause") {
            this@NativePlayerModule.transport?.pauseLocal()
        }.runOnQueue(Queues.MAIN)

        // Main queue, as on iOS: viewModel.seekTo syncs the window's
        // keep-screen-on flag, which only the main thread may touch. On the
        // default background queue that threw mid-call, after the mpv seek but
        // before the tick that moves JS's tracked position, so a backward
        // remote seek followed by an exit reported the pre-seek position.
        AsyncFunction("seekTo") { positionSec: Double ->
            this@NativePlayerModule.transport?.seekLocal(positionSec)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("setSpeed") { speed: Double ->
            this@NativePlayerModule.transport?.setSpeed(speed)
        }

        AsyncFunction("getCurrentPosition") {
            this@NativePlayerModule.session?.viewModel?.displayPosition ?: 0.0
        }

        AsyncFunction("getDuration") {
            this@NativePlayerModule.session?.viewModel?.duration ?: 0.0
        }

        // MARK: - Track plumbing & technical info (executed off-main)

        AsyncFunction("getSubtitleTracks") { promise: Promise ->
            val r = this@NativePlayerModule.session?.engine
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
            this@NativePlayerModule.session?.engine?.setSubtitleTrack(mpvId)
        }

        AsyncFunction("disableSubtitles") {
            this@NativePlayerModule.session?.engine?.disableSubtitles()
        }

        AsyncFunction("getAudioTracks") { promise: Promise ->
            val r = this@NativePlayerModule.session?.engine
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
            this@NativePlayerModule.session?.engine?.setAudioTrack(mpvId)
        }

        AsyncFunction("getTechnicalInfo") { promise: Promise ->
            val r = this@NativePlayerModule.session?.engine
            if (r == null) {
                promise.resolve(emptyMap<String, Any>())
                return@AsyncFunction
            }
            propsHandler.post {
                val info = technicalInfoOf(r)
                promise.resolve(info)
            }
        }

        OnDestroy {
            this@NativePlayerModule.presented?.teardownImmediately()
            this@NativePlayerModule.presented = null
            propsThread.quitSafely()
        }
    }
}
