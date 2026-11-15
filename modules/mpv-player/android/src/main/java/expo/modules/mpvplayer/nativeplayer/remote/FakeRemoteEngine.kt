package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.cast.engine.CastEngineConstants
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.engine.ChromeEngine
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.engine.TransportEngine
import expo.modules.mpvplayer.nativeplayer.engine.VideoLoadConfig

data class FakeRemoteItem(val id: String, val durationSec: Double)

/**
 * A TV that is not there, for the remote chrome's tests and the debug probe: a list of items on a clock
 * that moves one second per progress step, with the Cast engine's transport and queue faces. It has no
 * rendering face, so the chrome reads it as remote. Every entry runs through [runOnMain], as the Cast
 * engine's do; after [stop] it announces nothing.
 */
class FakeRemoteEngine(
    private val schedule: (Long, () -> Unit) -> (() -> Unit),
    private val runOnMain: (() -> Unit) -> Unit,
    private val items: List<FakeRemoteItem> = DEFAULT_ITEMS,
) : ChromeEngine {
    companion object {
        val DEFAULT_ITEMS = (1..3).map { FakeRemoteItem("fake-episode-$it", PlayerConstants.FAKE_REMOTE_ITEM_SEC) }
    }

    override var delegate: TransportEngine.Delegate? = null
    override var playbackResumeIntent = true

    private var index = 0
    private var position = 0.0
    private var paused = true
    private var loaded = false
    private var stopped = false
    private var cancelLoad: (() -> Unit)? = null
    private var cancelTick: (() -> Unit)? = null
    private var volume = 0.5

    private val current: FakeRemoteItem? get() = items.getOrNull(index)

    override val isPausedState: Boolean get() = paused
    override val currentPosition: Double get() = position
    override val duration: Double get() = current?.durationSec ?: 0.0
    override val isTv = false
    override val canChangeSpeed = false
    override val currentItemId: String? get() = if (loaded) current?.id else null
    override val targetVolume: Double get() = volume

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
        }
    }

    override fun stop() = runOnMain {
        stopped = true
        cancelLoad?.invoke()
        cancelLoad = null
        stopTicking()
    }

    // A remote screen has no stream to load: what plays is the fake's list.
    override fun load(config: VideoLoadConfig) {}
    override fun reloadCurrentItem() {}

    // MARK: - Transport

    override fun play() = runOnMain { if (loaded && !stopped) setPaused(false) }
    override fun pause() = runOnMain { if (loaded && !stopped) setPaused(true) }
    override fun togglePause() = runOnMain { if (loaded && !stopped) setPaused(!paused) }

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
            delegate?.onPlaybackEnded()
            return
        }
        index = next
        position = 0.0
        report()
    }

    private fun report() = delegate?.onPositionChanged(position, duration, 0.0)
}
