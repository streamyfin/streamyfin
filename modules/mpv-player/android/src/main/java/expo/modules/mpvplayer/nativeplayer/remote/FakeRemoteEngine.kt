package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.cast.engine.CastEngineConstants
import expo.modules.mpvplayer.cast.engine.CastLoadResult
import expo.modules.mpvplayer.cast.receiver.ReceiverLoadError
import expo.modules.mpvplayer.cast.receiver.ReceiverLoadOutcome
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

data class FakeRemoteItem(val id: String, val durationSec: Double)

/**
 * A TV that is not there, for the remote chrome's tests and the debug probe: a list of items on a clock
 * that moves one second per progress step, with the Cast engine's transport and queue faces. It has no
 * rendering face, so the chrome reads it as remote. Every entry runs through [runOnMain], as the Cast
 * engine's do; after [stop] it announces nothing. The simulate calls play the scenes of a real TV the
 * remote screen has to follow: a suspended session, its resume, a stop from the TV's own remote. A load plays
 * the items it asks for, [PlayerConstants.FAKE_REMOTE_ITEM_SEC] each, and one that starts with
 * [PlayerConstants.FAKE_REMOTE_FAIL_ID] fails as a receiver that cannot play it.
 */
class FakeRemoteEngine(
    private val schedule: (Long, () -> Unit) -> (() -> Unit),
    private val runOnMain: (() -> Unit) -> Unit,
    private var items: List<FakeRemoteItem> = DEFAULT_ITEMS,
) : RemoteEngine {
    companion object {
        val DEFAULT_ITEMS = (1..3).map { FakeRemoteItem("fake-episode-$it", PlayerConstants.FAKE_REMOTE_ITEM_SEC) }
        const val STOPPED_ERROR = "The fake TV was let go of"
        private const val FAIL_MESSAGE = """{"type":"playbackerror","message":"NotAllowed"}"""
    }

    override var delegate: TransportEngine.Delegate? = null
    override var playbackResumeIntent = true
    override var onStateChanged: (() -> Unit)? = null

    private var index = 0
    private var position = 0.0
    private var paused = true
    private var loaded = false
    private var stopped = false
    private var cancelLoad: (() -> Unit)? = null
    private var pendingResult: ((CastLoadResult) -> Unit)? = null
    private var cancelTick: (() -> Unit)? = null
    private var volume = 0.5
    private var suspended = false
    private var stoppedFromReceiver = false

    // Another sender's media, its title and image: it holds the TV until this engine loads again.
    private var foreignMedia: Pair<String?, String?>? = null
    private var heardState: List<Any?>? = null

    private val current: FakeRemoteItem? get() = items.getOrNull(index)

    override val isPausedState: Boolean get() = paused
    override val currentPosition: Double get() = position
    override val duration: Double get() = current?.durationSec ?: 0.0
    override val isTv = false
    override val canChangeSpeed = false
    override val currentItemId: String? get() = if (loaded && foreignMedia == null) current?.id else null
    override val targetVolume: Double get() = volume

    override val phase: RemotePhase
        get() = when {
            foreignMedia != null -> if (paused) RemotePhase.PAUSED else RemotePhase.PLAYING
            !loaded -> if (cancelLoad != null) RemotePhase.LOADING else RemotePhase.NONE
            current == null -> RemotePhase.ENDED
            stoppedFromReceiver -> RemotePhase.STOPPED
            paused -> RemotePhase.PAUSED
            else -> RemotePhase.PLAYING
        }
    override val reconnecting: Boolean get() = suspended
    override val queueItemIds: List<String> get() = items.map { it.id }
    override val playingIndex: Int get() = if (loaded && current != null && foreignMedia == null) index else -1
    override val foreign: Boolean get() = foreignMedia != null
    override val mediaTitle: String? get() = foreignMedia?.first
    override val mediaImageUrl: String? get() = foreignMedia?.second
    override var playMethod: String? = null
        private set

    // MARK: - Lifecycle

    override fun start(owner: PlayerEngine.Owner, onStarted: () -> Unit) = runOnMain {
        if (stopped) return@runOnMain
        onStarted()
        delegate?.onLoadingChanged(true)
        cancelLoad = schedule(PlayerConstants.FAKE_REMOTE_LOAD_MS) {
            cancelLoad = null
            loaded = true
            delegate?.onLoadingChanged(false)
            delegate?.onReadyToSeek()
            setPaused(false)
            report()
            notifyState()
        }
        notifyState()
    }

    override fun stop() = runOnMain {
        stopped = true
        cancelLoad?.invoke()
        cancelLoad = null
        pendingResult?.let { pendingResult = null; it(CastLoadResult.Settled(ReceiverLoadOutcome.Superseded)) }
        stopTicking()
    }

    // A remote screen has no stream to load: what plays is the fake's list.
    override fun load(config: VideoLoadConfig) {}
    override fun reloadCurrentItem() {}

    // The fake has no envelope to carry: its TV plays on as it was.
    override fun useServer(server: ReceiverServer) {}
    override fun reloadCurrentItem(server: ReceiverServer) {}

    override fun load(server: ReceiverServer, request: ReceiverPlayRequest, onResult: (CastLoadResult) -> Unit) = runOnMain {
        if (stopped) {
            onResult(CastLoadResult.NotSent(STOPPED_ERROR))
            return@runOnMain
        }
        // The load before this one, still on its way, is replaced; the TV starts over on this one.
        cancelLoad?.invoke()
        pendingResult?.let { pendingResult = null; it(CastLoadResult.Settled(ReceiverLoadOutcome.Superseded)) }
        stopTicking()
        loaded = false
        stoppedFromReceiver = false
        foreignMedia = null
        pendingResult = onResult
        delegate?.onLoadingChanged(true)
        cancelLoad = schedule(PlayerConstants.FAKE_REMOTE_LOAD_MS) {
            cancelLoad = null
            pendingResult = null
            items = request.items.map { FakeRemoteItem(it.id.orEmpty(), PlayerConstants.FAKE_REMOTE_ITEM_SEC) }
            delegate?.onLoadingChanged(false)
            if (request.items.firstOrNull()?.id == PlayerConstants.FAKE_REMOTE_FAIL_ID) {
                notifyState()
                onResult(CastLoadResult.Settled(ReceiverLoadOutcome.Failed(ReceiverLoadError.PLAYBACK_FAILED, ReceiverMessage.Unparsed(FAIL_MESSAGE))))
                return@schedule
            }
            index = request.startIndex ?: 0
            position = (request.startPositionTicks ?: 0L).toDouble() / ReceiverProtocol.TICKS_PER_SECOND
            loaded = true
            delegate?.onReadyToSeek()
            if (paused) setPaused(false) else scheduleTick()
            report()
            notifyState()
            onResult(CastLoadResult.Settled(ReceiverLoadOutcome.Loaded))
        }
        notifyState()
    }

    // MARK: - Transport

    // A TV stopped from its own remote plays again from where it stopped, as the Cast engine resumes it.
    override fun play() = runOnMain { if (loaded && !stopped) resume() }
    override fun pause() = runOnMain { if (loaded && !stopped) setPaused(true) }
    override fun togglePause() = runOnMain { if (loaded && !stopped) if (paused) resume() else setPaused(true) }

    private fun resume() {
        stoppedFromReceiver = false
        setPaused(false)
        notifyState()
    }

    // MARK: - Scenes of a real TV

    /** The session suspended (the phone asleep, the app in the background): the TV plays on, unheard. */
    fun simulateSuspended() = runOnMain {
        if (stopped || suspended) return@runOnMain
        suspended = true
        delegate?.onLoadingChanged(true)
        notifyState()
    }

    /** The session back: the TV's state is heard again, where its clock went meanwhile. */
    fun simulateResumed() = runOnMain {
        if (stopped || !suspended) return@runOnMain
        suspended = false
        delegate?.onLoadingChanged(false)
        report()
        notifyState()
    }

    /** Another sender loads media our receiver does not name; the fake's own list is left behind. */
    /** The receiver names how it plays what it holds (its customData). */
    fun simulatePlayMethod(method: String?) = runOnMain {
        if (stopped) return@runOnMain
        playMethod = method
        notifyState()
    }

    fun simulateForeignMedia(title: String?, imageUrl: String?) = runOnMain {
        if (stopped) return@runOnMain
        foreignMedia = title to imageUrl
        stoppedFromReceiver = false
        notifyState()
    }

    /** Stopped from the TV's remote before the end: the item stays where it was, the session holds. */
    fun simulateStoppedFromReceiver() = runOnMain {
        if (!loaded || stopped || current == null) return@runOnMain
        stoppedFromReceiver = true
        setPaused(true)
        notifyState()
    }

    override fun seekTo(seconds: Double) = runOnMain { move(seconds)?.let { report() } }

    override fun seekToTracked(seconds: Double, exact: Boolean, requestId: Long) = runOnMain {
        move(seconds)?.let { delegate?.onSeekCompleted(requestId, position, duration, 0.0) }
    }

    override fun seekBy(seconds: Double) = runOnMain { move(position + seconds)?.let { report() } }

    override fun setSpeed(speed: Double) {}
    override fun getSpeed() = 1.0
    override fun setMute(muted: Boolean) {}
    override fun getChapters() = emptyList<Map<String, Any>>()

    // MARK: - Queue

    override fun skipToNext() = runOnMain { if (loaded && !stopped) moveTo(index + 1) }
    override fun skipToPrevious() = runOnMain { if (loaded && !stopped) moveTo(maxOf(0, index - 1)) }
    override fun setTargetVolume(level: Double) = runOnMain { volume = level.coerceIn(0.0, 1.0) }

    // MARK: - Tracks and audio: the fake has none

    override fun getSubtitleTracks() = emptyList<Map<String, Any>>()
    override fun setSubtitleTrack(trackId: Int) {}
    override fun disableSubtitles() {}
    override fun getCurrentSubtitleTrack() = -1
    override fun addSubtitleFile(url: String, select: Boolean) {}
    override fun getAudioTracks() = emptyList<Map<String, Any>>()
    override fun setAudioTrack(trackId: Int) {}
    override fun getCurrentAudioTrack() = -1
    override fun setAudioDelay(seconds: Double) {}
    override fun setVolumeBoost(percent: Int) {}
    override fun setDialogueBoost(enabled: Boolean) {}
    override fun setMonoDownmix(enabled: Boolean) {}

    // MARK: - Clock

    /** The clamped position, set; null when nothing is loaded or the engine is stopped. */
    private fun move(seconds: Double): Double? {
        if (!loaded || stopped) return null
        position = seconds.coerceIn(0.0, duration)
        return position
    }

    private fun setPaused(value: Boolean) {
        if (paused == value) return
        paused = value
        delegate?.onPauseChanged(value)
        if (value) stopTicking() else scheduleTick()
        notifyState()
    }

    private fun scheduleTick() {
        if (cancelTick != null || stopped) return
        cancelTick = schedule(CastEngineConstants.PROGRESS_INTERVAL_MS) {
            cancelTick = null
            tick()
        }
    }

    private fun stopTicking() {
        cancelTick?.invoke()
        cancelTick = null
    }

    private fun tick() {
        if (stopped || paused) return
        position = minOf(position + CastEngineConstants.PROGRESS_INTERVAL_MS / 1000.0, duration)
        if (position >= duration) {
            moveTo(index + 1)
        } else {
            report()
        }
        if (!paused && current != null) scheduleTick()
    }

    // Past the last item the list is over: the fake stops its clock and says so, as a TV at the end of a queue.
    private fun moveTo(next: Int) {
        if (next >= items.size) {
            index = items.size
            position = 0.0
            paused = true
            stopTicking()
            if (!suspended) delegate?.onPlaybackEnded()
            notifyState()
            return
        }
        index = next
        position = 0.0
        report()
        notifyState()
    }

    // A suspended session hears nothing of the TV.
    private fun report() {
        if (!suspended) delegate?.onPositionChanged(position, duration, 0.0)
    }

    private fun notifyState() {
        // The foreign media too, as the iOS fake: a clip after another changes only its title and image.
        val state = listOf(phase, suspended, currentItemId, playingIndex, foreign, mediaTitle, mediaImageUrl, playMethod)
        if (state == heardState || stopped) return
        heardState = state
        onStateChanged?.invoke()
    }
}
