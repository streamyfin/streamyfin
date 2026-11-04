package expo.modules.mpvplayer.nativeplayer.engine

/**
 * The face of an engine every chrome mode talks to: playback, seeking, speed, tracks,
 * state and events. A local decoder and a remote target both carry it; what needs a
 * screen lives in [RenderingEngine]. All track ids are the bridge-facing 1-based-per-kind
 * ids both local engines already speak.
 *
 * Methods documented "mpv-only" are no-ops on engines without the concept, the same
 * no-op set the JS-route ExoPlayerView already accepts.
 */
interface TransportEngine {

    /**
     * Engine → chrome callbacks. Mirrors the mpv property observations; a Media3 engine
     * drives the same set from its Player.Listener, a remote engine from the target's
     * status reports.
     */
    interface Delegate {
        fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double)
        fun onSeekCompleted(requestId: Long, position: Double, duration: Double, cacheSeconds: Double) {
            onPositionChanged(position, duration, cacheSeconds)
        }
        fun onPauseChanged(isPaused: Boolean)
        fun onLoadingChanged(isLoading: Boolean)
        fun onReadyToSeek()
        fun onTracksReady()
        fun onError(message: String)
        fun onVideoDimensionsChanged(width: Int, height: Int)
        fun onPlaybackEnded() {}
        fun onChaptersChanged(chapters: List<Map<String, Any>>) {}
        // Dead on Android (no HDR detection); kept for iOS parity.
        fun onHDRModeDetected(isHdr: Boolean, fps: Double) {}
    }

    var delegate: Delegate?

    // MARK: - Lifecycle
    fun start(owner: PlayerEngine.Owner, onStarted: () -> Unit)
    fun stop()
    var playbackResumeIntent: Boolean

    // MARK: - Loading
    fun load(config: VideoLoadConfig)
    fun reloadCurrentItem()

    // MARK: - Transport
    fun play()
    fun pause()
    fun togglePause()
    fun seekTo(seconds: Double)
    /** Shared playback deadlines require the target frame, not a nearby keyframe. */
    fun seekToExact(seconds: Double) = seekTo(seconds)
    /** Native chrome correlates decoder completion independently of ordinary progress. */
    fun seekToTracked(seconds: Double, exact: Boolean, requestId: Long) {
        if (exact) seekToExact(seconds) else seekTo(seconds)
    }
    fun seekBy(seconds: Double)
    fun setSpeed(speed: Double)
    fun getSpeed(): Double
    /** Engine mute, retained across reloads (volume left untouched). */
    fun setMute(muted: Boolean)
    fun getChapters(): List<Map<String, Any>>

    // MARK: - Tracks
    fun getSubtitleTracks(): List<Map<String, Any>>
    fun setSubtitleTrack(trackId: Int)
    fun disableSubtitles()
    fun getCurrentSubtitleTrack(): Int
    fun addSubtitleFile(url: String, select: Boolean)
    fun getAudioTracks(): List<Map<String, Any>>
    fun setAudioTrack(trackId: Int)
    fun getCurrentAudioTrack(): Int

    // MARK: - Audio processing
    fun setAudioDelay(seconds: Double)                // mpv-only; no-op elsewhere
    fun setVolumeBoost(percent: Int)                  // exo: maps to player volume
    fun setDialogueBoost(enabled: Boolean)            // mpv-only; no-op elsewhere
    fun setMonoDownmix(enabled: Boolean)              // mpv-only; no-op elsewhere

    // MARK: - State snapshots (safe to read off-main; engines cache them)
    val isPausedState: Boolean
    val currentPosition: Double
    val duration: Double
    val isTv: Boolean
}
