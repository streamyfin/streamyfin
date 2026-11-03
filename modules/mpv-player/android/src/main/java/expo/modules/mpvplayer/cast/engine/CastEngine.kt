package expo.modules.mpvplayer.cast.engine

import expo.modules.mpvplayer.cast.ReceiverBusListener
import expo.modules.mpvplayer.cast.ReceiverChannelHub
import expo.modules.mpvplayer.cast.ReceiverSubscription
import expo.modules.mpvplayer.cast.receiver.ReceiverCustomData
import expo.modules.mpvplayer.cast.receiver.ReceiverItem
import expo.modules.mpvplayer.cast.receiver.ReceiverLoadOutcome
import expo.modules.mpvplayer.cast.receiver.ReceiverLoadTracker
import expo.modules.mpvplayer.cast.receiver.ReceiverMessage
import expo.modules.mpvplayer.cast.receiver.ReceiverPlayRequest
import expo.modules.mpvplayer.cast.receiver.ReceiverProtocol
import expo.modules.mpvplayer.cast.receiver.ReceiverServer
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.engine.QueueEngine
import expo.modules.mpvplayer.nativeplayer.engine.TransportEngine
import expo.modules.mpvplayer.nativeplayer.engine.VideoLoadConfig
import org.json.JSONObject
import kotlin.math.roundToLong

/**
 * Plays Jellyfin items on the Cast receiver behind the TransportEngine and QueueEngine faces: the
 * media channel carries play, pause and the seeks the receiver does in place, the receiver's bus the
 * rest. It decodes nothing and reaches the SDK only through its ports (spec §4.1).
 *
 * Every SDK call has to run on the main thread: each public entry goes through [runOnMain], the port
 * and hub callbacks arrive there, and the getters read fields those callbacks keep current.
 */
