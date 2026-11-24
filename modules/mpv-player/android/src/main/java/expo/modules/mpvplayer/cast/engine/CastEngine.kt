package expo.modules.mpvplayer.cast.engine

import expo.modules.mpvplayer.cast.ReceiverBusListener
import expo.modules.mpvplayer.cast.ReceiverChannelHub
import expo.modules.mpvplayer.cast.ReceiverSubscription
import expo.modules.mpvplayer.cast.receiver.ReceiverContainerRefused
import expo.modules.mpvplayer.cast.receiver.ReceiverCustomData
import expo.modules.mpvplayer.cast.receiver.ReceiverLoadError
import expo.modules.mpvplayer.cast.receiver.ReceiverItem
import expo.modules.mpvplayer.cast.receiver.ReceiverLoadOutcome
import expo.modules.mpvplayer.cast.receiver.ReceiverLoadTracker
import expo.modules.mpvplayer.cast.receiver.ReceiverMessage
import expo.modules.mpvplayer.cast.receiver.ReceiverPlayRequest
import expo.modules.mpvplayer.cast.receiver.ReceiverProtocol
import expo.modules.mpvplayer.cast.receiver.ReceiverServer
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.engine.RemoteEngine
import expo.modules.mpvplayer.nativeplayer.engine.RemotePhase
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
 *
 * Track ids are Jellyfin MediaStream indexes, not the bridge-facing ids TransportEngine names: the
 * receiver picks its streams by index, and the chrome already emits that index (spec §3.3).
 */
