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
import expo.modules.mpvplayer.nativeplayer.engine.ChromeEngine
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
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
) : ChromeEngine {
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
    )

    private var reload: Reload? = null

    private class PendingLoad(val tracker: ReceiverLoadTracker, val onResult: (CastLoadResult) -> Unit) {
        var cancelTimer: () -> Unit = {}
    }

    private var pendingLoad: PendingLoad? = null

    // What this engine cast, the load's items then the enqueued ones: the receiver's PlayNow replaces
    // its whole queue, so a reload sends it again.
    private var queue: List<ReceiverItem> = emptyList()

    // Where in [queue] the receiver plays: it names the item, not which copy of one queued twice.
    private var playingIndex = -1

    // Bumped by each load: Play Services hands a send's result over later, and a result that comes
    // back after a newer load no longer describes the receiver's queue.
    private var queueGeneration = 0L

    // The queue each load on its way replaced, by generation, with the generation that queue came from:
    // a send the channel refuses goes back to it, and so does the newer load sent over the refused one,
    // the receiver never having taken it, whichever of the two the channel refuses first.
    private class QueueState(val server: ReceiverServer, val items: List<ReceiverItem>, val playingIndex: Int, val held: Long)
    private val replaced = mutableMapOf<Long, QueueState>()

    // The generation whose queue the engine holds: a refusal gives an older one back.
    private var heldGeneration = 0L

    // An enqueue's windows still to go, the first one on its way unless [waiting]. A replay's PlayNow
    // drops from the receiver the windows sent before it, so the replay sends them again and holds those
    // enqueues until the channel settles it: a window taken meanwhile waits in [taken], the next with it, and
    // a window refused leaves its [error] to the replay's outcome.
    private class Enqueue(var generation: Long, val binding: String?, var windows: List<List<String>>, var waiting: Boolean = false) {
        var taken: List<String> = emptyList()
        var error: String? = null
    }
    // By id, the order asked: a replay's tail, under the replay's id, goes before what was enqueued meanwhile.
    private val enqueues = sortedMapOf<Long, Enqueue>()
    private var enqueueCount = 0L

    // The replays whose PlayNow the channel has not settled: each holds the enqueues asked before it.
    private val replays = mutableSetOf<Long>()

    // The loads the channel has not settled, by generation, each with the id that holds the enqueues
    // asked before it: taken, its PlayNow replaced what they were for; refused, they go on.
    private val loads = mutableMapOf<Long, Long>()

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

    // The play session the end waits after, kept past a status without media: the next item is this
    // engine's when that one was.
    private var finishedPlaySession: String? = null

    // A failed PlaybackInfo comes as a connection error, then a NoCompatibleStream playbackerror that
    // belongs to the same failure.
    private var noCompatibleStreamFollows = false

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
        cancelEndWait()
        enqueues.clear()
        replays.clear()
        loads.clear()
        suspended = false
        reclaimPending = false
        // What was reported was reported to this host: the next one starts from nothing.
        reportedPause = null
        reportedLoading = null
        readyToSeekFor = null
        if (session != null) log("detached from session $boundSessionId")
        session = null
        boundSessionId = null
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

    /**
     * Plays [request] on the receiver, the way JS does (spec §5.2): one PlayNow, settled by what the
     * receiver reports, the first event winning, or never sent. A newer load supersedes this one.
     */
    fun load(server: ReceiverServer, request: ReceiverPlayRequest, onResult: (CastLoadResult) -> Unit) = runOnMain {
        if (session?.isConnected != true) {
            onResult(CastLoadResult.NotSent(NO_SESSION_ERROR))
            return@runOnMain
        }
        val message = try {
            ReceiverProtocol.playNow(server, request)
        } catch (refused: ReceiverContainerRefused) {
            onResult(CastLoadResult.NotSent(refused.message ?: CONTAINER_ERROR))
            return@runOnMain
        }
        val generation = ++queueGeneration
        replaced[generation] = QueueState(this.server, queue, playingIndex, heldGeneration)
        heldGeneration = generation
        loads[generation] = ++enqueueCount
        replays.clear()
        val receiverRequest = ReceiverProtocol.toReceiverRequest(request)
        this.server = server
        queue = receiverRequest.items
        playingIndex = receiverRequest.startIndex ?: 0
        reload?.cancelTimer?.invoke()
        reload = null
        // A seek of the old item: the new item's first status does not answer it.
        seekToComplete = null
        cancelEndWait()
        noCompatibleStreamFollows = false
        // The media on the TV now, read at the send: a status of its play session is never this load.
        val load = PendingLoad(ReceiverLoadTracker(request, ours?.playSessionId), onResult)
        val previous = pendingLoad
        // The new load is pending before the old one settles, so loading never blinks off between them.
        pendingLoad = load
        previous?.let { it.tracker.supersede()?.let { outcome -> settleLoad(it, outcome) } }
        load.cancelTimer = schedule(CastEngineConstants.LOAD_TIMEOUT_MS) {
            if (pendingLoad === load) load.tracker.timeOut()?.let { settleLoad(load, it) }
        }
        // A handler of the superseded load cast again: this load never goes out, and shows no loading.
        if (pendingLoad === load) setLoading(true)
        // A handler of the superseded load, or of the loading, cast again: this load is no longer the
        // one asked, and the receiver must not get it after the newer one.
        if (pendingLoad !== load) {
            load.cancelTimer()
            refused(generation)
            return@runOnMain
        }
        log("send PlayNow")
        hub.send(ReceiverProtocol.NAMESPACE, message.toString()) { error ->
            if (error == null) {
                replaced.remove(generation)
                loads.remove(generation)?.let { hold -> enqueues.keys.removeAll { it < hold } }
                busClaimed = true
                return@send
            }
            refused(generation)
            if (pendingLoad !== load) return@send
            log("PlayNow not sent: $error")
            load.cancelTimer()
            pendingLoad = null
            setLoading(isBuffering())
            onResult(CastLoadResult.NotSent(error))
        }
    }

    // Never sent: the receiver keeps its queue, under its server. A newer load replaced this one's queue,
    // which the receiver never took: what this one replaced is what that one goes back to.
    // The enqueues it held go on in the queue given back, under the generation the engine is at.
    private fun refused(generation: Long) {
        loads.remove(generation)
        val previous = replaced.remove(generation) ?: return
        for (entry in replaced.entries) if (entry.value.held == generation) entry.setValue(previous)
        if (heldGeneration == generation) {
            server = previous.server
            queue = previous.items
            playingIndex = previous.playingIndex
            heldGeneration = previous.held
            for (entry in enqueues.values) entry.generation = queueGeneration
        }
        resumeEnqueues()
    }

    // The item again where it is, with the tracks it plays.
    override fun reloadCurrentItem() = runOnMain { reloadCurrent() }

    /** The item again where it is, under [server]: how a quality change applies the envelope's new cap. */
    fun reloadCurrentItem(server: ReceiverServer) = runOnMain {
        this.server = server
        reloadCurrent()
    }

    private fun reloadCurrent() {
        val data = loadedItem() ?: return
        playAgain(data, currentAudio.takeIf { it >= 0 }, currentSubtitle)
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
        if (pendingLoad != null) return
        val port = media ?: return
        val data = ours
        // Nothing loaded, stopped, or live: a Seek by reload would restart a stopped item.
        if (!hasMedia || playerState == IDLE || data?.canSeek == false) return
        val target = if (itemDuration > 0) seconds.coerceIn(0.0, itemDuration) else seconds.coerceAtLeast(0.0)
        if (data == null || data.canClientSeek != false) {
            log("seek $target path=media")
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
        val previous = chosenSubtitle
        chosenSubtitle = index
        updateTracks()
        val undo = { if (chosenSubtitle == index) chosenSubtitle = previous }
        if (index >= 0 && media?.status?.hasTextTracks != true) {
            // No text track loaded, or no status to tell: the receiver would name the index in its
            // reports and show nothing, so the item plays again where it is with that subtitle.
            playAgain(data, currentAudio.takeIf { it >= 0 }, index, undo)
            return
        }
        send("SetSubtitleStreamIndex", JSONObject().put("index", index)) { error ->
            undo()
            updateTracks()
            delegate?.onError(error)
        }
    }

    // PlayNow replaces the receiver's queue: the one this engine cast goes again from the item the
    // receiver plays, in the window that fits one message, or that item alone when the queue is
    // someone else's.
    private fun playAgain(data: ReceiverCustomData, audio: Int?, subtitle: Int?, undo: () -> Unit = {}) {
        val index = if (queue.getOrNull(playingIndex)?.id == data.itemId) playingIndex else queue.indexOfFirst { it.id == data.itemId }
        // The windows of the enqueues on their way go out before this PlayNow, which drops them: they
        // go again after the queue, as does the tail of a replay before this one.
        val unsent = if (index >= 0) enqueues.values.flatMap { it.taken + it.windows.flatten() } else emptyList()
        val items = if (index >= 0) queue + unsent.map { ReceiverItem(id = it) } else listOf(ReceiverItem(id = data.itemId))
        val window = ReceiverProtocol.queueWindow(items, index.coerceAtLeast(0), CastEngineConstants.MAX_QUEUE_ITEMS)
        // A start offset the receiver reported can put the position past what ticks hold.
        val ticks = position * ReceiverProtocol.TICKS_PER_SECOND
        if (!(ticks >= Long.MIN_VALUE.toDouble() && ticks < Long.MAX_VALUE.toDouble())) {
            undo()
            updateTracks()
            delegate?.onError(POSITION_ERROR)
            return
        }
        val request = ReceiverPlayRequest(
            items = window.items,
            startIndex = window.startIndex.takeIf { it > 0 },
            startPositionTicks = ticks.roundToLong(),
            mediaSourceId = data.mediaSourceId,
            audioStreamIndex = audio,
            subtitleStreamIndex = subtitle,
            liveStreamId = data.liveStreamId,
        )
        // Once the receiver took it, the window is its whole queue: the engine's queue is that window,
        // and the items after it go again a window at a time.
        val generation = queueGeneration
        val tail = if (index < 0) emptyList() else items.drop(index - window.startIndex + window.items.size).mapNotNull { it.id }
        // Until the channel settles this PlayNow, it holds the enqueues on their way, their windows being its own.
        val replay = ++enqueueCount
        if (index >= 0) replays += replay
        startReload(position, null, data, undo) { failed ->
            val refused = { error: String ->
                // Refused: the receiver keeps the windows taken before it, and the enqueues go on.
                if (replays.remove(replay)) resumeEnqueues()
                failed(error)
            }
            sendMessage("PlayNow", ReceiverProtocol.playNow(server, request), refused) {
                if (index < 0 || generation != queueGeneration || replay !in replays) return@sendMessage
                // Taken: the receiver's queue is this window, an older replay is past, and the enqueues asked
                // before this one go in its tail, itself held while a newer replay is on its way.
                replays.removeAll { it <= replay }
                enqueues.keys.removeAll { it < replay }
                queue = window.items
                playingIndex = window.startIndex
                val held = isHeld(replay)
                enqueues[replay] = Enqueue(generation, boundSessionId, tail.chunked(CastEngineConstants.MAX_QUEUE_ITEMS), waiting = held)
                if (!held) sendWindow(replay)
            }
        }
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
        val id = ++enqueueCount
        enqueues[id] = Enqueue(queueGeneration, boundSessionId, itemIds.chunked(CastEngineConstants.MAX_QUEUE_ITEMS))
        sendWindow(id)
    }

    // Each window once the channel took the one before: the queue then holds them in the order the
    // receiver does, a window refused ends the enqueue with no gap, and so does the end of the binding
    // it was sent on: the rest was for that receiver.
    // A replay holds it: a window taken waits for the replay, which carries the rest once the receiver
    // takes it, and lets the enqueue go on otherwise. A load holds it the same way: taken, its PlayNow
    // replaced the queue the rest was for, and the enqueue ends.
    private fun sendWindow(id: Long) {
        val entry = enqueues[id] ?: return
        val window = entry.windows.firstOrNull()
        if (window == null) {
            enqueues.remove(id)
            return
        }
        sendMessage(
            "PlayLast",
            ReceiverProtocol.playLast(server, window),
            failed = {
                // Ended meanwhile: a taken replay sent it again, or a load or the binding's end dropped what it was for.
                if (enqueues[id] !== entry) return@sendMessage
                if (isHeld(id)) {
                    // The replay or the load settles it: taken, the window went again or its queue was replaced;
                    // refused, the enqueue ends on this error.
                    entry.error = it
                    entry.waiting = true
                } else {
                    enqueues.remove(id)
                    delegate?.onError(it)
                }
            },
            sent = {
                if (enqueues[id] !== entry) return@sendMessage
                if (!isCurrent(entry) && !isHeld(id)) {
                    enqueues.remove(id)
                    return@sendMessage
                }
                entry.windows = entry.windows.drop(1)
                if (isHeld(id)) {
                    entry.waiting = true
                    entry.taken = window
                } else {
                    queue = queue + window.map { ReceiverItem(id = it) }
                    sendWindow(id)
                }
            },
        )
    }

    // A replay or a load the channel refused: the enqueues nothing holds any more go on, from the window
    // taken meanwhile.
    private fun resumeEnqueues() {
        for ((id, entry) in enqueues.entries.toList()) {
            if (!entry.waiting || isHeld(id)) continue
            if (entry.error != null || !isCurrent(entry)) {
                enqueues.remove(id)
                entry.error?.let { delegate?.onError(it) }
                continue
            }
            queue = queue + entry.taken.map { ReceiverItem(id = it) }
            entry.waiting = false
            entry.taken = emptyList()
            sendWindow(id)
        }
    }

    private fun isHeld(id: Long) = replays.any { it > id } || loads.values.any { it > id }

    private fun isCurrent(entry: Enqueue) = entry.generation == queueGeneration && session != null && boundSessionId == entry.binding

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
            val ownQueueWentOn = wentOn && ownPlaySession != null && finishedPlaySession == ownPlaySession &&
                queue.getOrNull(playingIndex)?.id == data.itemId
            if (ownLoad || ownQueueWentOn) ownPlaySession = playSession
        }
        val newPlaySession = data?.playSessionId != playSessionId
        if (newPlaySession) {
            playSessionId = data?.playSessionId
            chosenAudio = null
            chosenSubtitle = null
            // The next item: what ended was not the end.
            if (data?.playSessionId != null) cancelEndWait()
        }
        ours = data
        hasMedia = true
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
    }

    // The position stays on its target through a reload, and where it was on an idle status: the SDK
    // reports the stream at 0 once the receiver stopped (Task 14, run 12), and the status that interrupts
    // a stream for another of the same item carries the old customData with the new stream's time.
    private fun holdsPosition(state: String) = reload != null || state == IDLE

    private fun onTick(positionMs: Long) {
        if (!hasMedia) return
        if (!holdsPosition(playerState)) position = ReceiverProtocol.positionInItem(positionMs / 1000.0, ours ?: ReceiverCustomData())
        delegate?.onPositionChanged(position, itemDuration, 0.0)
    }

    private fun onBusMessage(message: ReceiverMessage) {
        playStateOf(message)?.let { state ->
            if (state.has("AudioStreamIndex")) chosenAudio = intOrNull(state.opt("AudioStreamIndex"))
            if (state.has("SubtitleStreamIndex")) chosenSubtitle = intOrNull(state.opt("SubtitleStreamIndex"))
            updateTracks()
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
            // Only a NoCompatibleStream is that failure's: another playbackerror is a failure of its own.
            if ((message as? ReceiverMessage.Parsed)?.json?.optString("message") == NO_COMPATIBLE_STREAM) return
        }
        noCompatibleStreamFollows = error == ReceiverLoadError.PLAYBACK_INFO_FAILED
        delegate?.onError(error.wireName)
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

    private fun armEndWait() {
        cancelEndWait()
        finishedPlaySession = playSessionId
        log("idle finished, waiting for the next item")
        endWait = schedule(CastEngineConstants.NEXT_ITEM_WAIT_MS) {
            endWait = null
            delegate?.onPlaybackEnded()
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
        load.onResult(CastLoadResult.Settled(outcome))
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
        send: (failed: (String) -> Unit) -> Unit,
    ) {
        val previous = reload
        previous?.cancelTimer?.invoke()
        // A reload the receiver has not answered: when this one fails, what that one chose goes too.
        val undoAll = if (previous == null) undo else ({ undo(); previous.undo() })
        val tracker = ReceiverLoadTracker(ReceiverPlayRequest(items = listOf(ReceiverItem(id = data.itemId))), data.playSessionId)
        val cancelTimer = schedule(CastEngineConstants.LOAD_TIMEOUT_MS) {
            reload?.takeIf { it.tracker === tracker }?.let { pending -> pending.tracker.timeOut()?.let { settleReload(pending, it, recompute = true) } }
        }
        reload = Reload(tracker, target, requestId, cancelTimer, undoAll, data.itemId)
        position = target
        setLoading(true)
        delegate?.onPositionChanged(position, itemDuration, 0.0)
        send { error ->
            // Never sent: nothing will reload, so the position goes back to what the receiver reports.
            reload?.takeIf { it.tracker === tracker }?.let { pending ->
                pending.cancelTimer()
                reload = null
                pending.undo()
                updateTracks()
                delegate?.onError(error)
                recomputePosition()
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
    }

    // Outside a status: back to the formula of the last one, with the media channel's own estimate.
    // Stopped, the SDK reports the stream at 0: the position stays where the item stopped.
    private fun recomputePosition() {
        val port = media
        if (port == null || !hasMedia || playerState == IDLE) {
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

    // The receiver names the item it plays, not which copy of one queued twice: the copy where the
    // engine is in the queue, else the one after it (the queue went on), else the one before (it went
    // back), else the first. After an end the queue went on: the one after it comes first.
    private fun followQueue(itemId: String?, wentOn: Boolean) {
        if (itemId == null) return
        val near = if (wentOn) listOf(playingIndex + 1, playingIndex, playingIndex - 1) else listOf(playingIndex, playingIndex + 1, playingIndex - 1)
        playingIndex = near.firstOrNull { queue.getOrNull(it)?.id == itemId } ?: queue.indexOfFirst { it.id == itemId }
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
        const val URL_LOAD_ERROR = "The Cast engine plays Jellyfin items, not URLs"
        const val PLAYBACK_ERROR = "The receiver stopped on a playback error"
        const val SESSION_REPLACED_ERROR = "The Cast session was replaced"
        const val POSITION_ERROR = "The position is out of the receiver's range"
        private const val CONTAINER_ERROR = "Cannot cast a container"
        private const val NO_COMPATIBLE_STREAM = "NoCompatibleStream"

        // CastMapping's names for the player state and the idle reason.
        private const val PLAYING = "playing"
        private const val PAUSED = "paused"
        private const val BUFFERING = "buffering"
        private const val LOADING = "loading"
        private const val IDLE = "idle"
        private const val UNKNOWN = "unknown"
        private const val ERROR = "error"
        private const val INTERRUPTED = "interrupted"
        private const val FINISHED = "finished"
    }
}
