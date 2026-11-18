package expo.modules.mpvplayer.cast.playback

import expo.modules.mpvplayer.cast.engine.CastLoadResult
import expo.modules.mpvplayer.cast.receiver.ReceiverLoadOutcome
import expo.modules.mpvplayer.cast.receiver.ReceiverPlayRequest
import expo.modules.mpvplayer.cast.receiver.ReceiverServer
import expo.modules.mpvplayer.cast.target.RemoteTargetSnapshot
import expo.modules.mpvplayer.cast.target.TargetPhase
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.engine.RemoteEngine
import expo.modules.mpvplayer.nativeplayer.engine.TransportEngine

/**
 * Holds the remote engine for as long as the connection to the TV lasts, not as long as a screen: one is
 * born when a session is connected and JS gave a server, lives through a suspension of the session and
 * through closed screens, and goes with the session or the server, sending nothing to the TV.
 *
 * The holder is the engine's permanent delegate: it keeps pause, loading, position and duration, relays
 * every call to the screen attached, and publishes a snapshot on each change but the position. Main
 * thread only; [snapshot] can be read from any thread.
 */
class RemotePlayback(
    private var engineFactory: (ReceiverServer) -> RemoteEngine? = { null },
    private val log: (String) -> Unit = {},
) : TransportEngine.Delegate {
    var engine: RemoteEngine? = null
        private set

    private var server: ReceiverServer? = null
    private var sessionHolds = false
    private var suspended = false
    private var screen: TransportEngine.Delegate? = null
    private val listeners = mutableListOf<(RemotePlaybackSnapshot) -> Unit>()

    // What the engine last said, for a screen that attaches later.
    private var paused = true
    private var loading = false
    private var readyToSeek = false

    @Volatile private var position = 0.0
    @Volatile private var duration = 0.0
    @Volatile private var state = RemotePlaybackSnapshot.NONE

    /** The state of the moment, with the position the engine last reported. */
    val snapshot: RemotePlaybackSnapshot
        get() = state.copy(positionSec = position, durationSec = duration)

    /** installDefault hands the factory over once Cast is there: the SDK's engine, or the fake one with the fake receivers. */
    fun useFactory(factory: (ReceiverServer) -> RemoteEngine?) {
        engineFactory = factory
        reconcile()
    }

    /**
     * The account's server; none, and no engine is made. Another one while an engine lives goes to it, whose next
     * commands carry it: an open screen keeps its engine through an address switched on another network or a TV
     * renamed.
     */
    fun setServer(server: ReceiverServer?) {
        if (server == this.server) return
        this.server = server
        val engine = engine
        if (server != null && engine != null) {
            engine.useServer(server)
            return
        }
        drop()
        reconcile()
    }

    /** Plays [request] on the TV through the session's engine, under [server]; never sent without one. */
    fun load(server: ReceiverServer, request: ReceiverPlayRequest, onResult: (CastLoadResult) -> Unit) {
        val engine = engine ?: return onResult(CastLoadResult.NotSent(NO_ENGINE_ERROR))
        engine.load(server, request, onResult)
    }

    /** The TV's item again where it is, under [server]; nothing without an engine. */
    fun reload(server: ReceiverServer) {
        engine?.reloadCurrentItem(server)
    }

    /** The audio track the remote player's menu chose, by Jellyfin index; nothing without an engine. */
    fun setAudioTrack(index: Int) {
        engine?.setAudioTrack(index)
    }

    /** The subtitle the remote player's menu chose, by Jellyfin index; -1 turns them off. */
    fun setSubtitleTrack(index: Int) {
        val engine = engine ?: return
        if (index < 0) engine.disableSubtitles() else engine.setSubtitleTrack(index)
    }

    /** What the target hub says of the session: connected, or suspended while the SDK tries to resume it. */
    fun targetChanged(connected: Boolean, suspended: Boolean) {
        sessionHolds = connected
        this.suspended = connected && suspended
        reconcile()
    }

    /** Lends the engine to a screen, brought up to date at once; null without one. */
    fun attachScreen(delegate: TransportEngine.Delegate): RemoteEngine? {
        val engine = engine ?: return null
        screen = delegate
        delegate.onLoadingChanged(loading)
        delegate.onPauseChanged(paused)
        delegate.onPositionChanged(position, duration, 0.0)
        if (readyToSeek && engine.currentItemId != null) delegate.onReadyToSeek()
        return engine
    }

    /** The screen gives the engine back: it hears nothing more, and the engine plays on. */
    fun detachScreen(delegate: TransportEngine.Delegate) {
        if (screen === delegate) screen = null
    }

    fun addListener(listener: (RemotePlaybackSnapshot) -> Unit): () -> Unit {
        listeners += listener
        return { listeners.remove(listener) }
    }

    // A session that is connected and a server make an engine; a suspended session keeps the one it had but
    // makes none, as the engine binds only to a connected session.
    private fun reconcile() {
        val server = server
        if (!sessionHolds || server == null) {
            drop()
        } else if (engine == null && !suspended) {
            engineFactory(server)?.let { made ->
                engine = made
                made.delegate = this
                made.onStateChanged = { publish() }
                log("engine made for the session")
                made.start(PlayerEngine.Owner.NATIVE_SESSION) {}
            }
        }
        publish()
    }

    // Detaching sends nothing: the TV plays on.
    private fun drop() {
        val engine = engine ?: return
        this.engine = null
        engine.onStateChanged = null
        engine.delegate = null
        engine.stop()
        paused = true
        loading = false
        readyToSeek = false
        position = 0.0
        duration = 0.0
        log("engine dropped")
    }

    private fun publish() {
        val engine = engine
        val next = RemotePlaybackSnapshot(
            connected = sessionHolds && server != null,
            phase = engine?.phase ?: RemotePlaybackSnapshot.NONE.phase,
            reconnecting = suspended || engine?.reconnecting == true,
            itemId = engine?.currentItemId,
            positionSec = 0.0,
            durationSec = 0.0,
            audioIndex = engine?.getCurrentAudioTrack() ?: -1,
            subtitleIndex = engine?.getCurrentSubtitleTrack() ?: -1,
            queueItemIds = engine?.queueItemIds ?: emptyList(),
            playingIndex = engine?.playingIndex ?: -1,
            foreign = engine?.foreign == true,
            title = engine?.mediaTitle,
            imageUrl = engine?.mediaImageUrl,
            playMethod = engine?.playMethod,
        )
        if (next.itemId == null) readyToSeek = false
        if (next == state) return
        state = next
        val published = snapshot
        listeners.toList().forEach { it(published) }
    }

    // TransportEngine.Delegate: kept, then relayed to the screen attached.

    override fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double) {
        this.position = position
        this.duration = duration
        screen?.onPositionChanged(position, duration, cacheSeconds)
    }

    override fun onSeekCompleted(requestId: Long, position: Double, duration: Double, cacheSeconds: Double) {
        this.position = position
        this.duration = duration
        screen?.onSeekCompleted(requestId, position, duration, cacheSeconds)
    }

    override fun onPauseChanged(isPaused: Boolean) {
        paused = isPaused
        screen?.onPauseChanged(isPaused)
    }

    override fun onLoadingChanged(isLoading: Boolean) {
        loading = isLoading
        screen?.onLoadingChanged(isLoading)
    }

    override fun onReadyToSeek() {
        readyToSeek = true
        screen?.onReadyToSeek()
    }

    override fun onTracksReady() {
        screen?.onTracksReady()
    }

    override fun onError(message: String) {
        screen?.onError(message)
    }

    override fun onVideoDimensionsChanged(width: Int, height: Int) {
        screen?.onVideoDimensionsChanged(width, height)
    }

    override fun onPlaybackEnded() {
        screen?.onPlaybackEnded()
    }

    override fun onChaptersChanged(chapters: List<Map<String, Any>>) {
        screen?.onChaptersChanged(chapters)
    }

    companion object {
        /** The one the module, the remote screen and the debug probe share; installDefault gives it its factory. */
        val shared = RemotePlayback()

        const val NO_ENGINE_ERROR = "No remote engine: no Cast session, or no server from JS"

        /** A load's answer as JS reads it (RemoteLoadResult in Cast.types.ts): a failure names its code. */
        fun resultForJs(result: CastLoadResult): Map<String, Any> = when (result) {
            is CastLoadResult.NotSent -> mapOf("outcome" to "notSent", "error" to result.error)
            is CastLoadResult.Settled -> when (val outcome = result.outcome) {
                ReceiverLoadOutcome.Loaded -> mapOf("outcome" to "loaded")
                ReceiverLoadOutcome.Superseded -> mapOf("outcome" to "superseded")
                ReceiverLoadOutcome.TimedOut -> mapOf("outcome" to "timedOut")
                is ReceiverLoadOutcome.Failed -> mapOf("outcome" to "failed", "error" to outcome.error.wireName)
            }
        }

        /** The engine a session gets: the fake one for a tier 1 build's fake receivers, which have no TV behind them. */
        fun factoryFor(
            fake: Boolean,
            real: (ReceiverServer) -> RemoteEngine?,
            fakeEngine: () -> RemoteEngine,
        ): (ReceiverServer) -> RemoteEngine? = if (fake) ({ _ -> fakeEngine() }) else real

        /** The hub's state as a session: (connected, suspended). Connecting without reconnecting is no session yet. */
        fun sessionOf(snapshot: RemoteTargetSnapshot): Pair<Boolean, Boolean> = when {
            snapshot.phase == TargetPhase.CONNECTED -> true to false
            snapshot.phase == TargetPhase.CONNECTING && snapshot.reconnecting -> true to true
            else -> false to false
        }
    }
}
