package expo.modules.mpvplayer.cast.engine

import expo.modules.mpvplayer.cast.receiver.ReceiverServer
import expo.modules.mpvplayer.nativeplayer.engine.TransportEngine
import org.json.JSONObject

// The SDK's side of the engine, without the SDK: the ports record what the engine asks and play
// back what the receiver reports, a scheduler and a main queue that only move when told to.

val SERVER = ReceiverServer("https://jellyfin.example.test", "tok-123", "user-1", "Living Room TV", 8_000_000)

/** The receiver's customData for our item, the plan's common value. */
const val OURS =
    """{"itemId":"item-1","playSessionId":"ps-1","mediaSourceId":"ms-1","audioStreamIndex":1,"subtitleStreamIndex":3,""" +
        """"canSeek":true,"canClientSeek":true,"runtimeTicks":60000000000,"startPositionTicks":0,"playMethod":"Transcode","liveStreamId":null}"""

fun ours(vararg overrides: Pair<String, Any?>): JSONObject =
    JSONObject(OURS).apply { overrides.forEach { (key, value) -> put(key, value ?: JSONObject.NULL) } }

fun snapshot(
    playerState: String = "playing",
    idleReason: String = "none",
    customData: JSONObject? = ours(),
    streamDurationMs: Long = -1,
    hasTextTracks: Boolean = true,
    hasMedia: Boolean = true,
) = CastMediaSnapshot(
    playerState = playerState,
    idleReason = idleReason,
    hasMedia = hasMedia,
    streamPositionMs = 0,
    playbackRate = 1.0,
    customData = customData,
    streamDurationMs = streamDurationMs,
    hasTextTracks = hasTextTracks,
)

class FakeMedia : CastMediaPort {
    override var status: CastMediaSnapshot? = null
    override var approximatePositionMs: Long = 0
    var listener: CastMediaListener? = null
        private set
    var progressIntervalMs: Long? = null
        private set
    val calls = mutableListOf<String>()
    val seeks = mutableListOf<Long>()
    var statusRequests = 0
        private set
    private val seeksInFlight = mutableListOf<(Boolean) -> Unit>()

    override fun setListener(listener: CastMediaListener?, progressIntervalMs: Long) {
        this.listener = listener
        this.progressIntervalMs = progressIntervalMs
    }

    override fun play() {
        calls += "play"
    }

    override fun pause() {
        calls += "pause"
    }

    override fun togglePlayback() {
        calls += "toggle"
    }

    override fun seek(positionMs: Long, done: (Boolean) -> Unit) {
        seeks += positionMs
        seeksInFlight += done
    }

    override fun requestStatus() {
        statusRequests += 1
    }

    /** The receiver reporting a status: the SDK updates the media status, then calls back. */
    fun report(status: CastMediaSnapshot, positionMs: Long = approximatePositionMs) {
        this.status = status
        approximatePositionMs = positionMs
        listener?.onStatusUpdated()
    }

    fun tick(positionMs: Long) {
        listener?.onProgress(positionMs)
    }

    /** The SDK's answer to the oldest seek still in flight. */
    fun finishSeek(succeeded: Boolean) {
        seeksInFlight.removeAt(0)(succeeded)
    }
}

class FakeSession(
    /** A var: the SDK's CastSession answers null once the session has ended. */
    override var sessionId: String? = "session-1",
    override val isConnected: Boolean = true,
    override var media: CastMediaPort? = FakeMedia(),
    override val wasLaunched: Boolean? = null,
) : CastSessionPort {
    override var volume: Double? = 0.5
    var muted: Boolean? = null
        private set
    val volumes = mutableListOf<Double>()

    override fun setVolume(level: Double) {
        volumes += level
    }

    override fun setMute(muted: Boolean) {
        this.muted = muted
    }
}

class FakeSource(override var current: CastSessionPort? = FakeSession()) : CastSessionSource {
    var listener: CastSessionListener? = null
        private set

    override fun setListener(listener: CastSessionListener?) {
        this.listener = listener
    }
}

/** A clock that moves only when told to, running what fell due, as SyncPlayCommandSchedulerTest's does. */
class ManualScheduler {
    private data class Task(val at: Long, val run: () -> Unit, var canceled: Boolean = false)

    private var now = 0L
    private val tasks = mutableListOf<Task>()
    val pending: Int
        get() = tasks.count { !it.canceled }

    val schedule: (Long, () -> Unit) -> (() -> Unit) = { delay, run ->
        val task = Task(now + delay, run)
        tasks += task
        val cancel: () -> Unit = { task.canceled = true }
        cancel
    }

    fun advance(ms: Long) {
        now += ms
        tasks.filter { !it.canceled && it.at <= now }.forEach {
            it.canceled = true
            it.run()
        }
    }
}

/** A main thread that runs what was posted to it only when told to. */
class MainQueue {
    private val tasks = mutableListOf<() -> Unit>()
    val runOnMain: (() -> Unit) -> Unit = { tasks += it }

    fun runAll() {
        while (tasks.isNotEmpty()) tasks.removeAt(0)()
    }
}

class RecordingDelegate : TransportEngine.Delegate {
    val positions = mutableListOf<Double>()
    val pauses = mutableListOf<Boolean>()
    val loadings = mutableListOf<Boolean>()
    val errors = mutableListOf<String>()
    val seeksCompleted = mutableListOf<Pair<Long, Double>>()
    var readyToSeek = 0
    var ended = 0

    override fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double) {
        positions += position
    }

    override fun onSeekCompleted(requestId: Long, position: Double, duration: Double, cacheSeconds: Double) {
        seeksCompleted += requestId to position
    }

    override fun onPauseChanged(isPaused: Boolean) {
        pauses += isPaused
    }

    override fun onLoadingChanged(isLoading: Boolean) {
        loadings += isLoading
    }

    override fun onReadyToSeek() {
        readyToSeek += 1
    }

    override fun onTracksReady() = Unit

    override fun onError(message: String) {
        errors += message
    }

    override fun onVideoDimensionsChanged(width: Int, height: Int) = Unit

    override fun onPlaybackEnded() {
        ended += 1
    }
}