class CastEngine(
    server: ReceiverServer,
    private val sessions: CastSessionSource,
    private val hub: ReceiverChannelHub,
    private val schedule: (Long, () -> Unit) -> (() -> Unit),
    private val runOnMain: (() -> Unit) -> Unit,
    private val log: (String) -> Unit = {},
) : RemoteEngine {
    override var delegate: TransportEngine.Delegate? = null
    var bindingListener: CastBindingListener? = null
    override var onStateChanged: (() -> Unit)? = null

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
    @Volatile private var title: String? = null
    @Volatile private var imageUrl: String? = null
    @Volatile private var playerState = UNKNOWN
    @Volatile private var position = 0.0
    @Volatile private var itemDuration = 0.0
    @Volatile private var volume: Double? = null
    @Volatile private var currentAudio = -1
    @Volatile private var currentSubtitle = -1
    @Volatile private var identity: Boolean? = null

    /**
     * Whether the receiver's Jellyfin identity is this sender's: it keeps the one of the first message
     * since its app started, and this connection started the app when the SDK says so. Null when it
     * does not (spec §5.4).
     */
    val receiverIdentityIsOurs: Boolean?
        get() = identity

    // The customData does not follow a track change (spec §3.3): the latest of what the bus reported
    // and what was sent wins, until the next play session brings its own.
    private var chosenAudio: Int? = null
    private var chosenSubtitle: Int? = null

    // A subtitle picked while the receiver loads: sent then, the receiver names it in its reports and turns no
    // track on (bench, 18/11, 3 times out of 4); sent at the buffering that follows, the receiver turns it off
    // again as its load completes, with the track that load named (3 times out of 3). It goes once the receiver
    // plays, in this play session.
    private class SubtitleOnceLoaded(val index: Int, val previous: Int?)

    private var subtitleOnceLoaded: SubtitleOnceLoaded? = null

    // Whether the receiver has played or paused in this play session: until then its load has not completed, and
    // a buffering status is that load, not a stall.
    private var sessionPlayed = false

    // The play session a reload of ours started, until the receiver plays it: its stream reports 0 until then
    // (bench, 18/11, 3 times out of 3), and the reload's target is where it starts.
    private var reloadStarting = false

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
    private class Reload(
        val tracker: ReceiverLoadTracker,
        val target: Double,
        val requestId: Long?,
        val cancelTimer: () -> Unit,
        // What the request changed that the receiver has to confirm: the chosen track.
        val undo: () -> Unit,
        val itemId: String?,
        val onResult: (CastLoadResult) -> Unit = {},
    )

    private var reload: Reload? = null

    private class PendingLoad(val tracker: ReceiverLoadTracker, val onResult: (CastLoadResult) -> Unit) {
        var cancelTimer: () -> Unit = {}
    }

    private var pendingLoad: PendingLoad? = null

    // A quality asked for while a load or a reload is on its way, or before the receiver plays the stream one
    // started. Between the two streams of a reload the receiver plays nothing, so a pick then was refused while the
    // menu marked it (bench, 18/11, 2 times out of 2): the last one asked for goes once the one on its way has
    // settled and the receiver plays, from where it plays.
    private class QueuedReload(val server: ReceiverServer, val onResult: (CastLoadResult) -> Unit)

    private var queuedReload: QueuedReload? = null

    // What this engine cast, the load's items then the enqueued ones: the receiver's PlayNow replaces
    // its whole queue, so a reload sends it again.
    private var queue: List<ReceiverItem> = emptyList()

    // Where in [queue] the receiver plays: it names the item, not which copy of one queued twice.
    override var playingIndex = -1
        private set

    // Bumped by each load: Play Services hands a send's result over later, and a result that comes
    // back after a newer load no longer describes the receiver's queue.
    private var queueGeneration = 0L

    // Statuses seen so far: Play Services hands a seek's result over after the status that answered it.
    private var statusCount = 0L

    // Set once a load went out: the receiver sends its bus to the last sender that spoke, so after a
    // resume this engine speaks first to hear it again (spec §8, risk 6).
    private var busClaimed = false
    private var suspended = false

    // The receiver applies the envelope of every message, whatever its command: after a resume the
    // bus is reclaimed only for a playback this engine cast. An item of its queue proves nothing, nor
    // does the TV's last play session: another sender can cast the same item, or be what played last,
    // and the receiver would take this envelope for that playback.
    private var reclaimPending = false

    // The play session this engine knows it cast: one its load or reload settled on, or the next of its
    // queue the receiver went on to after an end of its own. It outlives a binding, as the TV plays on.
    private var ownPlaySession: String? = null

    // The id the binding was made with. A CastSession answers null once the SDK has ended it, after
    // a suspend it could not resume (Task 14, run 4), so the end is matched and reported under this.
    private var boundSessionId: String? = null

    // After IDLE + FINISHED the receiver fetches the next item before it buffers: the end waits.
    private var endWait: (() -> Unit)? = null

    // A failed PlaybackInfo comes as a connection error, then a NoCompatibleStream playbackerror that
    // belongs to the same failure.
    private var noCompatibleStreamFollows = false

    // What the state listener last heard: it hears again only when something but the position changed.
    private var heardState: HeardState? = null

    private data class HeardState(
        val phase: RemotePhase,
        val reconnecting: Boolean,
        val itemId: String?,
        val queue: List<String>,
        val playingIndex: Int,
        val audio: Int,
        val subtitle: Int,
        val foreign: Boolean,
        val title: String?,
        val imageUrl: String?,
        val playMethod: String?,
    )

    private val busListener = object : ReceiverBusListener {
        override fun onMessage(raw: String) = onBusMessage(ReceiverProtocol.parseMessage(raw))

        override fun onReady(sessionId: String) = onBusReady(sessionId)

        // The session listener ends the binding, with the SDK's reason: the hub's end carries none.
        override fun onLost(sessionId: String?, ended: Boolean) {
            if (!ended && isBound(sessionId)) suspendBinding()
        }
    }

    // The SDK reports every session: only the bound one's suspend or end concerns the engine.
    private val sessionListener = object : CastSessionListener {
        override fun onSuspended(sessionId: String?) {
            if (isBound(sessionId)) suspendBinding()
        }

        override fun onResumed(session: CastSessionPort) = resumeBinding(session)

        override fun onEnded(sessionId: String?, error: String?) {
            if (isBound(sessionId)) loseBinding(error)
        }

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
        // Bound already: binding again would subscribe the bus listener a second time.
        if (session != null) return@runOnMain
        val current = sessions.current
        if (current == null || !current.isConnected) {
            delegate?.onError(NO_SESSION_ERROR)
            return@runOnMain
        }
        if (bind(current)) onStarted()
    }

    // The TV plays on: detaching sends nothing, and never ends the session.
    override fun stop() = runOnMain { detach() }

    private fun bind(session: CastSessionPort): Boolean {
        this.session = session
        boundSessionId = session.sessionId
        volume = session.volume
        identity = session.wasLaunched
        sessions.setListener(sessionListener)
        val subscription = hub.subscribe(ReceiverProtocol.NAMESPACE, busListener)
        // The hub, still on a session the SDK replaced, announces that one's ready inside the
        // subscribe, which loses this binding: nothing is left to listen to.
        if (this.session !== session) {
            subscription.remove()
            return false
        }
        bus = subscription
        attachMedia(session.media)
        log("bound to session $boundSessionId launched=${session.wasLaunched}")
        return true
    }

    private fun attachMedia(port: CastMediaPort?) {
        media?.setListener(null, CastEngineConstants.PROGRESS_INTERVAL_MS)
        media = port
        port?.setListener(MediaEar(port), CastEngineConstants.PROGRESS_INTERVAL_MS)
        port?.requestStatus()
    }

    private fun detach() {
        pendingLoad?.let { load -> load.tracker.supersede()?.let { settleLoad(load, it) } }
        media?.setListener(null, CastEngineConstants.PROGRESS_INTERVAL_MS)
        media = null
        bus?.remove()
        bus = null
        sessions.setListener(null)
        reload?.cancelTimer?.invoke()
        reload = null
        subtitleOnceLoaded = null
        dropQueuedReload()
        cancelEndWait()
        suspended = false
        reclaimPending = false
        // What was reported was reported to this host: the next one starts from nothing.
        reportedPause = null
        reportedLoading = null
        readyToSeekFor = null
        if (session != null) log("detached from session $boundSessionId")
        session = null
        boundSessionId = null
        heardState = null
    }

    // A CastSession answers null once the SDK has ended it, and iOS reports a session that failed to
    // start without one: a report without an id is the bound session's only if it forgot its own.
    private fun isBound(sessionId: String?): Boolean {
        val bound = session ?: return false
        return if (sessionId == null) bound.sessionId == null else sessionId == boundSessionId
    }

    // A suspended session keeps the state and the pending load, whose timer runs on (spec §2.4).
    private fun suspendBinding() {
        if (session == null || suspended) return
        suspended = true
        setLoading(true)
        log("session $boundSessionId suspended")
        notifyState()
    }

    // A resume rebuilt the Cast client: the media channel is a new one, and nothing of the old counts.
    private fun resumeBinding(resumed: CastSessionPort) {
        if (session == null) return
        if (resumed.sessionId != boundSessionId) {
            loseBinding(SESSION_REPLACED_ERROR)
            return
        }
        suspended = false
        session = resumed
        volume = resumed.volume
        // A resume joins the receiver app it already had, and the SDK then says it did not launch it:
        // who launched it is what the binding learned first.
        if (identity == null) identity = resumed.wasLaunched
        attachMedia(resumed.media)
        log("session ${resumed.sessionId} resumed")
        notifyState()
    }

    private fun loseBinding(error: String?) {
        if (session == null) return
        val sessionId = boundSessionId
        log("binding lost session=$sessionId error=$error")
        detach()
        bindingListener?.onBindingLost(sessionId, error)
    }

    private fun onBusReady(sessionId: String) {
        if (session == null) return
        if (sessionId != boundSessionId) {
            loseBinding(SESSION_REPLACED_ERROR)
            return
        }
        // SetVolume without a level changes no volume, but the receiver takes its envelope: it waits
        // for a status that shows what this engine cast.
        reclaimPending = busClaimed
    }

    // Loading

    // VideoLoadConfig carries a URL only, and the receiver plays Jellyfin items.
    override fun load(config: VideoLoadConfig) = runOnMain {
        log("refused a URL load")
        delegate?.onError(URL_LOAD_ERROR)
    }

    override fun useServer(server: ReceiverServer) = runOnMain {
        this.server = server.copy(maxBitrate = server.maxBitrate ?: this.server.maxBitrate)
    }

    /**
     * Plays [request] on the receiver, the way JS does (spec §5.2): one PlayNow, settled by what the
     * receiver reports, the first event winning, or never sent. A newer load supersedes this one.
     */
    override fun load(server: ReceiverServer, request: ReceiverPlayRequest, onResult: (CastLoadResult) -> Unit) = runOnMain {
        if (session?.isConnected != true) {
            onResult(CastLoadResult.NotSent(NO_SESSION_ERROR))
            return@runOnMain
        }
        // A Cast message holds 64 KB: the PlayNow carries the window that starts the play, the items after it go
        // by PlayLast once the receiver took it, as a later [enqueue] would.
        val (first, later) = firstWindow(request)
        val message = try {
            ReceiverProtocol.playNow(server, first)
        } catch (refused: ReceiverContainerRefused) {
            onResult(CastLoadResult.NotSent(refused.message ?: CONTAINER_ERROR))
            return@runOnMain
        }
        val previousServer = this.server
        val previousQueue = queue
        val previousIndex = playingIndex
        val generation = ++queueGeneration
        val receiverRequest = ReceiverProtocol.toReceiverRequest(first)
        this.server = server
        queue = receiverRequest.items
        playingIndex = receiverRequest.startIndex ?: 0
        reload?.cancelTimer?.invoke()
        reload = null
        // Another send carries the cap of its own envelope.
        dropQueuedReload()
        // A seek of the old item: the new item's first status does not answer it.
        seekToComplete = null
        cancelEndWait()
        noCompatibleStreamFollows = false
        // The media on the TV now, read at the send: a status of its play session is never this load.
        val settled: (CastLoadResult) -> Unit = if (later.isEmpty()) onResult else { result ->
            if (result == CastLoadResult.Settled(ReceiverLoadOutcome.Loaded) && generation == queueGeneration) {
                enqueueWindows(later.chunked(CastEngineConstants.MAX_QUEUE_ITEMS), generation)
            }
            onResult(result)
        }
        val load = PendingLoad(ReceiverLoadTracker(first, ours?.playSessionId), settled)
        val previous = pendingLoad
        // The new load is pending before the old one settles, so loading never blinks off between them.
        pendingLoad = load
        previous?.let { it.tracker.supersede()?.let { outcome -> settleLoad(it, outcome) } }
        load.cancelTimer = schedule(CastEngineConstants.LOAD_TIMEOUT_MS) {
            if (pendingLoad === load) load.tracker.timeOut()?.let { settleLoad(load, it) }
        }
        setLoading(true)
        notifyState()
        log("send PlayNow")
        hub.send(ReceiverProtocol.NAMESPACE, message.toString()) { error ->
            if (error == null) {
                busClaimed = true
                return@send
            }
            // Never sent: the receiver keeps its queue, under its server.
            if (generation == queueGeneration) {
                this.server = previousServer
                queue = previousQueue
                playingIndex = previousIndex
            }
            if (pendingLoad !== load) return@send
            log("PlayNow not sent: $error")
            load.cancelTimer()
            pendingLoad = null
            setLoading(isBuffering())
            notifyState()
            onResult(CastLoadResult.NotSent(error))
            afterStreamSettled()
        }
    }

    /** The part of [request] one PlayNow carries, the window holding its start, and the ids that come after it. */
    private fun firstWindow(request: ReceiverPlayRequest): Pair<ReceiverPlayRequest, List<String>> {
        if (request.items.size <= CastEngineConstants.MAX_QUEUE_ITEMS) return request to emptyList()
        val selected = (request.startIndex ?: 0).coerceIn(0, request.items.size - 1)
        val window = ReceiverProtocol.queueWindow(request.items, selected, CastEngineConstants.MAX_QUEUE_ITEMS)
        val end = selected - window.startIndex + window.items.size
        val first = request.copy(items = window.items, startIndex = window.startIndex.takeIf { it > 0 })
        return first to request.items.drop(end).mapNotNull { it.id }
    }

    // The item again where it is, with the tracks it plays.
    override fun reloadCurrentItem() = runOnMain { reloadCurrent() }

    /**
     * The item again where it is, under [server]: how a quality change applies the envelope's new cap. A
     * subtitle the receiver did not load (one the server just downloaded) goes with it, checked at once.
     */
    override fun reloadCurrentItem(server: ReceiverServer, subtitleStreamIndex: Int?, onResult: (CastLoadResult) -> Unit) = runOnMain {
        if (subtitleStreamIndex == null) {
            if (reload != null || pendingLoad != null || receiverStarting()) {
                queuedReload?.onResult?.invoke(CastLoadResult.Settled(ReceiverLoadOutcome.Superseded))
                queuedReload = QueuedReload(server, onResult)
                return@runOnMain
            }
            this.server = server
            reloadCurrent(onResult)
            return@runOnMain
        }
        // A subtitle reload names no cap: the TV keeps the one the last load or reload named.
        this.server = server.copy(maxBitrate = server.maxBitrate ?: this.server.maxBitrate)
        val data = loadedItem() ?: return@runOnMain onResult(CastLoadResult.NotSent(NOTHING_LOADED_ERROR))
        val previous = chosenSubtitle
        chosenSubtitle = subtitleStreamIndex
        updateTracks()
        playAgain(data, currentAudio.takeIf { it >= 0 }, subtitleStreamIndex, onResult) {
            if (chosenSubtitle == subtitleStreamIndex) chosenSubtitle = previous
        }
    }

    private fun reloadCurrent(onResult: (CastLoadResult) -> Unit = {}) {
        val data = loadedItem() ?: return onResult(CastLoadResult.NotSent(NOTHING_LOADED_ERROR))
        // A subtitle waiting for the receiver to play goes with the reload, the new stream loads it.
        val waiting = subtitleOnceLoaded
        subtitleOnceLoaded = null
        playAgain(data, currentAudio.takeIf { it >= 0 }, waiting?.index ?: currentSubtitle, onResult) {
            if (waiting != null && chosenSubtitle == waiting.index) chosenSubtitle = waiting.previous
        }
    }

    private fun afterStreamSettled() {
        if (queuedReload != null) schedule(0L) { sendQueuedReload() }
    }

    private fun sendQueuedReload() {
        val queued = queuedReload ?: return
        // Another one on its way since, or a stream not playing yet: the pick waits for a status past it.
        if (reload != null || pendingLoad != null || playerState == LOADING || receiverStarting()) return
        queuedReload = null
        server = queued.server
        reloadCurrent(queued.onResult)
    }

    private fun dropQueuedReload() {
        val queued = queuedReload ?: return
        queuedReload = null
        queued.onResult(CastLoadResult.Settled(ReceiverLoadOutcome.Superseded))
    }

    // Transport

    override fun play() = runOnMain {
        val stopped = stoppedItem()
        if (stopped != null) playStopped(stopped) else media?.play()
    }

    override fun pause() = runOnMain { media?.pause() }

    override fun togglePause() = runOnMain {
        val stopped = stoppedItem()
        if (stopped != null) playStopped(stopped) else media?.togglePlayback()
    }

    // A stop from the TV leaves an idle status that still carries the media, with no media session
    // left to resume: the item plays again where it stopped, or from its start once it ended.
    private fun playStopped(data: ReceiverCustomData) {
        if (idleReason == FINISHED) position = 0.0
        // Played again: what ended is not the end.
        cancelEndWait()
        playAgain(data, currentAudio.takeIf { it >= 0 }, currentSubtitle)
    }

    override fun seekTo(seconds: Double) = runOnMain { seek(seconds, null) }

    override fun seekToTracked(seconds: Double, exact: Boolean, requestId: Long) = runOnMain { seek(seconds, requestId) }

    override fun seekBy(seconds: Double) = runOnMain { seek(position + seconds, null) }

    private fun seek(seconds: Double, requestId: Long?) {
        // A load on its way replaces the item: a seek would reach the old one.
        if (pendingLoad != null) return refuseSeek(requestId)
        val port = media ?: return refuseSeek(requestId)
        val data = ours
        // Nothing loaded, stopped, or live: a Seek by reload would restart a stopped item.
        if (!hasMedia || playerState == IDLE || data?.canSeek == false) return refuseSeek(requestId)
        val target = if (itemDuration > 0) seconds.coerceIn(0.0, itemDuration) else seconds.coerceAtLeast(0.0)
        if (data == null || data.canClientSeek != false) {
            log("seek $target path=media")
            // The receiver's answer is the place now, not the target a reload started at.
            reloadStarting = false
            val sentAt = statusCount
            val generation = queueGeneration
            port.seek((target * 1000).roundToLong()) { succeeded ->
                when {
                    // A load went out meanwhile: the seek was the old item's.
                    generation != queueGeneration -> Unit
                    !succeeded -> delegate?.onPositionChanged(position, itemDuration, 0.0)
                    // The status that answered the seek came first: the position is the seek's already.
                    statusCount > sentAt -> requestId?.let { delegate?.onSeekCompleted(it, position, itemDuration, 0.0) }
                    else -> seekToComplete = requestId
                }
            }
            return
        }
        // The receiver cannot seek in this stream (transcoded music, live TV): Seek reloads it there.
        log("seek $target path=bus")
        startReload(target, requestId, data) { send("Seek", JSONObject().put("position", target), it) }
    }

    // The chrome waits for a tracked seek: one that goes nowhere answers where the engine is.
    private fun refuseSeek(requestId: Long?) {
        requestId?.let { delegate?.onSeekCompleted(it, position, itemDuration, 0.0) }
    }

    // The receiver plays at 1x: it takes no playback rate.
    override val canChangeSpeed = false

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
        val previous = chosenAudio
        chosenAudio = trackId
        updateTracks()
        // The receiver always reloads for an audio change, under a new play session.
        startReload(position, null, data, undo = { if (chosenAudio == trackId) chosenAudio = previous }) {
            send("SetAudioStreamIndex", JSONObject().put("index", trackId), it)
        }
    }

    override fun getCurrentAudioTrack(): Int = currentAudio

    private fun selectSubtitle(index: Int) {
        val data = loadedItem() ?: return
        // A later pick while the receiver still loads replaces the one waiting; a failure goes back to before both.
        val waiting = subtitleOnceLoaded
        val previous = if (waiting != null) waiting.previous else chosenSubtitle
        chosenSubtitle = index
        updateTracks()
        if (receiverStarting()) {
            subtitleOnceLoaded = SubtitleOnceLoaded(index, previous)
            notifyState()
            return
        }
        subtitleOnceLoaded = null
        sendSubtitle(data, index, previous)
    }

    private fun sendSubtitle(data: ReceiverCustomData, index: Int, previous: Int?) {
        val undo = { if (chosenSubtitle == index) chosenSubtitle = previous }
        if (index >= 0 && media?.status?.hasTextTracks == false) {
            // No text track loaded: the receiver would name the index in its reports and show
            // nothing, so the item plays again where it is with that subtitle.
            playAgain(data, currentAudio.takeIf { it >= 0 }, index, undo = undo)
            return
        }
        notifyState()
        send("SetSubtitleStreamIndex", JSONObject().put("index", index)) { error ->
            undo()
            updateTracks()
            notifyState()
            delegate?.onError(error)
        }
    }

    // PlayNow replaces the receiver's queue: the one this engine cast goes again from the item the
    // receiver plays, in the window that fits one message, or that item alone when the queue is
    // someone else's.
    private fun playAgain(
        data: ReceiverCustomData,
        audio: Int?,
        subtitle: Int?,
        onResult: (CastLoadResult) -> Unit = {},
        undo: () -> Unit = {},
    ) {
        val index = if (queue.getOrNull(playingIndex)?.id == data.itemId) playingIndex else queue.indexOfFirst { it.id == data.itemId }
        val items = if (index >= 0) queue else listOf(ReceiverItem(id = data.itemId))
        val window = ReceiverProtocol.queueWindow(items, index.coerceAtLeast(0), CastEngineConstants.MAX_QUEUE_ITEMS)
        val request = ReceiverPlayRequest(
            items = window.items,
            startIndex = window.startIndex.takeIf { it > 0 },
            startPositionTicks = (position * ReceiverProtocol.TICKS_PER_SECOND).roundToLong(),
            mediaSourceId = data.mediaSourceId,
            audioStreamIndex = audio,
            subtitleStreamIndex = subtitle,
            liveStreamId = data.liveStreamId,
        )
        startReload(position, null, data, undo, onResult) { failed -> sendMessage("PlayNow", ReceiverProtocol.playNow(server, request), failed) }
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

    override val foreign: Boolean
        get() = hasMedia && ours?.itemId == null
    override val mediaTitle: String?
        get() = title
    override val mediaImageUrl: String?
        get() = imageUrl
    override val playMethod: String?
        get() = ours?.playMethod

    // Read on the main thread, where the callbacks that change these run.
    override val phase: RemotePhase
        get() = ReceiverProtocol.phase(
            hasMedia = hasMedia,
            playerState = playerState,
            idleReason = idleReason ?: NO_IDLE_REASON,
            loadPending = pendingLoad != null || reload != null,
            waitingForNext = endWait != null,
            hasQueue = queue.isNotEmpty(),
        )

    override val stopRequested: Boolean
        get() = (phase == RemotePhase.STOPPED || phase == RemotePhase.NONE) && idleReason == CANCELLED

    override val reconnecting: Boolean
        get() = suspended

    // One entry per queued item, so [playingIndex] addresses it: an item without an id stays as "".
    override val queueItemIds: List<String>
        get() = queue.map { it.id.orEmpty() }

    // The queue lives on the receiver, which the sender does not see; it announces no QUEUE_NEXT, so
    // the bus carries these.

    override fun skipToNext() = runOnMain {
        if (loadedItem() != null) send("NextTrack", JSONObject()) { delegate?.onError(it) }
    }

    // The receiver never goes back to the start of the item it plays: past the chrome's threshold,
    // the engine seeks there instead, when the item can seek.
    override fun skipToPrevious() = runOnMain {
        val data = loadedItem() ?: return@runOnMain
        if (position > PlayerConstants.CHAPTER_RESTART_THRESHOLD_SEC && data.canSeek != false) {
            seek(0.0, null)
        } else {
            send("PreviousTrack", JSONObject()) { delegate?.onError(it) }
        }
    }

    // A Cast message holds 64 KB: the items go a window at a time.
    override fun enqueue(itemIds: List<String>) = runOnMain {
        if (session == null) return@runOnMain
        enqueueWindows(itemIds.chunked(CastEngineConstants.MAX_QUEUE_ITEMS), queueGeneration)
    }

    // Each window once the channel took the one before: the queue then holds them in the order the
    // receiver does, a window refused ends the enqueue with no gap, and a load meanwhile ends it too,
    // its PlayNow having replaced the queue the rest was for.
    private fun enqueueWindows(windows: List<List<String>>, generation: Long) {
        val window = windows.firstOrNull() ?: return
        sendMessage(
            "PlayLast",
            ReceiverProtocol.playLast(server, window),
            failed = { delegate?.onError(it) },
            sent = {
                if (generation == queueGeneration) {
                    queue = queue + window.map { ReceiverItem(id = it) }
                    notifyState()
                    enqueueWindows(windows.drop(1), generation)
                }
            },
        )
    }

    override val targetVolume: Double?
        get() = volume

    override fun setTargetVolume(level: Double) = runOnMain { session?.setVolume(level.coerceIn(0.0, 1.0)) }

    // What the receiver reports

    private fun onStatus(port: CastMediaPort) {
        statusCount += 1
        val status = port.status
        if (status == null || !status.hasMedia) {
            val finished = status?.playerState == IDLE && status.idleReason == FINISHED
            if (finished && !(playerState == IDLE && idleReason == FINISHED)) armEndWait()
            clearMedia(status?.playerState ?: IDLE)
            idleReason = status?.idleReason
            notifyState()
            return
        }
        val data = status.customData?.let(ReceiverProtocol::parseCustomData)
        // The receiver moved to another item (a skip, the queue going on, another sender): a reload of
        // the old one never settles on its statuses, and held the position for thirty seconds.
        reload?.let { pending ->
            if (data?.itemId != null && data.itemId != pending.itemId) settleReload(pending, ReceiverLoadOutcome.Superseded, recompute = false)
        }
        // Until a load settles, its start is the place: a status of what played before is not the queue moving.
        // A new play session after an end is the queue going on, to the next copy of an item queued twice.
        val wentOn = endWait != null && data?.playSessionId != null && data.playSessionId != playSessionId
        if (pendingLoad == null) followQueue(data?.itemId, wentOn)
        // Settled at the end, once this status is the engine's: the host acts on the result from it.
        val loaded = pendingLoad?.let { load -> load.tracker.onMediaStatus(data, status.playerState)?.let { load to it } }
        val settled = reload?.let { pending -> pending.tracker.onMediaStatus(data, status.playerState)?.let { pending to it } }
        settled?.let { (pending, outcome) -> settleReload(pending, outcome, recompute = false) }
        data?.playSessionId?.let { playSession ->
            val ownLoad = loaded?.second == ReceiverLoadOutcome.Loaded || settled?.second == ReceiverLoadOutcome.Loaded
            val ownQueueWentOn = wentOn && ownPlaySession != null && playSessionId == ownPlaySession &&
                queue.getOrNull(playingIndex)?.id == data.itemId
            if (ownLoad || ownQueueWentOn) ownPlaySession = playSession
        }
        val newPlaySession = data?.playSessionId != playSessionId
        if (newPlaySession) {
            playSessionId = data?.playSessionId
            chosenAudio = null
            chosenSubtitle = null
            // That session plays what its own load named.
            subtitleOnceLoaded = null
            sessionPlayed = false
            reloadStarting = false
            // The next item: what ended was not the end.
            if (data?.playSessionId != null) cancelEndWait()
        }
        if (settled?.second == ReceiverLoadOutcome.Loaded) reloadStarting = true
        if (status.playerState == PLAYING || status.playerState == PAUSED) {
            sessionPlayed = true
            reloadStarting = false
        }
        ours = data
        hasMedia = true
        title = status.title
        imageUrl = status.imageUrl
        itemDuration = durationOf(data, status.streamDurationMs)
        updateTracks()
        if (!holdsPosition(status.playerState)) {
            position = ReceiverProtocol.positionInItem(port.approximatePositionMs / 1000.0, data ?: ReceiverCustomData())
        }
        if (newPlaySession || status.playerState != playerState) {
            log("status ${status.playerState} playSession=${data?.playSessionId} playMethod=${data?.playMethod} canClientSeek=${data?.canClientSeek}")
        }
        reportState(status.playerState, status.idleReason, data)
        // A load on its way carries the envelope of its own server: the reclaim waits for it to settle.
        if (reclaimPending && pendingLoad == null && data?.playSessionId != null && data.playSessionId == ownPlaySession) {
            reclaimPending = false
            val binding = boundSessionId
            // Not taken: nothing was reclaimed, and the next status of that playback tries again.
            send("SetVolume", JSONObject()) { if (session != null && boundSessionId == binding) reclaimPending = true }
        }
        delegate?.onPositionChanged(position, itemDuration, 0.0)
        val completed = settled?.takeIf { it.second == ReceiverLoadOutcome.Loaded }?.first?.requestId ?: seekToComplete
        seekToComplete = null
        completed?.let { delegate?.onSeekCompleted(it, position, itemDuration, 0.0) }
        loaded?.let { (load, outcome) -> settleLoad(load, outcome) }
        // A reload that goes now takes the subtitle waiting with it.
        sendQueuedReload()
        subtitleOnceLoaded?.takeIf { !receiverStarting() }?.let { waiting ->
            subtitleOnceLoaded = null
            // Stopped, or replaced by a load on its way: nothing takes the command.
            loadedItem()?.let { item -> sendSubtitle(item, waiting.index, waiting.previous) }
        }
        notifyState()
    }

    // The position stays on its target through a reload until the receiver plays its stream, and where it was on
    // an idle status: the SDK reports the stream at 0 once the receiver stopped (Task 14, run 12), and the status
    // that interrupts a stream for another of the same item carries the old customData with the new stream's time.
    private fun holdsPosition(state: String) = reload != null || reloadStarting || state == IDLE

    // The receiver starts the stream of its play session: loading, or buffering before it has played.
    private fun receiverStarting() = hasMedia && playerState != IDLE && (playerState == LOADING || !sessionPlayed)

    private fun onTick(positionMs: Long) {
        if (!hasMedia) return
        if (!holdsPosition(playerState)) position = ReceiverProtocol.positionInItem(positionMs / 1000.0, ours ?: ReceiverCustomData())
        delegate?.onPositionChanged(position, itemDuration, 0.0)
    }

    private fun onBusMessage(message: ReceiverMessage) {
        playStateOf(message)?.let { state ->
            if (state.has("AudioStreamIndex")) chosenAudio = intOrNull(state.opt("AudioStreamIndex"))
            // While a pick waits, the receiver still reports the subtitle its load named.
            if (state.has("SubtitleStreamIndex") && subtitleOnceLoaded == null) {
                chosenSubtitle = intOrNull(state.opt("SubtitleStreamIndex"))
            }
            updateTracks()
            notifyState()
        }
        val error = ReceiverProtocol.loadErrorOf(message) ?: return
        pendingLoad?.let { load ->
            load.tracker.onMessage(message)?.let { outcome ->
                noCompatibleStreamFollows = error == ReceiverLoadError.PLAYBACK_INFO_FAILED
                settleLoad(load, outcome)
                return
            }
        }
        reload?.let { pending ->
            pending.tracker.onMessage(message)?.let { outcome ->
                noCompatibleStreamFollows = error == ReceiverLoadError.PLAYBACK_INFO_FAILED
                settleReload(pending, outcome, recompute = true)
                return
            }
        }
        if (noCompatibleStreamFollows && error == ReceiverLoadError.PLAYBACK_FAILED) {
            noCompatibleStreamFollows = false
            return
        }
        noCompatibleStreamFollows = error == ReceiverLoadError.PLAYBACK_INFO_FAILED
        delegate?.onError(error.wireName)
    }

    private fun clearMedia(state: String) {
        hasMedia = false
        ours = null
        title = null
        imageUrl = null
        playerState = state
        playSessionId = null
        chosenAudio = null
        chosenSubtitle = null
        subtitleOnceLoaded = null
        sessionPlayed = false
        reloadStarting = false
        updateTracks()
        setPause(true)
        setLoading(awaitingReceiver())
    }

    private fun reportState(state: String, reason: String, data: ReceiverCustomData?) {
        val wasError = playerState == IDLE && idleReason == ERROR
        val wasFinished = playerState == IDLE && idleReason == FINISHED
        playerState = state
        idleReason = reason
        when (state) {
            PLAYING -> {
                setPause(false)
                setLoading(awaitingReceiver())
            }
            PAUSED -> {
                setPause(true)
                setLoading(awaitingReceiver())
            }
            BUFFERING, LOADING -> setLoading(true)
            IDLE -> {
                setPause(true)
                when (reason) {
                    ERROR -> if (!wasError) delegate?.onError(PLAYBACK_ERROR)
                    FINISHED -> if (!wasFinished) armEndWait()
                }
                // A stream change for the same item: a new play session follows. Any other idle is a stop.
                setLoading(reason == INTERRUPTED || awaitingReceiver())
            }
        }
        val playSession = data?.playSessionId
        if (data?.canSeek == true && playSession != null && playSession != readyToSeekFor) {
            readyToSeekFor = playSession
            delegate?.onReadyToSeek()
        }
    }

    private fun awaitingReceiver() = reload != null || pendingLoad != null || suspended

    private fun isBuffering() = playerState == BUFFERING || playerState == LOADING || awaitingReceiver()

    // After the last item of the queue this engine cast the receiver fetches nothing: the end comes on
    // the next turn, once this status is the engine's, not a spinner fifteen seconds later.
    private fun armEndWait() {
        cancelEndWait()
        val lastOfOurQueue = castQueueEndsHere()
        log(if (lastOfOurQueue) "idle finished, end of the queue" else "idle finished, waiting for the next item")
        endWait = schedule(if (lastOfOurQueue) 0L else CastEngineConstants.NEXT_ITEM_WAIT_MS) {
            endWait = null
            delegate?.onPlaybackEnded()
            notifyState()
        }
    }

    private fun cancelEndWait() {
        endWait?.invoke()
        endWait = null
    }

    private fun settleLoad(load: PendingLoad, outcome: ReceiverLoadOutcome) {
        log("load settled ${outcome.wireName}")
        load.cancelTimer()
        if (pendingLoad === load) pendingLoad = null
        setLoading(isBuffering())
        notifyState()
        load.onResult(CastLoadResult.Settled(outcome))
        afterStreamSettled()
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

    private fun startReload(
        target: Double,
        requestId: Long?,
        data: ReceiverCustomData,
        undo: () -> Unit = {},
        onResult: (CastLoadResult) -> Unit = {},
        send: (failed: (String) -> Unit) -> Unit,
    ) {
        val previous = reload
        previous?.cancelTimer?.invoke()
        // Replaced before the receiver answered: that request did not settle on its own.
        previous?.onResult?.invoke(CastLoadResult.Settled(ReceiverLoadOutcome.Superseded))
        // A reload the receiver has not answered: when this one fails, what that one chose goes too.
        val undoAll = if (previous == null) undo else ({ undo(); previous.undo() })
        val tracker = ReceiverLoadTracker(ReceiverPlayRequest(items = listOf(ReceiverItem(id = data.itemId))), data.playSessionId)
        val cancelTimer = schedule(CastEngineConstants.LOAD_TIMEOUT_MS) {
            reload?.takeIf { it.tracker === tracker }?.let { pending -> pending.tracker.timeOut()?.let { settleReload(pending, it, recompute = true) } }
        }
        reload = Reload(tracker, target, requestId, cancelTimer, undoAll, data.itemId, onResult)
        position = target
        setLoading(true)
        notifyState()
        delegate?.onPositionChanged(position, itemDuration, 0.0)
        send { error ->
            // Never sent: nothing will reload, so the position goes back to what the receiver reports.
            reload?.takeIf { it.tracker === tracker }?.let { pending ->
                pending.cancelTimer()
                reload = null
                pending.undo()
                updateTracks()
                notifyState()
                delegate?.onError(error)
                pending.onResult(CastLoadResult.NotSent(error))
                recomputePosition()
                afterStreamSettled()
            }
        }
    }

    private fun settleReload(pending: Reload, outcome: ReceiverLoadOutcome, recompute: Boolean) {
        log("reload settled ${outcome.wireName}")
        pending.cancelTimer()
        reload = null
        if (outcome is ReceiverLoadOutcome.Failed || outcome == ReceiverLoadOutcome.TimedOut) {
            // Nothing reloaded: the tracks go back to what the receiver plays.
            pending.undo()
            updateTracks()
        }
        when (outcome) {
            is ReceiverLoadOutcome.Failed -> delegate?.onError(outcome.error.wireName)
            ReceiverLoadOutcome.TimedOut -> delegate?.onError(outcome.wireName)
            ReceiverLoadOutcome.Loaded, ReceiverLoadOutcome.Superseded -> Unit
        }
        if (recompute) recomputePosition()
        notifyState()
        pending.onResult(CastLoadResult.Settled(outcome))
        afterStreamSettled()
    }

    // Outside a status: back to the formula of the last one, with the media channel's own estimate.
    private fun recomputePosition() {
        val port = media
        if (port == null || !hasMedia) {
            setLoading(isBuffering())
            return
        }
        position = ReceiverProtocol.positionInItem(port.approximatePositionMs / 1000.0, ours ?: ReceiverCustomData())
        setLoading(isBuffering())
        delegate?.onPositionChanged(position, itemDuration, 0.0)
    }

    // Sending, never logged: every message carries the access token.

    private fun send(command: String, options: JSONObject, failed: (String) -> Unit = {}) =
        sendMessage(command, ReceiverProtocol.message(command, server, options), failed)

    private fun sendMessage(command: String, message: JSONObject, failed: (String) -> Unit = {}, sent: () -> Unit = {}) {
        log("send $command")
        hub.send(ReceiverProtocol.NAMESPACE, message.toString()) { error ->
            if (error == null) {
                sent()
                return@send
            }
            log("$command not sent: $error")
            failed(error)
        }
    }

    // Helpers

    // Our item, loaded and not stopped: the receiver's commands need one (spec §4).
    // A load on its way replaces it: a command would act on the old item.
    private fun loadedItem(): ReceiverCustomData? = ours?.takeIf { hasMedia && playerState != IDLE && it.itemId != null && pendingLoad == null }

    // Our item, stopped with its media still in the status, and nothing on its way to replace it.
    private fun stoppedItem(): ReceiverCustomData? = ours?.takeIf {
        hasMedia && playerState == IDLE && idleReason != INTERRUPTED && it.itemId != null && !awaitingReceiver() && !nextItemComing()
    }

    // A finished item the receiver goes on from: the queue this engine cast has one after it, which the
    // receiver fetches while the end waits. Play then would race it with the finished item.
    private fun nextItemComing() = endWait != null && playingIndex in 0 until queue.size - 1

    // The receiver unfolds a lone typed episode into its series: that queue goes on past its one item.
    private fun castQueueEndsHere() =
        playingIndex >= 0 && playingIndex == queue.lastIndex && !(queue.size == 1 && queue[0].type == "Episode")

    // The receiver names the item it plays, not which copy of one queued twice: the copy where the
    // engine is in the queue, else the one after it (the queue went on), else the one before (it went
    // back), else the first. After an end the queue went on: the one after it comes first.
    private fun followQueue(itemId: String?, wentOn: Boolean) {
        if (itemId == null) return
        val near = if (wentOn) listOf(playingIndex + 1, playingIndex, playingIndex - 1) else listOf(playingIndex, playingIndex + 1, playingIndex - 1)
        playingIndex = near.firstOrNull { queue.getOrNull(it)?.id == itemId } ?: queue.indexOfFirst { it.id == itemId }
    }

    private fun notifyState() {
        val state = HeardState(
            phase, suspended, ours?.itemId, queueItemIds, playingIndex, currentAudio, currentSubtitle, foreign, title, imageUrl,
            ours?.playMethod,
        )
        if (state == heardState) return
        heardState = state
        onStateChanged?.invoke()
    }

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
        const val NOTHING_LOADED_ERROR = "The receiver has no item of ours loaded to play again"
        const val URL_LOAD_ERROR = "The Cast engine plays Jellyfin items, not URLs"
        const val PLAYBACK_ERROR = "The receiver stopped on a playback error"
        const val SESSION_REPLACED_ERROR = "The Cast session was replaced"
        private const val CONTAINER_ERROR = "Cannot cast a container"

        // CastMapping's names for the player state and the idle reason.
        private const val PLAYING = "playing"
        private const val PAUSED = "paused"
        private const val BUFFERING = "buffering"
        private const val LOADING = "loading"
        private const val IDLE = "idle"
        private const val UNKNOWN = "unknown"
        private const val ERROR = "error"
        private const val CANCELLED = "cancelled"
        private const val INTERRUPTED = "interrupted"
        private const val FINISHED = "finished"
        private const val NO_IDLE_REASON = "none"
    }
}