class CastEngine(
    server: ReceiverServer,
    private val sessions: CastSessionSource,
    private val hub: ReceiverChannelHub,
    private val schedule: (Long, () -> Unit) -> (() -> Unit),
    private val runOnMain: (() -> Unit) -> Unit,
    private val log: (String) -> Unit = {},
) : TransportEngine, QueueEngine {
    override var delegate: TransportEngine.Delegate? = null
    var bindingListener: CastBindingListener? = null

    // Kept for the interface: it only matters to a local surface coming back.
    override var playbackResumeIntent: Boolean = false

    private var server = server
    private var session: CastSessionPort? = null
    private var media: CastMediaPort? = null
    private var bus: ReceiverSubscription? = null

    // What the last status said, for the getters on any thread. [ours] is null without media and
    // for media another sender loaded, which carries no customData.
    @Volatile private var ours: ReceiverCustomData? = null
    @Volatile private var hasMedia = false
    @Volatile private var playerState = UNKNOWN
    @Volatile private var position = 0.0
    @Volatile private var itemDuration = 0.0
    @Volatile private var volume: Double? = null
    @Volatile private var currentAudio = -1
    @Volatile private var currentSubtitle = -1

    // The customData does not follow a track change (spec §3.3): the latest of what the bus reported
    // and what was sent wins, until the next play session brings its own.
    private var chosenAudio: Int? = null
    private var chosenSubtitle: Int? = null

    private var playSessionId: String? = null
    private var idleReason: String? = null
    private var reportedPause: Boolean? = null
    private var reportedLoading: Boolean? = null
    private var readyToSeekFor: String? = null

    // A standard seek the media channel took: it completes at the next status.
    private var seekToComplete: Long? = null

    // A reload the receiver runs for a Seek it cannot do in place or a track change. The position stays
    // on its target until the new play session reports: the old customData with the new currentTime
    // would land on the old start plus the new time.
    private class Reload(val tracker: ReceiverLoadTracker, val target: Double, val requestId: Long?, val cancelTimer: () -> Unit)

    private var reload: Reload? = null

    private val busListener = object : ReceiverBusListener {
        override fun onMessage(raw: String) = onBusMessage(ReceiverProtocol.parseMessage(raw))
    }

    private val sessionListener = object : CastSessionListener {
        override fun onSuspended(sessionId: String?) = Unit

        override fun onResumed(session: CastSessionPort) = Unit

        override fun onEnded(sessionId: String?, error: String?) = Unit

        override fun onVolumeChanged(volume: Double, muted: Boolean) {
            this@CastEngine.volume = volume
        }
    }

    // A listener per media port: a status the replaced port still had queued must not count.
    private inner class MediaEar(private val port: CastMediaPort) : CastMediaListener {
        override fun onStatusUpdated() {
            if (port === media) onStatus(port)
        }

        override fun onProgress(positionMs: Long) {
            if (port === media) onTick(positionMs)
        }
    }

    // Lifecycle

    override fun start(owner: PlayerEngine.Owner, onStarted: () -> Unit) = runOnMain {
        val current = sessions.current
        if (current == null || !current.isConnected) {
            delegate?.onError(NO_SESSION_ERROR)
            return@runOnMain
        }
        bind(current)
        onStarted()
    }

    // The TV plays on: detaching sends nothing, and never ends the session.
    override fun stop() = runOnMain { detach() }

    private fun bind(session: CastSessionPort) {
        this.session = session
        volume = session.volume
        sessions.setListener(sessionListener)
        bus = hub.subscribe(ReceiverProtocol.NAMESPACE, busListener)
        attachMedia(session.media)
        log("bound to session ${session.sessionId}")
    }

    private fun attachMedia(port: CastMediaPort?) {
        media?.setListener(null, CastEngineConstants.PROGRESS_INTERVAL_MS)
        media = port
        port?.setListener(MediaEar(port), CastEngineConstants.PROGRESS_INTERVAL_MS)
        port?.requestStatus()
    }

    private fun detach() {
        media?.setListener(null, CastEngineConstants.PROGRESS_INTERVAL_MS)
        media = null
        bus?.remove()
        bus = null
        sessions.setListener(null)
        reload?.cancelTimer?.invoke()
        reload = null
        session?.let { log("detached from session ${it.sessionId}") }
        session = null
    }

    // Loading

    // VideoLoadConfig carries a URL only, and the receiver plays Jellyfin items.
    override fun load(config: VideoLoadConfig) = runOnMain {
        log("refused a URL load")
        delegate?.onError(URL_LOAD_ERROR)
    }

    // Reloading the item where it is arrives with the load path.
    override fun reloadCurrentItem() = Unit

    // Transport

    override fun play() = runOnMain { media?.play() }

    override fun pause() = runOnMain { media?.pause() }

    override fun togglePause() = runOnMain { media?.togglePlayback() }

    override fun seekTo(seconds: Double) = runOnMain { seek(seconds, null) }

    override fun seekToTracked(seconds: Double, exact: Boolean, requestId: Long) = runOnMain { seek(seconds, requestId) }

    override fun seekBy(seconds: Double) = runOnMain { seek(position + seconds, null) }

    private fun seek(seconds: Double, requestId: Long?) {
        val port = media ?: return
        val data = ours
        // Nothing loaded, stopped, or live: a Seek by reload would restart a stopped item.
        if (!hasMedia || playerState == IDLE || data?.canSeek == false) return
        val target = if (itemDuration > 0) seconds.coerceIn(0.0, itemDuration) else seconds.coerceAtLeast(0.0)
        if (data == null || data.canClientSeek != false) {
            port.seek((target * 1000).roundToLong()) { succeeded ->
                if (succeeded) {
                    seekToComplete = requestId
                } else {
                    delegate?.onPositionChanged(position, itemDuration, 0.0)
                }
            }
            return
        }
        // The receiver cannot seek in this stream (transcoded music, live TV): Seek reloads it there.
        startReload(target, requestId, data) { send("Seek", JSONObject().put("position", target), it) }
    }

    override fun setSpeed(speed: Double) = Unit

    // The receiver announces no PLAYBACK_RATE: the chrome interpolates at 1x.
    override fun getSpeed(): Double = 1.0

    override fun setMute(muted: Boolean) = runOnMain { session?.setMute(muted) }

    // Chapters come from JS, and seekTo reaches them.
    override fun getChapters(): List<Map<String, Any>> = emptyList()

    // Tracks: the ids are Jellyfin MediaStream indexes, the menus come from JS.

    override fun getSubtitleTracks(): List<Map<String, Any>> = emptyList()

    override fun setSubtitleTrack(trackId: Int) = runOnMain { selectSubtitle(trackId) }

    override fun disableSubtitles() = runOnMain { selectSubtitle(-1) }

    override fun getCurrentSubtitleTrack(): Int = currentSubtitle

    // No receiver command takes a URL.
    override fun addSubtitleFile(url: String, select: Boolean) = Unit

    override fun getAudioTracks(): List<Map<String, Any>> = emptyList()

    override fun setAudioTrack(trackId: Int) = runOnMain {
        val data = loadedItem() ?: return@runOnMain
        chosenAudio = trackId
        updateTracks()
        // The receiver always reloads for an audio change, under a new play session.
        startReload(position, null, data) { send("SetAudioStreamIndex", JSONObject().put("index", trackId), it) }
    }

    override fun getCurrentAudioTrack(): Int = currentAudio

    private fun selectSubtitle(index: Int) {
        val data = loadedItem() ?: return
        chosenSubtitle = index
        updateTracks()
        if (index >= 0 && media?.status?.hasTextTracks == false) {
            // No text track loaded: the receiver would name the index in its reports and show
            // nothing, so the item plays again where it is with that subtitle.
            val request = ReceiverPlayRequest(
                items = listOf(ReceiverItem(id = data.itemId)),
                startPositionTicks = (position * ReceiverProtocol.TICKS_PER_SECOND).roundToLong(),
                mediaSourceId = data.mediaSourceId,
                audioStreamIndex = currentAudio.takeIf { it >= 0 },
                subtitleStreamIndex = index,
                liveStreamId = data.liveStreamId,
            )
            startReload(position, null, data) { failed -> sendMessage("PlayNow", ReceiverProtocol.playNow(server, request), failed) }
            return
        }
        send("SetSubtitleStreamIndex", JSONObject().put("index", index))
    }

    // Local-only processing: the receiver has no such controls.
    override fun setAudioDelay(seconds: Double) = Unit

    override fun setVolumeBoost(percent: Int) = Unit

    override fun setDialogueBoost(enabled: Boolean) = Unit

    override fun setMonoDownmix(enabled: Boolean) = Unit

    // State snapshots

    override val isPausedState: Boolean
        get() = playerState == PAUSED || playerState == IDLE || playerState == UNKNOWN

    override val currentPosition: Double
        get() = position

    override val duration: Double
        get() = itemDuration

    // No Cast on TV.
    override val isTv: Boolean = false

    override val currentItemId: String?
        get() = ours?.itemId

    override val targetVolume: Double?
        get() = volume

    override fun setTargetVolume(level: Double) = runOnMain { session?.setVolume(level.coerceIn(0.0, 1.0)) }

    // What the receiver reports

    private fun onStatus(port: CastMediaPort) {
        val status = port.status
        if (status == null || !status.hasMedia) {
            clearMedia(status?.playerState ?: IDLE)
            return
        }
        val data = status.customData?.let(ReceiverProtocol::parseCustomData)
        val settled = reload?.let { pending -> pending.tracker.onMediaStatus(data, status.playerState)?.let { pending to it } }
        settled?.let { (pending, outcome) -> settleReload(pending, outcome, recompute = false) }
        if (data?.playSessionId != playSessionId) {
            playSessionId = data?.playSessionId
            chosenAudio = null
            chosenSubtitle = null
        }
        ours = data
        hasMedia = true
        itemDuration = durationOf(data, status.streamDurationMs)
        updateTracks()
        if (reload == null) position = ReceiverProtocol.positionInItem(port.approximatePositionMs / 1000.0, data ?: ReceiverCustomData())
        reportState(status.playerState, status.idleReason, data)
        delegate?.onPositionChanged(position, itemDuration, 0.0)
        val completed = settled?.takeIf { it.second == ReceiverLoadOutcome.Loaded }?.first?.requestId ?: seekToComplete
        seekToComplete = null
        completed?.let { delegate?.onSeekCompleted(it, position, itemDuration, 0.0) }
    }

    private fun onTick(positionMs: Long) {
        if (!hasMedia) return
        if (reload == null) position = ReceiverProtocol.positionInItem(positionMs / 1000.0, ours ?: ReceiverCustomData())
        delegate?.onPositionChanged(position, itemDuration, 0.0)
    }

    private fun onBusMessage(message: ReceiverMessage) {
        playStateOf(message)?.let { state ->
            if (state.has("AudioStreamIndex")) chosenAudio = intOrNull(state.opt("AudioStreamIndex"))
            if (state.has("SubtitleStreamIndex")) chosenSubtitle = intOrNull(state.opt("SubtitleStreamIndex"))
            updateTracks()
        }
        reload?.let { pending -> pending.tracker.onMessage(message)?.let { settleReload(pending, it, recompute = true) } }
    }

    private fun clearMedia(state: String) {
        hasMedia = false
        ours = null
        playerState = state
        playSessionId = null
        chosenAudio = null
        chosenSubtitle = null
        updateTracks()
        setPause(true)
    }

    private fun reportState(state: String, reason: String, data: ReceiverCustomData?) {
        val wasError = playerState == IDLE && idleReason == ERROR
        playerState = state
        idleReason = reason
        when (state) {
            PLAYING -> {
                setPause(false)
                setLoading(reload != null)
            }
            PAUSED -> {
                setPause(true)
                setLoading(reload != null)
            }
            BUFFERING, LOADING -> setLoading(true)
            IDLE -> {
                setPause(true)
                when (reason) {
                    ERROR -> if (!wasError) delegate?.onError(PLAYBACK_ERROR)
                    // A stream change for the same item: a new play session follows.
                    INTERRUPTED -> setLoading(true)
                }
            }
        }
        val playSession = data?.playSessionId
        if (data?.canSeek == true && playSession != null && playSession != readyToSeekFor) {
            readyToSeekFor = playSession
            delegate?.onReadyToSeek()
        }
    }

    private fun setPause(paused: Boolean) {
        if (paused == reportedPause) return
        reportedPause = paused
        delegate?.onPauseChanged(paused)
    }

    private fun setLoading(loading: Boolean) {
        if (loading == reportedLoading) return
        reportedLoading = loading
        delegate?.onLoadingChanged(loading)
    }

    // Reloads

    private fun startReload(target: Double, requestId: Long?, data: ReceiverCustomData, send: (failed: (String) -> Unit) -> Unit) {
        reload?.cancelTimer?.invoke()
        val tracker = ReceiverLoadTracker(ReceiverPlayRequest(items = listOf(ReceiverItem(id = data.itemId))), data.playSessionId)
        val cancelTimer = schedule(CastEngineConstants.LOAD_TIMEOUT_MS) {
            reload?.takeIf { it.tracker === tracker }?.let { pending -> pending.tracker.timeOut()?.let { settleReload(pending, it, recompute = true) } }
        }
        reload = Reload(tracker, target, requestId, cancelTimer)
        position = target
        setLoading(true)
        delegate?.onPositionChanged(position, itemDuration, 0.0)
        send { error ->
            // Never sent: nothing will reload, so the position goes back to what the receiver reports.
            reload?.takeIf { it.tracker === tracker }?.let { pending ->
                pending.cancelTimer()
                reload = null
                delegate?.onError(error)
                recomputePosition()
            }
        }
    }

    private fun settleReload(pending: Reload, outcome: ReceiverLoadOutcome, recompute: Boolean) {
        pending.cancelTimer()
        reload = null
        when (outcome) {
            is ReceiverLoadOutcome.Failed -> delegate?.onError(outcome.error.wireName)
            ReceiverLoadOutcome.TimedOut -> delegate?.onError(outcome.wireName)
            ReceiverLoadOutcome.Loaded, ReceiverLoadOutcome.Superseded -> Unit
        }
        if (recompute) recomputePosition()
    }

    // Outside a status: back to the formula of the last one, with the media channel's own estimate.
    private fun recomputePosition() {
        val port = media ?: return
        if (!hasMedia) return
        position = ReceiverProtocol.positionInItem(port.approximatePositionMs / 1000.0, ours ?: ReceiverCustomData())
        setLoading(playerState == BUFFERING || playerState == LOADING)
        delegate?.onPositionChanged(position, itemDuration, 0.0)
    }

    // Sending, never logged: every message carries the access token.

    private fun send(command: String, options: JSONObject, failed: (String) -> Unit = {}) =
        sendMessage(command, ReceiverProtocol.message(command, server, options), failed)

    private fun sendMessage(command: String, message: JSONObject, failed: (String) -> Unit = {}) {
        log("send $command")
        hub.send(ReceiverProtocol.NAMESPACE, message.toString()) { error ->
            if (error == null) return@send
            log("$command not sent: $error")
            failed(error)
        }
    }

    // Helpers

    // Our item, loaded and not stopped: the receiver's commands need one (spec §4).
    private fun loadedItem(): ReceiverCustomData? = ours?.takeIf { hasMedia && playerState != IDLE && it.itemId != null }

    private fun updateTracks() {
        val data = ours
        currentAudio = if (data == null) -1 else chosenAudio ?: data.audioStreamIndex ?: -1
        currentSubtitle = if (data == null) -1 else chosenSubtitle ?: data.subtitleStreamIndex ?: -1
    }

    private fun durationOf(data: ReceiverCustomData?, streamDurationMs: Long): Double {
        val runtimeTicks = data?.runtimeTicks ?: 0L
        return when {
            runtimeTicks > 0 -> runtimeTicks.toDouble() / ReceiverProtocol.TICKS_PER_SECOND
            streamDurationMs > 0 -> streamDurationMs / 1000.0
            else -> 0.0
        }
    }

    // The reporting messages carry data.PlayState, as an object or as the JSON text of one.
    private fun playStateOf(message: ReceiverMessage): JSONObject? {
        val json = (message as? ReceiverMessage.Parsed)?.json ?: return null
        val data = when (val value = json.opt("data")) {
            is JSONObject -> value
            is String -> runCatching { JSONObject(value) }.getOrNull()
            else -> null
        }
        return data?.optJSONObject("PlayState")
    }

    private fun intOrNull(value: Any?): Int? = (value as? Number)?.toInt()

    companion object {
        const val NO_SESSION_ERROR = "No connected Cast session"
        const val URL_LOAD_ERROR = "The Cast engine plays Jellyfin items, not URLs"
        const val PLAYBACK_ERROR = "The receiver stopped on a playback error"
        const val SESSION_REPLACED_ERROR = "The Cast session was replaced"

        // CastMapping's names for the player state and the idle reason.
        private const val PLAYING = "playing"
        private const val PAUSED = "paused"
        private const val BUFFERING = "buffering"
        private const val LOADING = "loading"
        private const val IDLE = "idle"
        private const val UNKNOWN = "unknown"
        private const val ERROR = "error"
        private const val INTERRUPTED = "interrupted"
    }
}
